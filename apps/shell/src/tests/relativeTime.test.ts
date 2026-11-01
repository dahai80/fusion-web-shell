import { describe, expect, it } from 'bun:test';
import { relativeTime } from '../lib/relativeTime';

const NOW = Date.parse('2026-11-01T12:00:00Z');

describe('relativeTime (issue #86 task cards)', () => {
    it('buckets into now / minutes / hours bilingual', () => {
        expect(relativeTime(undefined, 'zh', NOW)).toBe('');
        expect(relativeTime('2026-11-01T11:59:40Z', 'zh', NOW)).toBe('刚刚');
        expect(relativeTime('2026-11-01T11:55:00Z', 'zh', NOW)).toBe('5 分钟前');
        expect(relativeTime('2026-11-01T11:55:00Z', 'en', NOW)).toBe('5m ago');
        expect(relativeTime('2026-11-01T09:00:00Z', 'zh', NOW)).toBe('3 小时前');
        expect(relativeTime('2026-11-01T09:00:00Z', 'en', NOW)).toBe('3h ago');
    });
    it('days bucket: yesterday, N days, months', () => {
        expect(relativeTime('2026-10-31T12:00:00Z', 'en', NOW)).toBe('yesterday');
        expect(relativeTime('2026-10-31T12:00:00Z', 'zh', NOW)).toBe('昨天');
        expect(relativeTime('2026-10-28T12:00:00Z', 'zh', NOW)).toBe('4 天前');
        expect(relativeTime('2026-08-01T12:00:00Z', 'zh', NOW)).toBe('3 个月前');
        expect(relativeTime('2026-08-01T12:00:00Z', 'en', NOW)).toBe('3mo ago');
    });
    it('future or malformed timestamps degrade gracefully', () => {
        expect(relativeTime('not-a-date', 'zh', NOW)).toBe('');
        expect(relativeTime('2026-11-01T13:00:00Z', 'zh', NOW)).toBe('刚刚');
    });
});
