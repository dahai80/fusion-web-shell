import { describe, expect, test } from 'bun:test';
import {
    type CommentDraft,
    aggregateVerdict,
    closeDraft,
    openDraft,
    serialize,
    updateDraft,
} from '@/lib/capture';

describe('capture', () => {
    test('openDraft adds one draft per anchor, no duplicates', () => {
        let d = openDraft({ kind: 'line', id: 'f.ts:10' }, []);
        d = openDraft({ kind: 'line', id: 'f.ts:10' }, d);
        expect(d.length).toBe(1);
        expect(d[0]!.verdict).toBe('question');
    });

    test('update/close roundtrip', () => {
        let d = openDraft({ kind: 'line', id: 'f.ts:10' }, []);
        const key = d[0]!.key;
        d = updateDraft(d, key, { text: 'risky', verdict: 'request_changes' });
        expect(d[0]!.text).toBe('risky');
        d = closeDraft(d, key);
        expect(d).toEqual([]);
    });

    test('serialize drops empty comments and shapes the anchor', () => {
        let d: CommentDraft[] = openDraft({ kind: 'line', id: 'f.ts:10', range: '10-12' }, []);
        d = updateDraft(d, d[0]!.key, { text: '  bad edge case  ', verdict: 'request_changes' });
        d = openDraft({ kind: 'line', id: 'f.ts:12' }, d);
        const out = serialize(d);
        expect(out.length).toBe(1);
        expect(out[0]).toEqual({
            anchor: { kind: 'line', id: 'f.ts:10', range: '10-12' },
            comment: 'bad edge case',
            verdict: 'request_changes',
        });
    });

    test('aggregateVerdict: request_changes wins, then question, else approve', () => {
        expect(
            aggregateVerdict([
                { anchor: { kind: 'line', id: 'a' }, comment: 'x', verdict: 'approve' },
            ])
        ).toBe('approve');
        expect(
            aggregateVerdict([
                { anchor: { kind: 'line', id: 'a' }, comment: 'x', verdict: 'question' },
                { anchor: { kind: 'line', id: 'b' }, comment: 'y', verdict: 'approve' },
            ])
        ).toBe('question');
        expect(
            aggregateVerdict([
                { anchor: { kind: 'line', id: 'a' }, comment: 'x', verdict: 'question' },
                { anchor: { kind: 'line', id: 'b' }, comment: 'y', verdict: 'request_changes' },
            ])
        ).toBe('request_changes');
    });
});
