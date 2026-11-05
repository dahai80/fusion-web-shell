import { describe, expect, it } from 'bun:test';
import {
    HttpError,
    TimeoutError,
    isQuotaExceededError,
    isRetryableError,
    withRetry,
    withTimeout,
} from '../src/retry';

describe('isRetryableError', () => {
    it('retries timeouts and 5xx/429, not 4xx', () => {
        expect(isRetryableError(new TimeoutError(1000))).toBe(true);
        expect(isRetryableError(new HttpError(502, 'x', 'x'))).toBe(true);
        expect(isRetryableError(new HttpError(429, 'x', 'x'))).toBe(true);
        expect(isRetryableError(new HttpError(403, 'x', 'x'))).toBe(false);
        expect(isRetryableError(new HttpError(401, 'x', 'x'))).toBe(false);
        expect(isRetryableError(new Error('network'))).toBe(true);
    });
});

describe('withTimeout', () => {
    it('rejects on timeout', async () => {
        await expect(withTimeout(new Promise(() => undefined), 10)).rejects.toThrow('timed out');
    });
    it('resolves under timeout', async () => {
        expect(await withTimeout(Promise.resolve(42), 500)).toBe(42);
    });
});

describe('withRetry', () => {
    it('does not retry non-retryable errors', async () => {
        let calls = 0;
        await expect(
            withRetry(
                () => {
                    calls++;
                    throw new HttpError(403, 'forbidden', 'no');
                },
                { retries: 3, timeoutMs: 100 }
            )
        ).rejects.toThrow('no');
        expect(calls).toBe(1);
    });
    it('retries until success', async () => {
        let calls = 0;
        const result = await withRetry(
            () => {
                calls++;
                if (calls < 3) throw new Error('flaky');
                return Promise.resolve('ok');
            },
            { retries: 3, timeoutMs: 100, backoffMs: 1 }
        );
        expect(result).toBe('ok');
        expect(calls).toBe(3);
    });
    it('gives up after retries exhausted', async () => {
        let calls = 0;
        await expect(
            withRetry(
                () => {
                    calls++;
                    throw new Error('always');
                },
                { retries: 2, timeoutMs: 100, backoffMs: 1 }
            )
        ).rejects.toThrow('always');
        expect(calls).toBe(3);
    });
});

// Issue #130: daily token quota 429 is terminal — classify it and never
// retry it (the budget is spent until tomorrow).
describe('isQuotaExceededError (#130)', () => {
    it('matches the meter rejection shapes', () => {
        expect(isQuotaExceededError(new HttpError(429, 'daily_quota_exceeded', 'x'))).toBe(true);
        const meter = Object.assign(new Error('daily token quota exceeded'), { status: 429 });
        expect(isQuotaExceededError(meter)).toBe(true);
        const envd = Object.assign(new Error('quota'), {
            status: 429,
            envelope: { detail: 'daily token quota exceeded', quota: { used: 1 } },
        });
        expect(isQuotaExceededError(envd)).toBe(true);
    });
    it('does not match other 429s or other statuses', () => {
        expect(isQuotaExceededError(new HttpError(429, 'x', 'x'))).toBe(false);
        expect(isQuotaExceededError(new HttpError(500, 'daily_quota_exceeded', 'x'))).toBe(false);
        expect(isQuotaExceededError(new TimeoutError(10))).toBe(false);
        expect(isQuotaExceededError(null)).toBe(false);
    });
    it('withRetry does not retry quota exhaustion', async () => {
        let calls = 0;
        await expect(
            withRetry(
                () => {
                    calls++;
                    throw new HttpError(429, 'daily_quota_exceeded', 'daily token quota exceeded');
                },
                { retries: 3, timeoutMs: 100 }
            )
        ).rejects.toThrow('daily token quota exceeded');
        expect(calls).toBe(1);
    });
});
