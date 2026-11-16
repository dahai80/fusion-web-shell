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
    /** Recipient for rich direct sends when no reply target is known. */
    defaultRecipient?: string;
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
    private replyTargets = new Map<string, string>();
    private timer: ReturnType<typeof setInterval> | null = null;

    constructor(private opts: TeamsChatOptions) {}

    private async rpc(method: string, params: Record<string, unknown>): Promise<RpcResult> {
        // Studio web bridge wire shape: POST /v1/rpc {method, params}. Handlers
        // return {"status":"error",...} with HTTP 200 — check .status, not 2xx.
        const res = await fetch(`${this.opts.baseUrl}/v1/rpc`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${this.opts.token}`,
            },
            body: JSON.stringify({ method, params }),
        });
        if (!res.ok) throw new Error(`teams rpc ${method} failed: ${res.status}`);
        const data = (await res.json()) as RpcResult & { message?: string };
        if (data.status === 'error') throw new Error(`teams rpc ${method}: ${data.message}`);
        return data;
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

    /** Rich payloads (attachments/voice/reply) use teams.send — the only
     *  handler with the full TeamMessage passthrough; broadcast carries
     *  text + mentions only. `to` = replied-message sender or the adapter's
     *  defaultRecipient. */
    async send(payload: SendPayload): Promise<{ delivered: boolean; msgId?: string }> {
        const rich = payload.attachments?.length || payload.audioRef || payload.transcript;
        if (rich || payload.replyTo) {
            const to = payload.replyTo
                ? (this.replyTargets.get(payload.replyTo) ?? this.opts.defaultRecipient ?? '')
                : (this.opts.defaultRecipient ?? '');
            const r = await this.rpc('teams.send', {
                team: this.opts.team,
                from: this.opts.member,
                to,
                body: payload.body,
                reply_to: payload.replyTo ?? '',
                mentions: payload.mentions ?? [],
                attachments: payload.attachments ?? [],
                audio_ref: payload.audioRef ?? '',
                transcript: payload.transcript ?? '',
            });
            return {
                delivered: r.delivered === true || r.status === 'ok',
                msgId: r.msg_id || undefined,
            };
        }
        const r = await this.rpc('teams.broadcast', {
            team: this.opts.team,
            from: this.opts.member,
            body: payload.body,
            mentions: payload.mentions ?? [],
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
                        this.replyTargets.set(m.id, m.sender);
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
