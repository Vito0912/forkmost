import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TOTP, Secret } from 'otpauth';
import * as QRCode from 'qrcode';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import { hashFastCodes, hashPassword } from '../../../common/helpers/utils';
import { executeTx } from '@docmost/db/utils';
import { InitMfaDto, MfaType, VerifyMfaDto } from '../dto/login.dto';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { InjectKysely } from 'nestjs-kysely';
import { MailService } from 'src/integrations/mail/mail.service';
import MfaCodeEmail from '@docmost/transactional/emails/mfa-code-email';
import { User } from '@docmost/db/types/entity.types';

export interface TotpSetup {
  secret: string;
  qrCodeDataUrl: string;
}

export interface EmailSetup {
  secret: string;
  expiresAt: Date;
}

@Injectable()
export class MfaService {
  constructor(
    private readonly environmentService: EnvironmentService, 
    private mailService: MailService,
    @InjectKysely() private readonly db: KyselyDB,) {}

  async initMfa(userId: string, workspaceId: string, initMfaDto: InitMfaDto) {

    let sharedPayload: TotpSetup | EmailSetup;
    let payload = sharedPayload;

    switch (initMfaDto.type) {
      case MfaType.TOTP: {
        payload = await this.generateTotp(userId, workspaceId);
        sharedPayload = payload;
        break;
      }
      case MfaType.EMAIL: {
        payload = await this.generateEmailSetup();
        break;
      }
    }

    if (!payload || !payload.secret) {
      throw new BadRequestException('Failed to generate MFA secret');
    }

    try {
      await executeTx(this.db, async (trx) => {
        await this.db
          .deleteFrom('mfa')
          .where('userId', '=', userId)
          .where('type', '=', initMfaDto.type)
          .where('enabled', '=', false)
          .where('verified', '=', false)
          .execute();

        await this.db
          .insertInto('mfa')
          .values({
            userId: userId,
            type: initMfaDto.type,
            secret: this.encrypt(payload.secret),
            enabled: false,
            verified: false,
          })
          .executeTakeFirstOrThrow();
      });
    } catch (error) {
      throw new BadRequestException('MFA already exists for this user');
    }

    return {
      type: initMfaDto.type,
      ...sharedPayload,
    } 
  }

  getMfa(userId: string, workspaceId: string) {
    return this.db
      .selectFrom('mfa')
      .select(['enabled', 'verified', 'type'])
      .where('userId', '=', userId)
      .where('enabled', '=', true)
      .where('verified', '=', true)
      .execute();
  }

  async verifyMfa(
    userId: string,
    workspaceId: string,
    verifyMfaDto: VerifyMfaDto,
  ) {
    // Get last MFA record for the user with given type
    // @ts-ignore
    const mfa: Mfa | null = await this.db
      .selectFrom('mfa')
      .selectAll()
      .where('userId', '=', userId)
      .where('type', '=', verifyMfaDto.type)
      .limit(1)
      .executeTakeFirst();

    if (!mfa || !mfa.secret) {
      throw new NotFoundException('MFA not found for this user');
    }

    switch (verifyMfaDto.type) {
      case MfaType.TOTP: {
        const isValid = this.verifyTotp(
          verifyMfaDto.code,
          this.decrypt(mfa.secret),
        );

        if (!isValid) {
          throw new BadRequestException('Invalid TOTP code');
        }

        await this.db
          .updateTable('mfa')
          .set({ enabled: true, verified: true })
          .where('userId', '=', userId)
          .where('type', '=', MfaType.TOTP)
          .executeTakeFirst();

        return { success: true, message: 'TOTP MFA enabled successfully' };
      }
      case MfaType.EMAIL: {
        const isValid = await this.verifyEmailCode(
          verifyMfaDto.code,
          this.decrypt(mfa.secret),
          userId
        );

        if (!isValid) {
          throw new BadRequestException('Invalid email code');
        }

        await this.db
          .updateTable('mfa')
          .set({ enabled: true, verified: true })
          .where('userId', '=', userId)
          .where('type', '=', MfaType.EMAIL)
          .executeTakeFirst();
      }
    }
  }

