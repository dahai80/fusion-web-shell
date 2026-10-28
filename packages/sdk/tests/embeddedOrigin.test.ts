import './domSetup';
import { describe, expect, it } from 'bun:test';

// Issue #81 module side: an embedded iframe cannot read the host's origin
// cross-origin, so createShellSdk() must default to '*' when embedded and
// authenticate inbound traffic by message SOURCE (window.parent), not origin.
// The old default (the frame's own origin) dropped every host message and
// sent replies to the wrong target — a ping from the host never got a pong.

describe('embedded sdk origin default (issue #81)', () => {
    it('answers a ping from the real parent regardless of its origin, ignores strangers', async () => {
        const replies: Array<{ data: unknown; origin: string }> = [];
        const realParent = {
            postMessage: (data: unknown, origin: string) => replies.push({ data, origin }),
        } as unknown as Window;
        const originalParent = Object.getOwnPropertyDescriptor(window, 'parent');
        Object.defineProperty(window, 'parent', {
            value: realParent,
            configurable: true,
        });
        try {
            const { createShellSdk } = await import('../src/index');
            createShellSdk();

            // Host pings from an origin this frame cannot know (cross-origin).
            const HOST_ORIGIN = 'http://127.0.0.1:11430';
            const fromParent = new MessageEvent('message', {
                data: { type: 'request', id: 'ping-1', method: 'ping' },
                source: realParent,
                origin: HOST_ORIGIN,
            });
            window.dispatchEvent(fromParent);
            const pong = replies.find((r) => (r.data as { type?: string })?.type === 'response');
            expect(pong).toBeDefined();

            // An unrelated window posting the same ping gets no reply.
            replies.length = 0;
            const stranger = {} as Window;
            const fromStranger = new MessageEvent('message', {
                data: { type: 'request', id: 'ping-2', method: 'ping' },
                source: stranger,
                origin: HOST_ORIGIN,
            });
            window.dispatchEvent(fromStranger);
            expect(replies).toEqual([]);
        } finally {
            if (originalParent) Object.defineProperty(window, 'parent', originalParent);
        }
    });
});
