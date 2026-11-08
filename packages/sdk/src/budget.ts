/**
 * Real-time payload budgets (issue #135, t3code pattern): bounded snapshot,
 * bounded pending queue, coalescing window — pinned by constants so any
 * feature that grows event payloads fails tests instead of silently
 * degrading the shell.
 *
 * Reference budgets (insight/t3code-analysis-and-fusion-lessons-2026-11-08):
 * ~1 MiB bounded snapshot / 10 turns, 48 KiB frame shards, 50ms coalescing
 * with MAX_PENDING_UPDATES=512.
 */

export const PAYLOAD_BUDGET = {
    /** Full hydration snapshot (initial event/log stream) byte cap. */
    snapshotMaxBytes: 1_048_576,
    /** Single event / frame byte cap; larger payloads must be chunked or
     * routed to a separate bounded channel. */
    eventMaxBytes: 49_152,
    /** Max events buffered inside one coalescing window; overflow drops
     * oldest (counted, surfaced to the flush consumer). */
    maxPendingUpdates: 512,
    /** High-frequency events (log lines, progress) coalesce for this long
     * before delivery. */
    coalesceWindowMs: 50,
} as const;

const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

/** Wire size of a JSON-serialized payload, in bytes (UTF-8). */
export function payloadBytes(value: unknown): number {
    let json: string;
    try {
        json = JSON.stringify(value) ?? '';
    } catch {
        // Cyclic / non-serializable payloads cannot go over the wire at all.
        return Number.POSITIVE_INFINITY;
    }
    return encoder ? encoder.encode(json).length : json.length;
}

export class PayloadBudgetExceededError extends Error {
    readonly bytes: number;
    readonly maxBytes: number;
    constructor(bytes: number, maxBytes: number) {
        super(`payload budget exceeded: ${bytes} bytes > ${maxBytes} cap`);
        this.name = 'PayloadBudgetExceededError';
        this.bytes = bytes;
        this.maxBytes = maxBytes;
    }
}

/** Throws when a payload is over budget — use in tests to pin the cap. */
export function assertPayloadBudget(value: unknown, maxBytes: number): void {
    const bytes = payloadBytes(value);
    if (bytes > maxBytes) throw new PayloadBudgetExceededError(bytes, maxBytes);
}

export interface CoalescerOptions<T> {
    windowMs: number;
    maxPending: number;
    /** Delivers the buffered batch plus how many oldest items overflowed. */
    flush(items: T[], dropped: number): void;
}

export interface CoalescerHandle<T> {
    push(item: T): void;
    flushNow(): void;
    stop(): void;
    pending(): number;
}

/**
 * Coalescing window for high-frequency events (#135): items arriving inside
 * `windowMs` are delivered as one batch. Buffer is hard-bounded — past
 * `maxPending` the OLDEST items are dropped (soft overload wins over
 * unbounded memory); the dropped count rides the flush.
 */
export function createCoalescer<T>(opts: CoalescerOptions<T>): CoalescerHandle<T> {
    let buffer: T[] = [];
    let droppedTotal = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function flush(): void {
        timer = null;
        if (buffer.length === 0) return;
        const items = buffer;
        const dropped = droppedTotal;
        buffer = [];
        droppedTotal = 0;
        opts.flush(items, dropped);
    }

    return {
        push(item: T): void {
            buffer.push(item);
            if (buffer.length > opts.maxPending) {
                buffer.shift();
                droppedTotal++;
            }
            if (timer === null) {
                timer = setTimeout(flush, opts.windowMs);
            }
        },
        flushNow(): void {
            if (timer !== null) {
                clearTimeout(timer);
            }
            flush();
        },
        stop(): void {
            if (timer !== null) {
                clearTimeout(timer);
                timer = null;
            }
            buffer = [];
            droppedTotal = 0;
        },
        pending(): number {
            return buffer.length;
        },
    };
}
