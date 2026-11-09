import { describe, expect, it } from 'bun:test';
import { type SseFrame, createSseParser } from '../lib/sseStream';

function collect() {
    const frames: SseFrame[] = [];
    return {
        frames,
        parser: createSseParser((f) => frames.push(f)),
    };
}

describe('createSseParser (#137)', () => {
    it('parses complete event/data frames', () => {
        const { frames, parser } = collect();
        parser.push('event: snapshot\ndata: {"status":"running"}\n\n');
        expect(frames).toEqual([{ event: 'snapshot', data: '{"status":"running"}' }]);
    });

    it('reassembles frames split across chunks', () => {
        const { frames, parser } = collect();
        parser.push('event: run_upd');
        parser.push('ate\ndata: {"status":"');
        parser.push('success"}\n\nevent: ping\ndata: {}\n\n');
        expect(frames).toEqual([
            { event: 'run_update', data: '{"status":"success"}' },
            { event: 'ping', data: '{}' },
        ]);
    });

    it('skips comment heartbeats and defaults event to message', () => {
        const { frames, parser } = collect();
        parser.push(': keep-alive\n\n');
        parser.push('data: bare\n\n');
        expect(frames).toEqual([{ event: 'message', data: 'bare' }]);
    });

    it('multi-line data joins with newlines; end() flushes tail', () => {
        const { frames, parser } = collect();
        parser.push('data: line1\ndata: line2\n\n');
        parser.end();
        expect(frames[0]?.data).toBe('line1\nline2');
    });

    it('end() emits an unterminated trailing frame', () => {
        const { frames, parser } = collect();
        parser.push('event: snapshot\ndata: {"a":1}\n');
        parser.end();
        expect(frames).toEqual([{ event: 'snapshot', data: '{"a":1}' }]);
    });
});
