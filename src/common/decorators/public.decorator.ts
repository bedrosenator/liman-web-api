import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Помечает эндпоинт как публичный — пропускается через ApiKeyGuard без проверки ключа.
 * Используется для: /health, /media/...jpg, /prom/.../feed.xml
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
