import type {
    ChatAdapter,
    ChatCapabilities,
    ChatMember,
    ChatMessage,
    ListPage,
    SendPayload,
} from '@fusion/chat';

export interface TeamsChatOptions {
    /** Studio daemon / gateway RPC base, e.g. http://127.0.0.1:11471 */
    baseUrl: string;
    /** Identity token (Bearer) for teams.* auth (not in PRE_AUTH_ALLOWLIST). */
    token: string;
    team: string;
    /** Sending member name (kernel validates against declared members). */
    member: string;
    /** Inbox/status poll interval; default 2s. */
    pollMs?: number;
}

interface RpcResult {
    status?: string;
    delivered?: unknown;
    msg_id?: string;
    messages?: Array<Record<string, unknown>>;
    members?: Array<Record<string, unknown>>;
    message?: string;
}

/** teams.* adapter (issue #157): studio daemon JSON-RPC → kernel mailbox.
 *  Presence = teams.status polling; delivery = teams.broadcast (mentions ride
 *  through); history = teams.inbox for this member. */
export class TeamsChatAdapter implements ChatAdapter {
    readonly capabilities: ChatCapabilities = {
        mentions: true,
        replies: true,
        attachments: true,
        voice: true,
        presence: true,
    };
    private seen = new Set<string>();
    private timer: ReturnType<typeof setInterval> | null = null;

    constructor(private opts: TeamsChatOptions) {}

    private async rpc(method: string, params: Record<string, unknown>): Promise<RpcResult> {
        const res = await fetch(`${this.opts.baseUrl}/rpc`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${this.opts.token}`,
            },
            body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
        });
        if (!res.ok) throw new Error(`teams rpc ${method} failed: ${res.status}`);
        const data = (await res.json()) as { result?: RpcResult; error?: { message: string } };
        if (data.error) throw new Error(`teams rpc ${method}: ${data.error.message}`);
        return data.result ?? {};
    }

    private static toMessage(raw: Record<string, unknown>): ChatMessage {
        return {
            id: String(raw.msg_id ?? raw.id ?? ''),
            sender: String(raw.sender ?? ''),
            body: String(raw.body ?? ''),
            ts: Number(raw.ts ?? raw.created_at ?? 0) || Date.now(),
            replyTo: raw.reply_to ? String(raw.reply_to) : undefined,
            mentions: raw.mentions ? (raw.mentions as string[]) : undefined,
            attachments: raw.attachments
                ? (raw.attachments as string[]).map((ref) => ({ ref }))
                : undefined,
            audioRef: raw.audio_ref ? String(raw.audio_ref) : undefined,
            transcript: raw.transcript ? String(raw.transcript) : undefined,
        };
    }

    private async inbox(): Promise<ChatMessage[]> {
        const r = await this.rpc('teams.inbox', { team: this.opts.team, member: this.opts.member });
        return (r.messages ?? []).map(TeamsChatAdapter.toMessage);
    }

    async list(offset: number): Promise<ListPage> {
        const all = await this.inbox();
        const page = all.slice(offset, offset + 50);
        return { messages: page, hasMore: offset + page.length < all.length };
    }

    async send(payload: SendPayload): Promise<{ delivered: boolean; msgId?: string }> {
        const r = await this.rpc('teams.broadcast', {
            team: this.opts.team,
            from: this.opts.member,
            body: payload.body,
            mentions: payload.mentions ?? [],
            attachments: payload.attachments ?? [],
            reply_to: payload.replyTo ?? '',
            audio_ref: payload.audioRef ?? '',
            transcript: payload.transcript ?? '',
        });
        return { delivered: r.delivered === true || r.status === 'ok' };
    }

    subscribe(cb: (msg: ChatMessage) => void): () => void {
        const poll = async () => {
            try {
                const msgs = await this.inbox();
                for (const m of msgs) {
                    if (m.id && !this.seen.has(m.id)) {
                        this.seen.add(m.id);
                        cb(m);
                    }
                }
            } catch (err) {
                console.error('[teamsChat] inbox poll failed', err);
            }
        };
        void poll();
        this.timer = setInterval(() => void poll(), this.opts.pollMs ?? 2000);
        return () => {
            if (this.timer) clearInterval(this.timer);
            this.timer = null;
        };
    }

    async members(): Promise<ChatMember[]> {
        const r = await this.rpc('teams.status', { team: this.opts.team });
        return (r.members ?? []).map((m) => ({
            id: String(m.name ?? m.id ?? ''),
            name: String(m.name ?? m.id ?? ''),
            online: m.online === true,
        }));
    }
}
