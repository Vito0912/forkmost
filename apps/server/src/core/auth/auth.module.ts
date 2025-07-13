import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './services/auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { WorkspaceModule } from '../workspace/workspace.module';
import { SignupService } from './services/signup.service';
import { TokenModule } from './token.module';
import { TotpService } from './services/totp.service';
import { OidcService } from './services/oidc.service';
import { OidcConfigService } from './services/oidc-config.service';
import { OidcController } from './controllers/oidc.controller';
import { OidcProviderController } from './controllers/oidc-provider.controller';
import { AuthProviderRepo } from '../../database/repos/auth-provider/auth-provider.repo';
import { AuthAccountRepo } from '../../database/repos/auth-account/auth-account.repo';

@Module({
  imports: [TokenModule, WorkspaceModule],
  controllers: [AuthController, OidcController, OidcProviderController],
  providers: [
    AuthService,
    SignupService,
    JwtStrategy,
    OidcService,
    OidcConfigService,
    AuthProviderRepo,
    AuthAccountRepo,
    TotpService
  ],
  exports: [SignupService, OidcService],
})
export class AuthModule {}
