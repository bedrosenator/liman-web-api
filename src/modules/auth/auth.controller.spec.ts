import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AUTH_ROLES } from './auth.constants';
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';

describe('AuthController', () => {
  let controller: AuthController;
  let mockAuthService: {
    validateKey: jest.Mock;
    getProfileFromRequest: jest.Mock;
  };

  beforeEach(async () => {
    mockAuthService = {
      validateKey: jest.fn(),
      getProfileFromRequest: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  describe('login', () => {
    it('должен вызывать authService.validateKey с переданным ключом', async () => {
      const mockResult = {
        role: AUTH_ROLES.SUPERADMIN,
      };
      mockAuthService.validateKey.mockResolvedValue(mockResult);

      const response = await controller.login({ key: 'test-key' });

      expect(mockAuthService.validateKey).toHaveBeenCalledWith('test-key');
      expect(response).toEqual(mockResult);
    });
  });

  describe('getMe', () => {
    it('должен вызывать authService.getProfileFromRequest', () => {
      const mockReq = { isMasterKey: true } as AuthenticatedRequest;
      const mockResult = { role: AUTH_ROLES.SUPERADMIN };
      mockAuthService.getProfileFromRequest.mockReturnValue(mockResult);

      const response = controller.getMe(mockReq);

      expect(mockAuthService.getProfileFromRequest).toHaveBeenCalledWith(mockReq);
      expect(response).toEqual(mockResult);
    });
  });
});
