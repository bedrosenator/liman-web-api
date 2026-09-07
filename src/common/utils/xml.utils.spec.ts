import { escapeXml, wrapCdata, formatYmlDate } from './xml.utils';

describe('XML Utilities (DRY)', () => {
  describe('escapeXml', () => {
    it('should escape special XML characters', () => {
      const input = '<item name="test & "more" & \'single\'>';
      const expected = '&lt;item name=&quot;test &amp; &quot;more&quot; &amp; &apos;single&apos;&gt;';
      expect(escapeXml(input)).toBe(expected);
    });

    it('should handle null or undefined safely', () => {
      expect(escapeXml(null)).toBe('');
      expect(escapeXml(undefined)).toBe('');
      expect(escapeXml('')).toBe('');
    });
  });

  describe('wrapCdata', () => {
    it('should wrap text in CDATA tags', () => {
      const input = '<b>HTML description</b>';
      expect(wrapCdata(input)).toBe('<![CDATA[<b>HTML description</b>]]>');
    });

    it('should escape nested CDATA closing tags', () => {
      const input = 'Nested ]]> tag';
      expect(wrapCdata(input)).toBe('<![CDATA[Nested ]]]]><![CDATA[> tag]]>');
    });

    it('should handle empty or null string', () => {
      expect(wrapCdata(null)).toBe('<![CDATA[]]>');
      expect(wrapCdata('')).toBe('<![CDATA[]]>');
    });
  });

  describe('formatYmlDate', () => {
    it('should format date to YYYY-MM-DD HH:mm:ss format', () => {
      const fixedDate = new Date('2026-09-07T12:00:00.000Z');
      expect(formatYmlDate(fixedDate)).toBe('2026-09-07 12:00:00');
    });
  });
});
