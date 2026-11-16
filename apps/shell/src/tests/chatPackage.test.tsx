import './domSetup';
import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatView } from '../../../../packages/chat/src/ChatView';
import { MessageStream } from '../../../../packages/chat/src/MessageStream';
import { RagSessionAdapter } from '../../../../packages/chat/src/adapters/rag';
import {
    buildSendPayload,
    detectMention,
    filterMembers,
} from '../../../../packages/chat/src/mention';
import type { ChatAdapter, ChatMessage } from '../../../../packages/chat/src/types';

const fullCapsAdapter: ChatAdapter = {
    capabilities: { mentions: true, replies: true, attachments: true, voice: true, presence: true },
    list: async () => ({ messages: [], hasMore: false }),
    send: async () => ({ delivered: true, msgId: 'msg_x' }),
    subscribe: () => () => {},
    members: async () => [{ id: 'a', name: 'alice', online: true }],
};

const recorder = {
    start: async () => {},
    stop: async () => ({ audioRef: 'art:1', transcript: 'hi' }),
};

describe('@fusion/chat capability gating (#157)', () => {
    it('rag adapter (replies:self only) renders no presence bar, attach or voice controls', () => {
        const html = renderToStaticMarkup(<ChatView adapter={new RagSessionAdapter('http://x')} />);
        expect(html).not.toContain('presence-bar');
        expect(html).not.toContain('voice-button');
        expect(html).not.toContain('attach file');
    });

    it('full-capability adapter with recorder renders presence bar + voice button', () => {
        const html = renderToStaticMarkup(
            <ChatView adapter={fullCapsAdapter} recorder={recorder} />
        );
        expect(html).toContain('presence-bar');
        expect(html).toContain('voice-button');
    });

    it('voice capability declared but no recorder injected = button hidden', () => {
        const html = renderToStaticMarkup(<ChatView adapter={fullCapsAdapter} />);
        expect(html).not.toContain('voice-button');
    });
});

describe('@ completion from members()', () => {
    it('detectMention triggers on trailing @token and cancels on whitespace', () => {
        expect(detectMention('hi @al', 6)).toEqual({ active: true, start: 3, query: 'al' });
        expect(detectMention('hi @al bob', 10).active).toBe(false);
        expect(detectMention('no mention', 10).active).toBe(false);
    });

    it('filterMembers matches case-insensitive and caps at 5', () => {
        const members = [
            { id: '1', name: 'alice' },
            { id: '2', name: 'Alvin' },
            { id: '3', name: 'bob' },
        ];
        expect(filterMembers(members, 'AL').map((m) => m.name)).toEqual(['alice', 'Alvin']);
        expect(
            filterMembers(
                Array.from({ length: 8 }, (_, i) => ({ id: `${i}`, name: `u${i}` })),
                'u'
            ).length
        ).toBe(5);
    });
});

describe('reply-quote flow', () => {
    const members = [{ id: '1', name: 'alice' }];
    const target: ChatMessage = { id: 'msg_1', sender: '1', body: 'root', ts: 1 };

    it('replies:true carries replyTo into the payload', () => {
        const p = buildSendPayload('answer', { replies: true }, members, target);
        expect(p.replyTo).toBe('msg_1');
    });

    it('replies:self also allowed; undeclared replies capability drops replyTo', () => {
        expect(buildSendPayload('a', { replies: 'self' }, members, target).replyTo).toBe('msg_1');
        expect(buildSendPayload('a', { mentions: true }, members, target).replyTo).toBeUndefined();
    });

    it('mentions only kept when capability on and member resolvable, deduped', () => {
        const p = buildSendPayload(
            'ping @alice and @ghost @alice',
            { mentions: true },
            members,
            null
        );
        expect(p.mentions).toEqual(['alice']);
        expect(
            buildSendPayload('ping @ghost', { mentions: true }, members, null).mentions
        ).toBeUndefined();
        expect(buildSendPayload('ping @alice', {}, members, null).mentions).toBeUndefined();
    });
});

describe('old-format message rendering', () => {
    it('legacy message (no reply/mentions/attachments fields) renders body', () => {
        const legacy: ChatMessage = {
            id: 'old_1',
            sender: 'boom',
            body: 'legacy hello',
            ts: 1700000000000,
        };
        const html = renderToStaticMarkup(
            <MessageStream
                messages={[legacy]}
                members={[]}
                canReply={false}
                onReply={() => {}}
                onLoadOlder={() => {}}
                hasMore={false}
            />
        );
        expect(html).toContain('legacy hello');
        expect(html).toContain('boom');
    });
});

describe('rag adapter session binding', () => {
    it('send posts the question and emits the answer to subscribers', async () => {
        const calls: Array<{ url: string; init: RequestInit }> = [];
        const origFetch = globalThis.fetch;
        globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
            calls.push({ url: String(url), init: init ?? {} });
            return new Response(JSON.stringify({ answer: 'found it', msg_id: 'msg_r9' }), {
                status: 200,
            });
        }) as typeof fetch;
        try {
            const adapter = new RagSessionAdapter('http://ragx');
            const got: ChatMessage[] = [];
            const unsub = adapter.subscribe((m) => got.push(m));
            const out = await adapter.send({ body: 'question one' });
            unsub();
            expect(out.delivered).toBe(true);
            expect(out.msgId).toBe('msg_r9');
            expect(got.length).toBe(1);
            expect(got[0]?.body).toBe('found it');
            expect(calls[0]?.init.method).toBe('POST');
        } finally {
            globalThis.fetch = origFetch;
        }
    });

    it('capabilities declare replies:self only', () => {
        expect(new RagSessionAdapter('http://x').capabilities).toEqual({ replies: 'self' });
    });
});
