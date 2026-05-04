// `common/helpers` transitively imports `nanoid` (ESM-only), which the repo's
// current jest config does not transform. We don't exercise any of those
// helpers in this spec, so stub the barrel out to keep this file runnable
// without touching the global jest config.
jest.mock('../../../common/helpers', () => ({
  isUserDisabled: () => false,
}));

import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import * as jwt from 'jsonwebtoken';
import { TokenService } from './token.service';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import { createMockUser } from '../../../test-utils/test-helpers';

describe('TokenService', () => {
  let service: TokenService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        // Mirror production: a module-level expiresIn default exists, intended
        // for short-lived access tokens. generateApiToken must NOT inherit it.
        JwtModule.register({
          secret: 'test-secret',
          signOptions: { expiresIn: '90d', issuer: 'Docmost' },
        }),
      ],
      providers: [
        TokenService,
        {
          provide: EnvironmentService,
          useValue: { getAppSecret: () => 'test-secret' },
        },
      ],
    }).compile();

    service = module.get<TokenService>(TokenService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateApiToken', () => {
    const user = createMockUser();

    it('uses a long-lived exp (~100y) when no expiresIn is supplied, instead of inheriting the 90d module default', async () => {
      const before = Math.floor(Date.now() / 1000);

      const token = await service.generateApiToken({
        apiKeyId: 'key-id-1',
        user,
        workspaceId: user.workspaceId,
      });

      const decoded = jwt.decode(token) as {
        exp?: number;
        iat?: number;
        type?: string;
        apiKeyId?: string;
        sub?: string;
        workspaceId?: string;
      } | null;
      expect(decoded).not.toBeNull();
      expect(decoded!.type).toBe('api_key');
      expect(decoded!.apiKeyId).toBe('key-id-1');
      expect(decoded!.sub).toBe(user.id);
      expect(decoded!.workspaceId).toBe(user.workspaceId);

      // Must NOT be the leaky 90d module default (the bug). Anything past one
      // year out is fine; we use 100y in production.
      const ninetyDaysSeconds = 90 * 24 * 60 * 60;
      const oneYearSeconds = 365 * 24 * 60 * 60;
      expect(decoded!.iat).toBeDefined();
      expect(decoded!.exp).toBeDefined();
      expect(decoded!.iat!).toBeGreaterThanOrEqual(before);
      const ttl = decoded!.exp! - decoded!.iat!;
      expect(ttl).toBeGreaterThan(oneYearSeconds);
      expect(ttl).not.toBe(ninetyDaysSeconds);
    });

    it('respects an explicit numeric expiresIn (seconds) when supplied', async () => {
      const before = Math.floor(Date.now() / 1000);

      const token = await service.generateApiToken({
        apiKeyId: 'key-id-2',
        user,
        workspaceId: user.workspaceId,
        expiresIn: 3600,
      });

      const decoded = jwt.decode(token) as { exp?: number; iat?: number } | null;
      expect(decoded).not.toBeNull();
      expect(decoded!.exp).toBeDefined();
      expect(decoded!.iat).toBeDefined();
      expect(decoded!.exp! - decoded!.iat!).toBe(3600);
      expect(decoded!.iat!).toBeGreaterThanOrEqual(before);
    });
  });
});
