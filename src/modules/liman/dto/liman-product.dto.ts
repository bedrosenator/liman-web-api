import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LimanCategoryDto {
  @ApiProperty({ example: '101', description: 'Код группы (таблица name)' })
  group!: string;

  @ApiProperty({ example: 'Напои', description: 'Название категории' })
  name!: string;

  @ApiPropertyOptional({ example: '100', description: 'Родительская категория' })
  parent?: string | null;
}

export class LimanProductDto {
  @ApiProperty({ example: 251, description: 'Уникальный артикул / код товара (tcod)' })
  tcod!: number;

  @ApiPropertyOptional({ example: '5060466511019', description: 'Основной штрихкод (nnom)' })
  barcode?: string;

  @ApiProperty({ example: 'Burn 0.25 Ж/Б Original', description: 'Наименование товара' })
  name!: string;

  @ApiPropertyOptional({ example: '101', description: 'Код категории (group)' })
  categoryGroup?: string;

  @ApiProperty({ example: 47.0, description: 'Розничная цена (cena2)' })
  price!: number;

  @ApiPropertyOptional({ example: 35.7, description: 'Цена закупки (cena1)' })
  purchasePrice?: number;

  @ApiProperty({ example: 15.0, description: 'Остаток основного склада (skl_k)' })
  stock!: number;

  @ApiProperty({ example: true, description: 'В наличии (stock > 0)' })
  isAvailable!: boolean;

  @ApiPropertyOptional({ description: 'Описание товара' })
  description?: string;

  @ApiPropertyOptional({
    example: ['http://localhost:3000/api/v1/media/columb/products/251/1.jpg'],
    description: 'Ссылки на фотографии товара',
  })
  imageUrls?: string[];

  @ApiPropertyOptional({ description: 'Дополнительные штрихкоды из таблицы strihcod' })
  barcodes?: string[];
}
