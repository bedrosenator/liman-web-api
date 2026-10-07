import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AUTH_ROLES, type AuthRoleType } from '../auth.constants';

export class LoginResponseDto {
  @ApiProperty({
    description: 'Роль авторизованного пользователя',
    enum: [AUTH_ROLES.SUPERADMIN, AUTH_ROLES.TENANT],
    example: AUTH_ROLES.SUPERADMIN,
  })
  role!: AuthRoleType;

  @ApiPropertyOptional({
    description: 'Уникальный идентификатор магазина (для роли tenant)',
    example: 'columb',
  })
  tenantId?: string;

  @ApiPropertyOptional({
    description: 'Название магазина (для роли tenant)',
    example: 'Колумб Маркет',
  })
  tenantName?: string;
}
