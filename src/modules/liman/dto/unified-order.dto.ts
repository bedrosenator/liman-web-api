import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsArray,
  IsIn,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Одна позиция в унифицированном заказе.
 * externalArticle может быть как числовым строковым tcod («251»),
 * так и строковым артикулом внешней системы («ELE-23-0557»).
 */
export class UnifiedOrderLineItemDto {
  @ApiProperty({
    example: 'ELE-23-0557',
    description:
      'Артикул товара из внешней системы (строковый или числовой tcod)',
  })
  @IsString()
  @IsNotEmpty()
  externalArticle!: string;

  @ApiPropertyOptional({
    example: 'iPhone 13 Pro Max 256GB Graphite',
    description: 'Наименование товара из внешней системы',
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ example: 1, description: 'Количество единиц товара' })
  @IsNumber()
  quantity!: number;

  @ApiProperty({ example: 42999.0, description: 'Цена за единицу' })
  @IsNumber()
  price!: number;

  @ApiPropertyOptional({
    example: 0,
    description: 'Скидка на позицию (сумма, не процент)',
  })
  @IsNumber()
  @IsOptional()
  discount?: number;
}

/**
 * Унифицированный входящий заказ — Anti-Corruption Layer (ACL).
 *
 * Служит единым языком между внешними платформами (Хорошоп, WooCommerce,
 * Prom.ua, Rozetka) и доменным сервисом LimanOrderService.
 *
 * Создаётся адаптером-маппером конкретного канала (напр. HoroshopSyncService)
 * перед передачей в LimanOrderService.processIncomingOrder.
 */
export class UnifiedIncomingOrderDto {
  @ApiProperty({
    example: 'horoshop',
    enum: ['horoshop', 'woocommerce', 'prom', 'rozetka'],
    description: 'Источник заказа',
  })
  @IsString()
  @IsIn(['horoshop', 'woocommerce', 'prom', 'rozetka'])
  source!: 'horoshop' | 'woocommerce' | 'prom' | 'rozetka';

  @ApiProperty({ example: '10421', description: 'ID заказа в внешней системе' })
  @IsString()
  @IsNotEmpty()
  externalOrderId!: string;

  @ApiPropertyOptional({
    example: 'Фыва Фыва',
    description: 'ФИО покупателя',
  })
  @IsString()
  @IsOptional()
  customerName?: string;

  @ApiPropertyOptional({
    example: '+380671234567',
    description: 'Номер телефона покупателя',
  })
  @IsString()
  @IsOptional()
  customerPhone?: string;

  @ApiPropertyOptional({
    example: 'client@example.com',
    description: 'Email покупателя',
  })
  @IsString()
  @IsOptional()
  customerEmail?: string;

  @ApiPropertyOptional({
    example: 'Нова Пошта, відділення 12, м. Харків',
    description: 'Адрес доставки (полный текст)',
  })
  @IsString()
  @IsOptional()
  deliveryAddress?: string;

  @ApiPropertyOptional({
    example: 'nova_poshta',
    enum: ['nova_poshta', 'ukrposhta', 'selfpickup', 'courier', 'other'],
    description: 'Служба доставки',
  })
  @IsString()
  @IsOptional()
  deliveryService?: string;

  @ApiPropertyOptional({
    example: '12',
    description: 'Номер отделения Новой Почты',
  })
  @IsString()
  @IsOptional()
  deliveryWarehouse?: string;

  @ApiPropertyOptional({
    example: 'Оплата при получении',
    description: 'Способ оплаты',
  })
  @IsString()
  @IsOptional()
  paymentMethod?: string;

  @ApiPropertyOptional({
    example: 42999.0,
    description: 'Итоговая сумма заказа',
  })
  @IsNumber()
  @IsOptional()
  totalAmount?: number;

  @ApiPropertyOptional({
    example: 'UAH',
    description: 'Валюта заказа',
    default: 'UAH',
  })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiProperty({
    type: [UnifiedOrderLineItemDto],
    description: 'Позиции заказа',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UnifiedOrderLineItemDto)
  lineItems!: UnifiedOrderLineItemDto[];

  @ApiPropertyOptional({
    description:
      'Оригинальный payload запроса для аудита и отладки',
  })
  @IsOptional()
  rawPayload?: any;
}
