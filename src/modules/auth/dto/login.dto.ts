import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'Master API Key суперадминистратора или API-ключ магазина (клиента)',
    example: 'liman-secret-key-12345',
  })
  @IsString()
  @IsNotEmpty()
  key!: string;
}
