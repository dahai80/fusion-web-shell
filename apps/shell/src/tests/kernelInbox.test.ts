import { describe, expect, it } from 'bun:test';
import { parseTypedInbox } from '../lib/kernelInbox';

/**
 * Kernel typed approval inbox contract (issue #180), pinned to the live
 * agent-studio#781 web-bridge shape observed on :11432:
 *   teams.inbox_typed -> {status:'ok', messages:[{kind, msg_id, sender,
 *   recipient, body, answered, ...}]}
 */

const card = (over: Record<string, unknown>): Record<string, unknown> => ({
    type: 'plan_approval',
    kind: 'plan_approval',
    msg_id: 'msg_1426b1a7',
    sender: 'kernel-agent',
    recipient: 'admin',
    body: 'Plan: release pipeline. Approve to proceed.',
    reply_to: '',
    mentions: [],
    attachments: [],
    answered: false,
    ...over,
});

describe('parseTypedInbox (issue #180)', () => {
    it('keeps unanswered plan_approval / shutdown_request cards', () => {
        const cards = parseTypedInbox({
            status: 'ok',
            messages: [
                card({}),
                card({ kind: 'shutdown_request', msg_id: 'msg_3c4', type: 'shutdown_request' }),
            ],
        });
        expect(cards).toHaveLength(2);
        expect(cards[0]).toEqual({
            kind: 'plan_approval',
            msgId: 'msg_1426b1a7',
            sender: 'kernel-agent',
            recipient: 'admin',
            body: 'Plan: release pipeline. Approve to proceed.',
            answered: false,
            team: '',
        });
        expect(cards[1]!.kind).toBe('shutdown_request');
    });

    it('drops answered cards, unknown kinds, and missing msg_id', () => {
        const cards = parseTypedInbox({
            messages: [
                card({ answered: true }),
                card({ kind: 'chat', msg_id: 'msg_x' }),
                card({ msg_id: '' }),
                card({ msg_id: undefined }),
                card({ kind: 42 }),
            ],
        });
        expect(cards).toEqual([]);
    });

    it('degrades non-object / missing messages to empty', () => {
        expect(parseTypedInbox(undefined)).toEqual([]);
        expect(parseTypedInbox(null)).toEqual([]);
        expect(parseTypedInbox({ status: 'error' })).toEqual([]);
        expect(parseTypedInbox('nope')).toEqual([]);
    });

    it('fills missing sender/body with empty strings, tags the team', () => {
        const cards = parseTypedInbox(
            { messages: [card({ sender: undefined, body: undefined })] },
            'release'
        );
        expect(cards[0]!.sender).toBe('');
        expect(cards[0]!.body).toBe('');
        expect(cards[0]!.team).toBe('release');
    });
});
