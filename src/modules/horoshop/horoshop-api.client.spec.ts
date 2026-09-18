import { Test, TestingModule } from '@nestjs/testing';
import { HoroshopApiClient, HOROSHOP_CONSTANTS } from './horoshop-api.client';
import { HoroshopAuthService } from './horoshop-auth.service';
import { Tenant } from '../tenant/tenant.entity';
import { HttpException, HttpStatus, BadRequestException } from '@nestjs/common';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('HoroshopApiClient (Transient Retry & Reliability)', () => {
  let client: HoroshopApiClient;
  let authService: jest.Mocked<HoroshopAuthService>;
  let mockAxiosInstance: any;

  const mockTenant: Tenant = {
    id: 'columb',
    name: 'Columb Shop',
    horoshopDomain: 'shop724088.horoshop.ua',
    horoshopLogin: 'liman_api',
    horoshopPassword: 'secretpassword',
  } as Tenant;

  beforeEach(async () => {
    mockAxiosInstance = {
      post: jest.fn(),
    };
    mockedAxios.create.mockReturnValue(mockAxiosInstance);

    const mockAuthService = {
      getToken: jest.fn().mockResolvedValue('test_valid_jwt_token'),
      clearToken: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HoroshopApiClient,
        { provide: HoroshopAuthService, useValue: mockAuthService },
      ],
    }).compile();

    client = module.get<HoroshopApiClient>(HoroshopApiClient);
    authService = module.get(HoroshopAuthService);

    // Speed up sleep in tests
    (client as any).sleep = jest.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should successfully make request on first attempt', async () => {
    mockAxiosInstance.post.mockResolvedValueOnce({
      data: {
        status: 'OK',
        response: { log: [{ article: '101', info: [{ code: 0 }] }] },
      },
    });

    const res = await client.updateStocksAndPrices(mockTenant, [
      { article: '101', price: 100, stock: 5 },
    ]);

    expect(mockAxiosInstance.post).toHaveBeenCalledTimes(1);
    expect(res.success).toBe(true);
    expect(res.updated).toBe(1);
  });

  it('should retry on HTTP 503 and succeed when subsequent attempt succeeds', async () => {
    const error503 = {
      response: {
        status: 503,
        data: { message: 'upstream connect error or disconnect/reset before headers' },
      },
      message: 'Request failed with status code 503',
    };

    const successResponse = {
      data: {
        status: 'OK',
        response: { log: [{ article: '101', info: [{ code: 0 }] }] },
      },
    };

    // First attempt fails with 503, second attempt succeeds
    mockAxiosInstance.post
      .mockRejectedValueOnce(error503)
      .mockResolvedValueOnce(successResponse);

    const res = await client.updateStocksAndPrices(mockTenant, [
      { article: '101', price: 100, stock: 5 },
    ]);

    expect(mockAxiosInstance.post).toHaveBeenCalledTimes(2);
    expect((client as any).sleep).toHaveBeenCalledTimes(1);
    expect(res.success).toBe(true);
    expect(res.updated).toBe(1);
  });

  it('should retry on ECONNRESET network error and succeed', async () => {
    const networkError = {
      code: 'ECONNRESET',
      message: 'read ECONNRESET',
    };

    const successResponse = {
      data: {
        status: 'OK',
        response: { log: [{ article: '102', info: [{ code: 0 }] }] },
      },
    };

    mockAxiosInstance.post
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce(successResponse);

    const res = await client.updateStocksAndPrices(mockTenant, [
      { article: '102', price: 200, stock: 10 },
    ]);

    expect(mockAxiosInstance.post).toHaveBeenCalledTimes(2);
    expect((client as any).sleep).toHaveBeenCalledTimes(1);
    expect(res.success).toBe(true);
  });

  it('should throw HttpException after exhausting all 3 retries on persistent 503', async () => {
    const error503 = {
      response: {
        status: 503,
        data: { message: 'Service Unavailable' },
      },
      message: 'Request failed with status code 503',
    };

    // Initial attempt + 3 retries = 4 calls total
    mockAxiosInstance.post
      .mockRejectedValueOnce(error503)
      .mockRejectedValueOnce(error503)
      .mockRejectedValueOnce(error503)
      .mockRejectedValueOnce(error503);

    await expect(
      client.updateStocksAndPrices(mockTenant, [
        { article: '103', price: 300, stock: 1 },
      ]),
    ).rejects.toThrow(HttpException);

    expect(mockAxiosInstance.post).toHaveBeenCalledTimes(4);
    expect((client as any).sleep).toHaveBeenCalledTimes(3);
  });

  it('should NOT retry on 400 Bad Request business error', async () => {
    const error400 = {
      response: {
        status: 400,
        data: { message: 'Invalid article format' },
      },
      message: 'Request failed with status code 400',
    };

    mockAxiosInstance.post.mockRejectedValueOnce(error400);

    await expect(
      client.updateStocksAndPrices(mockTenant, [
        { article: 'bad', price: 0, stock: 0 },
      ]),
    ).rejects.toThrow(HttpException);

    expect(mockAxiosInstance.post).toHaveBeenCalledTimes(1);
    expect((client as any).sleep).not.toHaveBeenCalled();
  });

  it('should refresh token on 401 Unauthorized and retry once', async () => {
    const error401 = {
      response: {
        status: 401,
        data: { message: 'Auth required' },
      },
    };

    const successResponse = {
      data: {
        status: 'OK',
        response: { log: [{ article: '105', info: [{ code: 0 }] }] },
      },
    };

    mockAxiosInstance.post
      .mockRejectedValueOnce(error401)
      .mockResolvedValueOnce(successResponse);

    const res = await client.updateStocksAndPrices(mockTenant, [
      { article: '105', price: 50, stock: 2 },
    ]);

    expect(authService.clearToken).toHaveBeenCalledWith('columb');
    expect(mockAxiosInstance.post).toHaveBeenCalledTimes(2);
    expect(res.success).toBe(true);
  });
});
