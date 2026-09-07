import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min } from 'class-validator';

export class UpdateStockDto {
  @ApiProperty({
    example: 25.0,
    description: 'Новый остаток товара на складе (неотрицательное число)',
  })
  @IsNumber()
  @Min(0, { message: 'Остаток товара не может быть отрицательным' })
  stock!: number;
}
