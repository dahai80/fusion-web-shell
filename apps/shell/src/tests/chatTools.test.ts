import { describe, expect, it } from 'bun:test';
import {
    ARTIFACT_TOOLS,
    type ChatTurnResponse,
    type ToolCall,
    claimsArtifactCreation,
    executeArtifactTool,
    parseToolCall,
    runChatTurn,
} from '../lib/chatTools';

const call = (name: string, args: unknown, id = 't1'): ToolCall => ({
    id,
    type: 'function',
    function: { name, arguments: JSON.stringify(args) },
});

describe('parseToolCall (#106)', () => {
    it('parses known tools and rejects unknown/malformed', () => {
        expect(parseToolCall(call('create_artifact', { name: 'x' }))?.name).toBe('create_artifact');
        expect(parseToolCall(call('delete_artifact', {}))).toBeNull();
        expect(parseToolCall(call('create_artifact', 'not-json'))).toBeNull();
        expect(parseToolCall(call('create_artifact', [1]))).toBeNull();
    });
});

describe('claimsArtifactCreation guard (#106)', () => {
    it('flags artifact creation claims in zh and en', () => {
        expect(claimsArtifactCreation('我已经创建了一个工件 SVG。')).toBe(true);
        expect(claimsArtifactCreation("I've created an artifact with the chart.")).toBe(true);
    });
    it('does not flag artifact mentions without a creation verb', () => {
        expect(claimsArtifactCreation('工件模块当前离线。')).toBe(false);
        expect(claimsArtifactCreation('The artifact list is empty.')).toBe(false);
    });
});

describe('executeArtifactTool (#106)', () => {
    it('hits the gateway module proxy paths, never the engine port', async () => {
        const calls: Array<{ method: string; path: string; body?: unknown }> = [];
        const http = {
            get: async (path: string) => {
                calls.push({ method: 'GET', path });
                return { ok: true };
            },
            post: async (path: string, body?: unknown) => {
                calls.push({ method: 'POST', path, body });
                return { ok: true };
            },
        };
        await executeArtifactTool(http, 'create_artifact', {
            name: 'n',
            type: 'html',
            content: '<svg/>',
        });
        await executeArtifactTool(http, 'list_artifacts', {});
        await executeArtifactTool(http, 'get_artifact', { artifact_id: 'a/1' });
        await executeArtifactTool(http, 'update_artifact', { artifact_id: 'a1', content: 'x' });
        expect(calls[0]).toEqual({
            method: 'POST',
            path: '/shell/fusion-artifacts/api/v1/artifacts/create',
            body: {
                session_id: 'fusion-web-shell-chat',
                name: 'n',
                type: 'html',
                content: '<svg/>',
            },
        });
        expect(calls[1]?.path).toBe('/shell/fusion-artifacts/api/v1/artifacts?page=1&page_size=20');
        expect(calls[2]?.path).toBe('/shell/fusion-artifacts/api/v1/artifacts/a%2F1');
        expect(calls[3]?.path).toBe('/shell/fusion-artifacts/api/v1/artifacts/a1');
    });
});

describe('runChatTurn tool loop (#106)', () => {
    const base = { model: 'test-model' };
    const history = [{ role: 'user' as const, content: 'create an svg artifact' }];

    it('executes tool_calls and feeds results back until a plain answer', async () => {
        let round = 0;
        const executed: string[] = [];
        const post = async (body: {
            messages: unknown[];
            tools?: unknown;
        }): Promise<ChatTurnResponse> => {
            round += 1;
            if (round === 1) {
                expect(body.tools).toBeDefined();
                return {
                    choices: [
                        {
                            message: {
                                role: 'assistant',
                                content: null,
                                tool_calls: [
                                    call(
                                        'create_artifact',
                                        { name: 'svg', type: 'html', content: '<svg/>' },
                                        'c1'
                                    ),
                                ],
                            },
                        },
                    ],
                };
            }
            expect(body.tools).toBeUndefined();
            const toolMsgs = (body.messages as Array<{ role: string; content: string }>).filter(
                (m) => m.role === 'tool'
            );
            expect(toolMsgs).toHaveLength(1);
            expect(JSON.parse(toolMsgs[0]!.content)).toEqual({ ok: true });
            return { choices: [{ message: { role: 'assistant', content: 'Artifact created.' } }] };
        };
        const result = await runChatTurn(
            post,
            base,
            history,
            async (name) => {
                executed.push(name);
                return { ok: true };
            },
            { maxRounds: 2 }
        );
        expect(round).toBe(2);
        expect(executed).toEqual(['create_artifact']);
        expect(result.content).toBe('Artifact created.');
        expect(result.toolCalls).toEqual([{ name: 'create_artifact', ok: true }]);
    });

    it('records failed tool executions and still settles', async () => {
        let round = 0;
        const post = async (): Promise<ChatTurnResponse> => {
            round += 1;
            if (round === 1)
                return {
                    choices: [
                        {
                            message: {
                                role: 'assistant',
                                content: null,
                                tool_calls: [call('list_artifacts', {}, 'c1')],
                            },
                        },
                    ],
                };
            return { choices: [{ message: { role: 'assistant', content: 'List is empty.' } }] };
        };
        const result = await runChatTurn(post, base, history, async () => {
            throw new Error('proxy 404');
        });
        expect(result.toolCalls).toEqual([{ name: 'list_artifacts', ok: false }]);
        expect(result.content).toBe('List is empty.');
    });

    it('drops tools on the final round and throws if the loop never settles', async () => {
        const post = async (): Promise<ChatTurnResponse> => ({
            choices: [
                {
                    message: {
                        role: 'assistant',
                        content: null,
                        tool_calls: [call('list_artifacts', {}, `c${Math.random()}`)],
                    },
                },
            ],
        });
        try {
            await runChatTurn(post, base, history, async () => ({}), { maxRounds: 2 });
            throw new Error('should have thrown');
        } catch (err) {
            expect((err as Error).message).toBe('tool loop did not settle');
        }
    });

    it('registry exposes the four artifact verbs with valid schemas', () => {
        expect(ARTIFACT_TOOLS.map((t) => t.function.name)).toEqual([
            'create_artifact',
            'update_artifact',
            'get_artifact',
            'list_artifacts',
        ]);
        for (const t of ARTIFACT_TOOLS) expect(t.function.parameters.type).toBe('object');
    });
});
