import { describe, expect, it } from 'bun:test';
import {
    PAYLOAD_BUDGET,
    PayloadBudgetExceededError,
    assertPayloadBudget,
    createCoalescer,
    payloadBytes,
} from '../src/budget';

// Issue #135: payload budgets are pinned by constants — a test FAILS if an
// event exceeds the declared cap, so payload growth can never silently
// degrade the shell (t3code pattern).

describe('payload budget (#135)', () => {
    it('measures JSON wire size in bytes', () => {
        expect(payloadBytes({})).toBe(2);
        expect(payloadBytes('你好')).toBe(8); // 2 quotes + 3 bytes/char UTF-8
        expect(payloadBytes({ a: 1 })).toBe(7);
        // Non-serializable payloads are effectively infinite over the wire.
        const cyclic: Record<string, unknown> = {};
        cyclic.self = cyclic;
        expect(payloadBytes(cyclic)).toBe(Number.POSITIVE_INFINITY);
    });

    it('declares the documented budget constants', () => {
        expect(PAYLOAD_BUDGET.snapshotMaxBytes).toBe(1_048_576);
        expect(PAYLOAD_BUDGET.eventMaxBytes).toBe(49_152);
        expect(PAYLOAD_BUDGET.maxPendingUpdates).toBe(512);
        expect(PAYLOAD_BUDGET.coalesceWindowMs).toBe(50);
    });

    it('assertPayloadBudget passes under the cap and throws over it', () => {
        const small = { items: Array.from({ length: 32 }, (_, i) => ({ id: `n${i}` })) };
        expect(() => assertPayloadBudget(small, PAYLOAD_BUDGET.eventMaxBytes)).not.toThrow();
        const big = { blob: 'x'.repeat(PAYLOAD_BUDGET.eventMaxBytes + 1) };
        try {
            assertPayloadBudget(big, PAYLOAD_BUDGET.eventMaxBytes);
            expect.unreachable();
        } catch (err) {
            expect(err).toBeInstanceOf(PayloadBudgetExceededError);
            expect((err as PayloadBudgetExceededError).bytes).toBeGreaterThan(
                PAYLOAD_BUDGET.eventMaxBytes
            );
        }
    });
});

describe('coalescer (#135)', () => {
    it('batches items arriving inside the window', async () => {
        const batches: Array<{ items: number[]; dropped: number }> = [];
        const c = createCoalescer<number>({
            windowMs: 20,
            maxPending: 512,
            flush: (items, dropped) => batches.push({ items, dropped }),
        });
        c.push(1);
        c.push(2);
        c.push(3);
        expect(c.pending()).toBe(3);
        await new Promise((r) => setTimeout(r, 40));
        expect(batches).toEqual([{ items: [1, 2, 3], dropped: 0 }]);
    });

    it('drops oldest past maxPending and counts them', async () => {
        const batches: Array<{ items: number[]; dropped: number }> = [];
        const c = createCoalescer<number>({
            windowMs: 30,
            maxPending: 4,
            flush: (items, dropped) => batches.push({ items, dropped }),
        });
        for (let i = 0; i < 6; i++) c.push(i);
        await new Promise((r) => setTimeout(r, 50));
        expect(batches[0]?.items).toEqual([2, 3, 4, 5]);
        expect(batches[0]?.dropped).toBe(2);
    });

    it('flushNow delivers immediately; stop discards', () => {
        const batches: number[][] = [];
        const c = createCoalescer<number>({
            windowMs: 5_000,
            maxPending: 8,
            flush: (items) => batches.push(items),
        });
        c.push(7);
        c.flushNow();
        expect(batches).toEqual([[7]]);
        c.push(8);
        c.stop();
        expect(c.pending()).toBe(0);
        expect(batches).toEqual([[7]]);
    });
});
