import { Test, TestingModule } from '@nestjs/testing';
import { HealthCheckService } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { PostgresHealthIndicator } from './postgres.health';
import { RedisHealthIndicator } from './redis.health';

describe('HealthController', () => {
  let controller: HealthController;
  let healthCheckService: { check: jest.Mock };
  let postgresIndicator: { pingCheck: jest.Mock };
  let redisIndicator: { pingCheck: jest.Mock };

  beforeEach(async () => {
    healthCheckService = {
      check: jest.fn(),
    };

    postgresIndicator = {
      pingCheck: jest.fn(),
    };

    redisIndicator = {
      pingCheck: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: healthCheckService },
        { provide: PostgresHealthIndicator, useValue: postgresIndicator },
        { provide: RedisHealthIndicator, useValue: redisIndicator },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('GET /health', () => {
    it('returns health check result', async () => {
      const expectedResult = {
        status: 'ok',
        info: { database: { status: 'up' }, redis: { status: 'up' } },
      };
      healthCheckService.check.mockResolvedValue(expectedResult);

      const result = await controller.check();

      expect(result).toEqual(expectedResult);
    });

    it('passes two indicator callbacks to healthCheckService.check', async () => {
      healthCheckService.check.mockResolvedValue({ status: 'ok' });

      await controller.check();

      expect(healthCheckService.check).toHaveBeenCalledTimes(1);
      const callbackArray = healthCheckService.check.mock.calls[0][0];
      expect(Array.isArray(callbackArray)).toBe(true);
      expect(callbackArray).toHaveLength(2);
    });

    it('executes postgres ping check through first callback', async () => {
      postgresIndicator.pingCheck.mockResolvedValue({ database: { status: 'up' } });
      healthCheckService.check.mockImplementation(
        async (callbacks: Array<() => Promise<unknown>>) => {
          return callbacks[0]();
        },
      );

      await controller.check();

      expect(postgresIndicator.pingCheck).toHaveBeenCalledWith('database');
    });

    it('executes redis ping check through second callback', async () => {
      redisIndicator.pingCheck.mockResolvedValue({ redis: { status: 'up' } });
      healthCheckService.check.mockImplementation(
        async (callbacks: Array<() => Promise<unknown>>) => {
          return callbacks[1]();
        },
      );

      await controller.check();

      expect(redisIndicator.pingCheck).toHaveBeenCalledWith('redis');
    });

    it('executes both callbacks when health service runs them', async () => {
      postgresIndicator.pingCheck.mockResolvedValue({ database: { status: 'up' } });
      redisIndicator.pingCheck.mockResolvedValue({ redis: { status: 'up' } });
      healthCheckService.check.mockImplementation(
        async (callbacks: Array<() => Promise<unknown>>) => {
          await Promise.all(callbacks.map((callback) => callback()));
          return { status: 'ok' };
        },
      );

      await controller.check();

      expect(postgresIndicator.pingCheck).toHaveBeenCalledTimes(1);
      expect(redisIndicator.pingCheck).toHaveBeenCalledTimes(1);
    });

    it('propagates health service errors', async () => {
      healthCheckService.check.mockRejectedValue(new Error('health failure'));

      await expect(controller.check()).rejects.toThrow('health failure');
    });
  });

  describe('GET /health/live', () => {
    it('returns ok', async () => {
      await expect(controller.checkLive()).resolves.toBe('ok');
    });

    it('does not call dependency checks', async () => {
      await controller.checkLive();

      expect(healthCheckService.check).not.toHaveBeenCalled();
      expect(postgresIndicator.pingCheck).not.toHaveBeenCalled();
      expect(redisIndicator.pingCheck).not.toHaveBeenCalled();
    });
  });
});
