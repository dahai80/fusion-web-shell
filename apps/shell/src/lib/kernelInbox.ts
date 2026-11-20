import { sharedClient } from '@/api/client';

/**
 * Kernel typed approval inbox (issue #180). agent-studio#781 exposes the
 * daemon team mailbox's actionable cards over the web bridge:
 *   teams.inbox_typed  {team, member}          -> {status:'ok', messages:[...]}
 *   teams.inbox_respond {team, member, message_id, decision}
 * Called through the gateway module proxy (`/shell/<id>/v1/rpc`) with the
 * shell session Bearer — same surface the review module uses.
 */

export type KernelCardKind = 'plan_approval' | 'shutdown_request';

export interface KernelTypedCard {
    kind: KernelCardKind;
    msgId: string;
    sender: string;
    recipient: string;
    body: string;
    answered: boolean;
    /** Source team mailbox (teams.list discovery). */
    team: string;
}

interface RawTypedMessage {
    kind?: unknown;
    msg_id?: unknown;
    sender?: unknown;
    recipient?: unknown;
    body?: unknown;
    answered?: unknown;
}

const KINDS: ReadonlySet<string> = new Set(['plan_approval', 'shutdown_request']);

/** Filter + normalize an inbox response to typed cards (pure, test-pinned). */
export function parseTypedInbox(payload: unknown, team = ''): KernelTypedCard[] {
    const messages =
        payload &&
        typeof payload === 'object' &&
        Array.isArray((payload as { messages?: unknown }).messages)
            ? ((payload as { messages: unknown[] }).messages as RawTypedMessage[])
            : [];
    const cards: KernelTypedCard[] = [];
    for (const m of messages) {
        if (
            typeof m.kind !== 'string' ||
            !KINDS.has(m.kind) ||
            typeof m.msg_id !== 'string' ||
            m.msg_id === '' ||
            m.answered === true
        ) {
            continue;
        }
        cards.push({
            kind: m.kind as KernelCardKind,
            msgId: m.msg_id,
            sender: typeof m.sender === 'string' ? m.sender : '',
            recipient: typeof m.recipient === 'string' ? m.recipient : '',
            body: typeof m.body === 'string' ? m.body : '',
            answered: false,
            team,
        });
    }
    return cards;
}

const RPC_PATH = '/shell/fusion-agent-studio/v1/rpc';

async function rpc<T>(method: string, params: Record<string, unknown>): Promise<T> {
    return sharedClient().post<T>(RPC_PATH, { method, params }, { quiet: true });
}

/** Fetch unanswered typed cards for one team member. */
export async function fetchTypedInbox(team: string, member: string): Promise<KernelTypedCard[]> {
    const data = await rpc<{ status?: string; messages?: RawTypedMessage[] }>('teams.inbox_typed', {
        team,
        member,
    });
    return parseTypedInbox(data, team);
}

interface TeamListEntry {
    name?: unknown;
    members?: unknown;
}

/**
 * Discover the caller's team mailboxes via teams.list and merge every
 * unanswered typed card across them (issue #180). Teams whose member list
 * does not include `member` are skipped; per-team failures degrade to empty.
 */
export async function fetchApprovalCards(member: string): Promise<KernelTypedCard[]> {
    const list = await rpc<{ teams?: TeamListEntry[] }>('teams.list', {});
    const teams = Array.isArray(list.teams) ? list.teams : [];
    const mine = teams
        .map((entry) => ({
            name: typeof entry.name === 'string' ? entry.name : '',
            members: Array.isArray(entry.members)
                ? entry.members.filter((m): m is string => typeof m === 'string')
                : [],
        }))
        .filter((tm) => tm.name !== '' && tm.members.includes(member));
    const settled = await Promise.allSettled(mine.map((tm) => fetchTypedInbox(tm.name, member)));
    const cards: KernelTypedCard[] = [];
    for (const r of settled) {
        if (r.status === 'fulfilled') cards.push(...r.value);
        else console.warn('[kernelInbox] team inbox failed:', r.reason);
    }
    return cards;
}

export type KernelDecision = 'approve' | 'reject';

/** Respond to one typed card. Second respond for the same id is rejected
 *  server-side (#781 contract) — callers should drop the card optimistically. */
export async function respondTyped(
    team: string,
    member: string,
    messageId: string,
    decision: KernelDecision
): Promise<void> {
    await sharedClient().post<{ status?: string; message?: string }>(
        RPC_PATH,
        {
            method: 'teams.inbox_respond',
            params: { team, member, message_id: messageId, decision },
        },
        { quiet: true }
    );
}
