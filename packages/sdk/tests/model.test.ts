import './domSetup';
import { describe, expect, it } from 'bun:test';
import { createHostBridge } from '../src/host';
import type { ShellModelInfo } from '../src/types';

// Issue #114: bridge 'model' method resolves through the host getModel
// option; a missing handler resolves '' (gateway routing default), and
// notifyModelPolicy pushes a model-policy event into the iframe.

function makeBridge(
    getModel?: (moduleId?: string) => Promise<string>,
    getModelEnv?: (moduleId?: string) => Promise<ShellModelInfo>
) {
    const replies: Array<Record<string, unknown>> = [];
    const target = { postMessage: (msg: unknown) => replies.push(msg as Record<string, unknown>) };
    const iframeWindow = {
        location: { href: 'https://host.example/shell/x/' },
        postMessage: () => undefined,
    } as unknown as Window;
    const bridge = createHostBridge('tab-1', iframeWindow, {
        origin: 'https://host.example',
        getToken: () => 'tok',
        onToast: () => undefined,
        onActiveTask: () => undefined,
        proxyHttp: async () => ({ status: 200, data: {} }),
        ...(getModel ? { getModel } : {}),
        ...(getModelEnv ? { getModelEnv } : {}),
    });
    // Point the bridge's respond target at the spy so replies are observable.
    bridge.iframeWindow = target as unknown as Window;
    return { bridge, replies };
}

function dispatchModelRequest(bridge: ReturnType<typeof makeBridge>['bridge'], id: string) {
    window.dispatchEvent(
        new MessageEvent('message', {
            source: bridge.iframeWindow as unknown as MessageEvent['source'],
            origin: 'https://host.example',
            data: { type: 'request', id, method: 'model', payload: { moduleId: 'fusion-cowork' } },
        })
    );
}

const flush = () => new Promise((r) => setTimeout(r, 10));

describe('host bridge model resolution (#114)', () => {
    it('resolves via getModel and answers ok', async () => {
        const { bridge, replies } = makeBridge(async (moduleId) => `resolved:${moduleId}`);
        dispatchModelRequest(bridge, 'm1');
        await flush();
        expect(replies).toHaveLength(1);
        expect(replies[0]).toMatchObject({
            type: 'response',
            id: 'm1',
            ok: true,
            result: 'resolved:fusion-cowork',
        });
        bridge.destroy();
    });

    it('resolves to "" when no getModel handler is configured', async () => {
        const { bridge, replies } = makeBridge();
        dispatchModelRequest(bridge, 'm2');
        await flush();
        expect(replies).toHaveLength(1);
        expect(replies[0]).toMatchObject({ type: 'response', id: 'm2', ok: true, result: '' });
        bridge.destroy();
    });

    it('notifyModelPolicy pushes a model-policy event', () => {
        const { bridge, replies } = makeBridge(async () => 'x');
        bridge.notifyModelPolicy({ moduleId: 'fusion-cowork', model: 'glm-5' });
        expect(replies[0]).toMatchObject({
            type: 'event',
            event: 'model-policy',
            payload: { moduleId: 'fusion-cowork', model: 'glm-5' },
        });
        bridge.destroy();
    });
});

// Issue #118: model-env returns the full ShellModelInfo; older hosts
// without a handler degrade to a capability-less env.
describe('host bridge model-env (#118)', () => {
    function dispatchEnvRequest(
        bridge: ReturnType<typeof makeBridge>['bridge'],
        id: string,
        moduleId?: string
    ) {
        window.dispatchEvent(
            new MessageEvent('message', {
                source: bridge.iframeWindow as unknown as MessageEvent['source'],
                origin: 'https://host.example',
                data: {
                    type: 'request',
                    id,
                    method: 'model-env',
                    payload: { moduleId },
                },
            })
        );
    }

    it('resolves via getModelEnv and answers ok', async () => {
        const env = {
            modelCapable: true,
            suggestedModel: 'qwen-local',
            platformModel: 'glm-5',
            privacyMode: 'standard' as const,
            allowlist: ['glm-5'],
        };
        const { bridge, replies } = makeBridge(
            async () => 'x',
            async () => env
        );
        dispatchEnvRequest(bridge, 'e1', 'fusion-cowork');
        await flush();
        expect(replies).toHaveLength(1);
        expect(replies[0]).toMatchObject({
            type: 'response',
            id: 'e1',
            ok: true,
            result: env,
        });
        bridge.destroy();
    });

    it('degrades to capability-less env without a handler', async () => {
        const { bridge, replies } = makeBridge(async () => 'x');
        dispatchEnvRequest(bridge, 'e2');
        await flush();
        expect(replies).toHaveLength(1);
        expect(replies[0]).toMatchObject({
            type: 'response',
            id: 'e2',
            ok: true,
            result: { modelCapable: false, allowlist: [] },
        });
        bridge.destroy();
    });
});