  async generateTotp(userEmail: string, serviceName = 'Forkmost'): Promise<TotpSetup> {
    const secret = new Secret().base32;
    
    const totp = new TOTP({
      issuer: serviceName,
      label: userEmail,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: secret,
    });

    const qrCodeDataUrl = await QRCode.toDataURL(totp.toString());

    return {
      secret,
      qrCodeDataUrl,
    };
  }

  async generateEmailSetup(user: User): Promise<EmailSetup> {
    const secret = crypto.randomBytes(3).toString('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    const payload: EmailSetup = {
      secret,
      expiresAt,
    };

    const mfaMail = MfaCodeEmail({
      code: secret,
    });

    await this.db
      .updateTable('mfa')
      .set({
        secret: this.encrypt(JSON.stringify(payload)),
      })
      .where('userId', '=', user.id)
      .where('type', '=', MfaType.EMAIL)
      .where('enabled', '=', false)
      .where('verified', '=', false)
      .executeTakeFirstOrThrow();

    await this.mailService.sendToQueue({
      to: user.email,
      subject: `Your MFA code`,
      template: mfaMail,
    });

    return payload;
  }

  verifyTotp(code: string, secret: string): boolean {
    try {
      const totp = new TOTP({
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: secret,
      });

      // Validate code with a window of +-1 period (90 seconds total)
      return totp.validate({ token: code, window: 1 }) !== null;
    } catch {
      return false;
    }
  }

  verifyTotpWithSecret(code: string, secret: string, backupCodes: any[]): boolean {

    const decodedSecret = this.decrypt(secret);

    if (this.verifyTotp(code, decodedSecret)) {
      return true;
    }

    /*for (const code of backupCodes) {
      if (this.verifyTotp(token, code)) {
        return true;
      }
    }*/

    return false;    
  }

  async verifyEmailCode(code: string, secret: string, userId: string): Promise<boolean> {
    const decryptedSecret = this.decrypt(secret) as unknown as EmailSetup;
    if (decryptedSecret && decryptedSecret.expiresAt && new Date() < decryptedSecret.expiresAt) {
      const result = (decryptedSecret.secret === code);
      if (result) {
        await this.db
          .updateTable('mfa')
          .set({ secret: null })
          .where('userId', '=', userId)
          .where('type', '=', MfaType.EMAIL)
          .executeTakeFirst();
      }
      return result;
    }
    return false;
  }

  generateBackupCodes(): string[] {
    const codes: string[] = [];
    for (let i = 0; i < 8; i++) {
      codes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
    }
    return codes;
  }

  async hashBackupCodes(codes: string[]): Promise<string[]> {
    const hashedCodes = [];
    for (const code of codes) {
      const hashedCode = await hashFastCodes(code.toUpperCase());
      hashedCodes.push(hashedCode);
    }
    return hashedCodes;
  }


  async verifyBackupCode(code: string, hashedCodes: string[]): Promise<{ isValid: boolean; codeIndex: number }> {
    if (code.length !== 8) {
      return { isValid: false, codeIndex: -1 };
    }

    const upperCode = code.toUpperCase();
    
    for (let i = 0; i < hashedCodes.length; i++) {
      try {
        const isMatch = await bcrypt.compare(upperCode, hashedCodes[i]);
        if (isMatch) {
          return { isValid: true, codeIndex: i };
        }
      } catch (error) {
        continue;
      }
    }
    
    return { isValid: false, codeIndex: -1 };
  }

  removeUsedBackupCode(codeIndex: number, hashedCodes: string[]): string[] {
    if (codeIndex >= 0 && codeIndex < hashedCodes.length) {
      return hashedCodes.filter((_, index) => index !== codeIndex);
    }
    return hashedCodes;
  }

  async deleteMfa(userId: string, workspaceId: string, type: MfaType): Promise<void> {
    await this.db
      .deleteFrom('mfa')
      .where('userId', '=', userId)
      .where('type', '=', type)
      .execute();
  }

  /**
   * Helper functions
   */

  encrypt(text: string): string {
    const algorithm = 'aes-256-gcm';
    const secret = this.environmentService.getAppSecret();
    const key = crypto.scryptSync(secret, 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
  }

  decrypt(encryptedText: string): string {
    const algorithm = 'aes-256-gcm';
    const secret = this.environmentService.getAppSecret();
    const key = crypto.scryptSync(secret, 'salt', 32);
    
    const [ivHex, authTagHex, encrypted] = encryptedText.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

}
