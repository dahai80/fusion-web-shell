/**
 * Shell chat tool registry + client-side tool loop (issue #106, A-14):
 * the chat surface previously had no artifact tools, so the model claimed
 * "created an artifact" with empty tool_calls — a phantom success. The
 * registry mirrors the Artifacts module REST surface; execution goes
 * through the gateway module proxy (/shell/fusion-artifacts/api/v1/...,
 * session-gated; the gateway injects the upstream service key) — never
 * direct to the engine port.
 */

export interface ToolCall {
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
}

export interface ToolMessage {
    role: 'tool';
    content: string;
    tool_call_id: string;
}

export type LoopMessage =
    | { role: 'user' | 'system'; content: string }
    | {
          role: 'assistant';
          content: string | null;
          tool_calls?: ToolCall[];
      }
    | ToolMessage;

export interface ChatToolDef {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    };
}

const ARTIFACT_SESSION = 'fusion-web-shell-chat';

/** OpenAI function-calling schema, one tool per Artifacts REST verb (#106). */
export const ARTIFACT_TOOLS: ChatToolDef[] = [
    {
        type: 'function',
        function: {
            name: 'create_artifact',
            description:
                'Create an artifact in the Artifacts engine. Use ONLY when the user asks to create/save an artifact, document, SVG, code file or chart.',
            parameters: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Short artifact name' },
                    type: {
                        type: 'string',
                        enum: ['code', 'markdown', 'html', 'react', 'data'],
                        description: 'Artifact content type',
                    },
                    content: { type: 'string', description: 'Full artifact content' },
                    kind: {
                        type: 'string',
                        enum: ['app', 'code', 'document', 'game', 'tool', 'template'],
                        description: 'Optional artifact kind',
                    },
                    summary: { type: 'string', description: 'Optional one-line summary' },
                },
                required: ['name', 'type', 'content'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'update_artifact',
            description: 'Update an existing artifact by id (replaces content/name).',
            parameters: {
                type: 'object',
                properties: {
                    artifact_id: { type: 'string', description: 'Artifact id' },
                    name: { type: 'string' },
                    content: { type: 'string' },
                    change_log: { type: 'string' },
                },
                required: ['artifact_id'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_artifact',
            description: 'Fetch one artifact (metadata + content) by id.',
            parameters: {
                type: 'object',
                properties: {
                    artifact_id: { type: 'string' },
                },
                required: ['artifact_id'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'list_artifacts',
            description:
                'List recent artifacts (id, name, type, updated_at). Use to find an id before update.',
            parameters: {
                type: 'object',
                properties: {
                    page: { type: 'number', description: '1-based page, default 1' },
                    page_size: { type: 'number', description: 'Default 20' },
                },
            },
        },
    },
];

export type ArtifactToolName =
    | 'create_artifact'
    | 'update_artifact'
    | 'get_artifact'
    | 'list_artifacts';

export function isArtifactTool(name: string): name is ArtifactToolName {
    return ['create_artifact', 'update_artifact', 'get_artifact', 'list_artifacts'].includes(name);
}

export interface HttpLike {
    get(path: string, opts?: { quiet?: boolean }): Promise<unknown>;
    post(path: string, body?: unknown, opts?: { signal?: AbortSignal }): Promise<unknown>;
}

/** Execute one artifact tool against the gateway module proxy (#106). */
export async function executeArtifactTool(
    http: HttpLike,
    name: ArtifactToolName,
    args: Record<string, unknown>
): Promise<unknown> {
    const base = '/shell/fusion-artifacts/api/v1/artifacts';
    switch (name) {
        case 'create_artifact':
            return http.post(`${base}/create`, {
                session_id: ARTIFACT_SESSION,
                name: args.name,
                type: args.type,
                content: args.content,
                ...(typeof args.kind === 'string' ? { kind: args.kind } : {}),
                ...(typeof args.summary === 'string' ? { summary: args.summary } : {}),
            });
        case 'update_artifact': {
            const id = String(args.artifact_id ?? '');
            return http.post(`${base}/${encodeURIComponent(id)}`, {
                ...(typeof args.name === 'string' ? { name: args.name } : {}),
                ...(typeof args.content === 'string' ? { content: args.content } : {}),
                ...(typeof args.change_log === 'string' ? { change_log: args.change_log } : {}),
            });
        }
        case 'get_artifact': {
            const id = String(args.artifact_id ?? '');
            return http.get(`${base}/${encodeURIComponent(id)}`, { quiet: true });
        }
        case 'list_artifacts': {
            const page = typeof args.page === 'number' ? args.page : 1;
            const size = typeof args.page_size === 'number' ? args.page_size : 20;
            return http.get(`${base}?page=${page}&page_size=${size}`, { quiet: true });
        }
    }
}

/** Parse one tool_calls entry into {name, args} or null on malformed input. */
export function parseToolCall(
    call: ToolCall
): { name: ArtifactToolName; args: Record<string, unknown> } | null {
    if (!isArtifactTool(call.function.name)) return null;
    try {
        const args = JSON.parse(call.function.arguments || '{}');
        return args && typeof args === 'object' && !Array.isArray(args)
            ? { name: call.function.name, args: args as Record<string, unknown> }
            : null;
    } catch {
        return null;
    }
}

/**
 * Deterministic guard (#106 fix 2): the assistant text claims artifact
 * creation when it mentions artifacts AND a creation verb — used to append
 * a tool-call-grounded correction when no artifact tool actually succeeded.
 */
const ARTIFACT_WORD = /(工件|artifact)/i;
const CLAIM_VERB =
    /(已创建|已生成|创建(了|好|成功)?(一个)?|生成(了|好|成功)?(一个)?|created|generated|have created|made an?)/i;

export function claimsArtifactCreation(text: string): boolean {
    return ARTIFACT_WORD.test(text) && CLAIM_VERB.test(text);
}

export const GROUNDING_CORRECTION_ZH = '（系统核查：本轮没有实际的工件工具调用，未创建任何工件。）';
export const GROUNDING_CORRECTION_EN =
    '(System check: no artifact tool call ran this turn — nothing was created.)';

export interface ChatTurnResponse {
    choices?: Array<{
        message?: {
            role?: string;
            content?: string | null;
            tool_calls?: ToolCall[];
        };
    }>;
}

export type ChatTurnPoster = (body: {
    model: string;
    messages: LoopMessage[];
    stream: boolean;
    tools?: ChatToolDef[];
}) => Promise<ChatTurnResponse>;

export interface ToolLoopResult {
    content: string;
    /** Successful artifact tool calls this turn (name → count). */
    toolCalls: Array<{ name: ArtifactToolName; ok: boolean }>;
    rounds: number;
}

/**
 * One full chat turn with the artifacts toolset (#106 fix 1). Sends tools on
 * every round; executes returned tool_calls against the gateway proxy and
 * feeds tool messages back until the model answers without tool_calls (or
 * the round cap). Tool internals stay inside the loop — the caller sees only
 * the final assistant text plus the tool-call audit trail.
 */
export async function runChatTurn(
    post: ChatTurnPoster,
    base: { model: string },
    history: LoopMessage[],
    exec: (name: ArtifactToolName, args: Record<string, unknown>) => Promise<unknown>,
    opts?: { maxRounds?: number; signal?: AbortSignal }
): Promise<ToolLoopResult> {
    const maxRounds = opts?.maxRounds ?? 4;
    const messages: LoopMessage[] = [...history];
    const toolCalls: ToolLoopResult['toolCalls'] = [];
    for (let round = 1; round <= maxRounds; round++) {
        const last = round === maxRounds;
        const resp = await post({
            ...base,
            messages,
            stream: false,
            // Final round drops tools so the model must answer in text and
            // can no longer emit tool_calls it would never get executed.
            tools: last ? undefined : ARTIFACT_TOOLS,
        });
        const msg = resp.choices?.[0]?.message;
        const calls = msg?.tool_calls ?? [];
        if (calls.length === 0 || !msg) {
            const content = (msg?.content ?? '').trim();
            if (!content) throw new Error('empty response');
            return { content, toolCalls, rounds: round };
        }
        messages.push({
            role: 'assistant',
            content: msg.content ?? null,
            tool_calls: calls,
        });
        for (const call of calls) {
            const parsed = parseToolCall(call);
            let payload: string;
            if (!parsed) {
                toolCalls.push({ name: call.function.name as ArtifactToolName, ok: false });
                payload = JSON.stringify({ error: 'unknown tool or malformed arguments' });
                console.warn('[delegation] bad tool call:', call.function.name);
            } else {
                try {
                    const result = await exec(parsed.name, parsed.args);
                    toolCalls.push({ name: parsed.name, ok: true });
                    payload = JSON.stringify(result ?? { ok: true });
                    console.log('[delegation] tool executed:', parsed.name);
                } catch (err) {
                    toolCalls.push({ name: parsed.name, ok: false });
                    payload = JSON.stringify({ error: (err as Error).message });
                    console.error('[delegation] tool failed:', parsed.name, err);
                }
            }
            messages.push({ role: 'tool', content: payload, tool_call_id: call.id });
        }
    }
    // Round cap exhausted without a plain answer — surface that honestly.
    throw new Error('tool loop did not settle');
}
