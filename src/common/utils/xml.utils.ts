/**
 * Утилиты для безопасной генерации XML/YML фидов (DRY принцип)
 */

/**
 * Экранирует специальные символы для вставки в XML-атрибуты и текстовые ноды
 */
export function escapeXml(str: string | null | undefined): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Оборачивает текст в CDATA секцию, корректно обрабатывая вложенные закрывающие теги ]]>
 */
export function wrapCdata(text: string | null | undefined): string {
  if (!text) return '<![CDATA[]]>';
  const safeText = String(text).replace(/\]\]>/g, ']]]]><![CDATA[>');
  return `<![CDATA[${safeText}]]>`;
}

/**
 * Форматирует дату в формат ISO YML: YYYY-MM-DD HH:mm:ss
 */
export function formatYmlDate(date: Date = new Date()): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}
