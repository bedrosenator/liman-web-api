import { Controller, Post, Get, Body, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { Public } from '../../common/decorators/public.decorator';
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('login')
  @Public()
  @ApiOperation({
    summary: 'Авторизация по Master API Key или ключу магазина',
    description:
      'Проверяет переданный ключ и возвращает роль (superadmin / tenant) и параметры магазина.',
  })
  @ApiResponse({
    status: 200,
    description: 'Успешная авторизация',
    type: LoginResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Неверный ключ доступа или магазин деактивирован',
  })
  async login(@Body() loginDto: LoginDto): Promise<LoginResponseDto> {
    return this.authService.validateKey(loginDto.key);
  }

  @Get('me')
  @ApiSecurity('x-api-key')
  @ApiOperation({
    summary: 'Получить профиль текущей активной сессии',
    description:
      'Использует заголовок x-api-key для определения текущей роли и параметров магазина.',
  })
  @ApiResponse({
    status: 200,
    description: 'Профиль текущего пользователя',
    type: LoginResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Неавторизованный запрос',
  })
  getMe(@Req() req: AuthenticatedRequest): LoginResponseDto {
    return this.authService.getProfileFromRequest(req);
  }
}
