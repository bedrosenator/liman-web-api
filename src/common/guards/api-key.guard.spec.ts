import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { ApiKeyGuard } from './api-key.guard';
import { Tenant } from '../../modules/tenant/tenant.entity';

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard;
  let reflector: jest.Mocked<Reflector>;
  let configService: jest.Mocked<ConfigService>;
  let tenantRepository: jest.Mocked<Repository<Tenant>>;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as any;

    configService = {
      get: jest.fn(),
    } as any;

    tenantRepository = {
      findOne: jest.fn(),
    } as any;

    guard = new ApiKeyGuard(reflector, configService, tenantRepository);
  });

  function createMockContext(req: Record<string, any>): ExecutionContext {
    req.headers = req.headers || {};
    req.params = req.params || {};
    req.method = req.method || 'GET';
    req.path = req.path || '/api/v1/liman/columb/products';

    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => req,
      }),
    } as any;
  }

  it('should allow access if route is decorated with @Public()', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const context = createMockContext({});

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('should throw UnauthorizedException if x-api-key header is missing', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const context = createMockContext({ headers: {} });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('should allow access and set isMasterKey if valid master API key is provided', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    configService.get.mockReturnValue('master-secret-key');

    const req: Record<string, any> = {
      headers: { 'x-api-key': 'master-secret-key' },
    };
    const context = createMockContext(req);

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(req.isMasterKey).toBe(true);
  });

  it('should allow access if valid tenant API key is provided and tenantId matches', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    configService.get.mockReturnValue('master-secret-key');

    const mockTenant: Partial<Tenant> = {
      id: 'columb',
      name: 'Columb Shop',
      apiKey: 'tenant-key-123',
      isActive: true,
    };
    tenantRepository.findOne.mockResolvedValue(mockTenant as Tenant);

    const req: Record<string, any> = {
      headers: { 'x-api-key': 'tenant-key-123' },
      params: { tenantId: 'columb' },
      path: '/api/v1/liman/columb/products',
    };
    const context = createMockContext(req);

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(req.tenant).toEqual(mockTenant);
  });

  it('should block access (IDOR protection) when tenant key attempts to access another tenant resources', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    configService.get.mockReturnValue('master-secret-key');

    const mockTenant: Partial<Tenant> = {
      id: 'columb',
      apiKey: 'tenant-key-123',
      isActive: true,
    };
    tenantRepository.findOne.mockResolvedValue(mockTenant as Tenant);

    const req: Record<string, any> = {
      headers: { 'x-api-key': 'tenant-key-123' },
      params: { tenantId: 'other-shop' },
      path: '/api/v1/liman/other-shop/products',
    };
    const context = createMockContext(req);

    await expect(guard.canActivate(context)).rejects.toThrow(
      'Доступ запрещен: ваш API-ключ принадлежит тенанту "columb", а не "other-shop"',
    );
  });

  it('should block tenant key from listing all tenants via /api/v1/tenants', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    configService.get.mockReturnValue('master-secret-key');

    const mockTenant: Partial<Tenant> = {
      id: 'columb',
      apiKey: 'tenant-key-123',
      isActive: true,
    };
    tenantRepository.findOne.mockResolvedValue(mockTenant as Tenant);

    const req: Record<string, any> = {
      headers: { 'x-api-key': 'tenant-key-123' },
      params: {},
      method: 'GET',
      path: '/api/v1/tenants',
    };
    const context = createMockContext(req);

    await expect(guard.canActivate(context)).rejects.toThrow(
      'Управление списком тенантов доступно только по Master API Key',
    );
  });

  it('should allow tenant key to view own profile at /api/v1/tenants/:id', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    configService.get.mockReturnValue('master-secret-key');

    const mockTenant: Partial<Tenant> = {
      id: 'columb',
      apiKey: 'tenant-key-123',
      isActive: true,
    };
    tenantRepository.findOne.mockResolvedValue(mockTenant as Tenant);

    const req: Record<string, any> = {
      headers: { 'x-api-key': 'tenant-key-123' },
      params: { id: 'columb' },
      method: 'GET',
      path: '/api/v1/tenants/columb',
    };
    const context = createMockContext(req);

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('should throw UnauthorizedException if API key is invalid or tenant is inactive', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    configService.get.mockReturnValue('master-secret-key');
    tenantRepository.findOne.mockResolvedValue(null);

    const req: Record<string, any> = {
      headers: { 'x-api-key': 'unknown-key' },
    };
    const context = createMockContext(req);

    await expect(guard.canActivate(context)).rejects.toThrow('Неверный или отозванный API ключ');
  });
});
