import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EnvironmentService } from '../environment/environment.service';
import { VersionController } from './version.controller';
import { VersionService } from './version.service';

describe('VersionController', () => {
  let controller: VersionController;
  let versionService: { getVersion: jest.Mock };
  let environmentService: { isCloud: jest.Mock };

  beforeEach(async () => {
    versionService = {
      getVersion: jest.fn(),
    };

    environmentService = {
      isCloud: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VersionController],
      providers: [
        { provide: VersionService, useValue: versionService },
        { provide: EnvironmentService, useValue: environmentService },
      ],
    }).compile();

    controller = module.get<VersionController>(VersionController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /version', () => {
    it('returns version when environment is not cloud', async () => {
      const versionPayload = { version: '1.2.3', buildHash: 'abc123' };
      environmentService.isCloud.mockReturnValue(false);
      versionService.getVersion.mockResolvedValue(versionPayload);

      const result = await controller.getVersion();

      expect(environmentService.isCloud).toHaveBeenCalledTimes(1);
      expect(versionService.getVersion).toHaveBeenCalledTimes(1);
      expect(result).toEqual(versionPayload);
    });

    it('throws NotFoundException in cloud environment', async () => {
      environmentService.isCloud.mockReturnValue(true);

      await expect(controller.getVersion()).rejects.toThrow(NotFoundException);
      expect(versionService.getVersion).not.toHaveBeenCalled();
    });

    it('propagates errors from version service', async () => {
      environmentService.isCloud.mockReturnValue(false);
      versionService.getVersion.mockRejectedValue(new Error('version failure'));

      await expect(controller.getVersion()).rejects.toThrow('version failure');
    });
  });
});
