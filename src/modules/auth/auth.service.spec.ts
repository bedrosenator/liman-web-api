import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Tenant } from '../tenant/tenant.entity';
import { AUTH_ROLES } from './auth.constants';
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';

describe('AuthService', () => {
  let service: AuthService;
  let mockTenantRepo: { findOne: jest.Mock };
  let mockConfigService: { get: jest.Mock };

  beforeEach(async () => {
    mockTenantRepo = {
      findOne: jest.fn(),
    };
    mockConfigService = {
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: getRepositoryToken(Tenant),
          useValue: mockTenantRepo,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('validateKey', () => {
    it('должен выбрасывать UnauthorizedException при пустом ключе', async () => {
      await expect(service.validateKey('')).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.validateKey('   ')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('должен авторизовывать superadmin при совпадении с Master API Key', async () => {
      mockConfigService.get.mockReturnValue('master-secret-key-123');

      const result = await service.validateKey('master-secret-key-123');

      expect(result).toEqual({ role: AUTH_ROLES.SUPERADMIN });
      expect(mockTenantRepo.findOne).not.toHaveBeenCalled();
    });

    it('должен авторизовывать активного тенанта по его apiKey', async () => {
      mockConfigService.get.mockReturnValue('master-secret-key-123');
      const fakeTenant = {
        id: 'columb',
        name: 'Колумб Маркет',
        apiKey: 'tenant-key-456',
        isActive: true,
      };
      mockTenantRepo.findOne.mockResolvedValue(fakeTenant);

      const result = await service.validateKey('tenant-key-456');

      expect(result).toEqual({
        role: AUTH_ROLES.TENANT,
        tenantId: 'columb',
        tenantName: 'Колумб Маркет',
      });
      expect(mockTenantRepo.findOne).toHaveBeenCalledWith({
        where: { apiKey: 'tenant-key-456' },
      });
    });

    it('должен выбрасывать ошибку если тенант деактивирован', async () => {
      mockConfigService.get.mockReturnValue('master-secret-key-123');
      const fakeTenant = {
        id: 'columb',
        name: 'Колумб Маркет',
        apiKey: 'tenant-key-456',
        isActive: false,
      };
      mockTenantRepo.findOne.mockResolvedValue(fakeTenant);

      await expect(service.validateKey('tenant-key-456')).rejects.toThrow(
        'Магазин деактивирован. Обратитесь к администратору',
      );
    });

    it('должен выбрасывать ошибку при неверном ключе', async () => {
      mockConfigService.get.mockReturnValue('master-secret-key-123');
      mockTenantRepo.findOne.mockResolvedValue(null);

      await expect(service.validateKey('unknown-key')).rejects.toThrow(
        'Неверный пароль или ключ доступа',
      );
    });
  });

  describe('getProfileFromRequest', () => {
    it('должен возвращать superadmin профиль если request.isMasterKey === true', () => {
      const req = { isMasterKey: true } as AuthenticatedRequest;
      expect(service.getProfileFromRequest(req)).toEqual({
        role: AUTH_ROLES.SUPERADMIN,
      });
    });

    it('должен возвращать tenant профиль если request.tenant присутствует', () => {
      const req = {
        tenant: { id: 'columb', name: 'Колумб' },
      } as AuthenticatedRequest;

      expect(service.getProfileFromRequest(req)).toEqual({
        role: AUTH_ROLES.TENANT,
        tenantId: 'columb',
        tenantName: 'Колумб',
      });
    });

    it('должен выбрасывать UnauthorizedException если запрос не аутентифицирован', () => {
      const req = {} as AuthenticatedRequest;
      expect(() => service.getProfileFromRequest(req)).toThrow(
        UnauthorizedException,
      );
    });
  });
});
