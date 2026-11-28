import { describe, expect, test } from 'bun:test';
import { ArtifactsClient } from '@fusion/artifacts-client';
import {
    fetchFiles,
    fileTypeLabel,
    openModuleIdFor,
    parseFileRow,
    rpcCall,
    setArtifactsClientForTest,
} from './fileCenter';

const PROXY_BASE = 'https://proxy.invalid/api/v1/artifacts';

function clientWith(response: () => Response): ArtifactsClient {
    return new ArtifactsClient(PROXY_BASE, {
        fetch: (async () => response()) as unknown as typeof fetch,
    });
}

describe('parseFileRow', () => {
    test('maps engine artifact to the view model', () => {
        const row = parseFileRow({
            id: 'a-1',
            name: 'report.xlsx',
            type: 'data',
            kind: 'document',
            summary: 'q3 numbers',
            owner_user_id: 'admin',
            ownership_type: 'user',
            updated_at: 1700000000,
            is_starred: true,
        });
        expect(row?.name).toBe('report.xlsx');
        expect(row?.ownerUserId).toBe('admin');
        expect(row?.starred).toBe(true);
        expect(row?.updatedAt).toBe(1700000000);
    });

    test('drops junk rows and coerces bad fields', () => {
        expect(parseFileRow(null)).toBeNull();
        expect(parseFileRow({ name: 'no id' })).toBeNull();
        const row = parseFileRow({ id: 'a-2', updated_at: 'x', is_starred: 1 });
        expect(row?.updatedAt).toBe(0);
        expect(row?.starred).toBe(false);
        expect(row?.name).toBe('(unnamed)');
    });
});

describe('openModuleIdFor (manifest-driven open routing)', () => {
    test('routes by artifact type/kind', () => {
        expect(openModuleIdFor({ type: 'data', kind: 'spreadsheet' })).toBe(
            'fusion-office-spreadsheet'
        );
        expect(openModuleIdFor({ type: 'xlsx', kind: '' })).toBe('fusion-office-spreadsheet');
        expect(openModuleIdFor({ type: 'pdf', kind: 'document' })).toBe('fusion-office-pdf');
        expect(openModuleIdFor({ type: 'html', kind: 'presentation' })).toBe(
            'fusion-office-presentation'
        );
        expect(openModuleIdFor({ type: 'markdown', kind: 'document' })).toBe(
            'fusion-office-documents'
        );
        expect(openModuleIdFor({ type: '', kind: '' })).toBe('fusion-office-documents');
    });

    test('labels prefer type over kind', () => {
        expect(fileTypeLabel({ type: 'pdf', kind: 'document' })).toBe('pdf');
        expect(fileTypeLabel({ type: '', kind: 'tool' })).toBe('tool');
        expect(fileTypeLabel({ type: '', kind: '' })).toBe('file');
    });
});

describe('gateway contract (tenant isolation)', () => {
    test('client posts JSON-RPC to the proxy path without tenant fields', async () => {
        let capturedUrl = '';
        let capturedBody = '';
        const c = new ArtifactsClient(PROXY_BASE, {
            fetch: (async (url: string | URL, init?: RequestInit) => {
                capturedUrl = String(url);
                capturedBody = String(init?.body ?? '');
                return new Response(
                    JSON.stringify({ jsonrpc: '2.0', id: 1, result: { artifacts: [], total: 0 } }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } }
                );
            }) as typeof fetch,
        });
        setArtifactsClientForTest(c);
        await fetchFiles();
        expect(capturedUrl).toBe(`${PROXY_BASE}/`);
        const body = JSON.parse(capturedBody) as { params: Record<string, unknown> };
        // identity stamping is the gateway's job (#196): the shell must not
        // send caller/owner fields a user could spoof
        expect(body.params).not.toHaveProperty('caller_user_id');
        expect(body.params).not.toHaveProperty('owner_user_id');
    });

    test('non-RPC gateway envelope (401/403/502) throws instead of returning undefined', async () => {
        setArtifactsClientForTest(
            clientWith(
                () =>
                    new Response(JSON.stringify({ error: { message: 'session_required' } }), {
                        status: 401,
                    })
            )
        );
        // the vendored client maps the gateway envelope onto RpcError; the
        // page surfaces it instead of rendering an empty list
        expect(rpcCall('artifact.list_all')).rejects.toThrow('session_required');
    });
});
