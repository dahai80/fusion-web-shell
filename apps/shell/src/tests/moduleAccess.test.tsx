import './domSetup';
import { afterEach, describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type * as api from '../api/endpoints';
import { effectiveModuleAccess } from '../lib/settingsOps';
import { GrantDialog } from '../pages/AdminUsers';
import { useAuth } from '../stores/auth';
import type { ModuleManifest } from '../types/manifest';

afterEach(() => {
    useAuth.setState({ user: null, token: null, status: 'unknown' });
});

const user = (roles: string[], permissions: string[]): api.AdminUserRow => ({
    user_id: 'u1',
    display_name: 'User One',
    roles,
    permissions,
    disabled: false,
    must_change_password: false,
    created_at: 0,
});

describe('canView wildcard (issue #65)', () => {
    it('grants every module when permissions contains "*"', () => {
        useAuth.setState({
            user: {
                user_id: 'u1',
                display_name: 'u1',
                roles: ['operator'],
                permissions: ['*'],
                must_change_password: false,
            },
            token: 't',
            status: 'authed',
        });
        const canView = useAuth.getState().canView;
        expect(canView('fusion-cowork')).toBe(true);
        expect(canView('anything-at-all')).toBe(true);
    });

    it('still honors admin role and explicit allowlist, denies guest', () => {
        useAuth.setState({
            user: {
                user_id: 'a1',
                display_name: 'a1',
                roles: ['admin'],
                permissions: [],
                must_change_password: false,
            },
            token: 't',
            status: 'authed',
        });
        expect(useAuth.getState().canView('fusion-cowork')).toBe(true);

        useAuth.setState({
            user: {
                user_id: 'o1',
                display_name: 'o1',
                roles: ['operator'],
                permissions: ['fusion-rag'],
                must_change_password: false,
            },
            token: 't',
            status: 'authed',
        });
        expect(useAuth.getState().canView('fusion-rag')).toBe(true);
        expect(useAuth.getState().canView('fusion-cowork')).toBe(false);

        useAuth.setState({ user: null, token: null, status: 'guest' });
        expect(useAuth.getState().canView('fusion-rag')).toBe(false);
    });
});

describe('effectiveModuleAccess (issue #65)', () => {
    it('reports admin role as all-modules source', () => {
        expect(effectiveModuleAccess(user(['admin'], []))).toEqual({
            source: 'admin',
            all: true,
            count: 0,
        });
    });

    it('reports wildcard allowlist as all-modules source', () => {
        expect(effectiveModuleAccess(user(['operator'], ['*']))).toEqual({
            source: 'wildcard',
            all: true,
            count: Number.POSITIVE_INFINITY,
        });
    });

    it('reports explicit allowlist count', () => {
        expect(effectiveModuleAccess(user(['operator'], ['a', 'b']))).toEqual({
            source: 'explicit',
            all: false,
            count: 2,
        });
    });
});

const MANIFESTS: ModuleManifest[] = [
    {
        id: 'fusion-cowork',
        title: 'Cowork',
        category: 'platform',
        path: '/shell/fusion-cowork/',
        entry: '/shell/fusion-cowork/',
        devices: ['desktop'],
    },
    {
        id: 'fusion-rag',
        title: 'RAG',
        category: 'domain',
        path: '/shell/fusion-rag/',
        entry: '/shell/fusion-rag/',
        devices: ['desktop'],
    },
];

describe('GrantDialog module-access UI (issue #65)', () => {
    it('renders the wildcard all-toggle, checked when permissions is ["*"]', () => {
        const html = renderToStaticMarkup(
            <GrantDialog
                user={user(['operator'], ['*'])}
                onClose={() => {}}
                onSaved={() => {}}
                manifests={MANIFESTS}
            />
        );
        expect(html).toContain('全部模块');
        const wild = html.match(/<input[^>]*aria-label="全部模块[^>]*>/);
        expect(wild).not.toBeNull();
        expect(wild?.[0]).toContain('checked');
    });

    it('wildcard user: every module checkbox checked', () => {
        const html = renderToStaticMarkup(
            <GrantDialog
                user={user(['operator'], ['*'])}
                onClose={() => {}}
                onSaved={() => {}}
                manifests={MANIFESTS}
            />
        );
        expect(html).toContain('checked');
        const boxes = html.match(/<input[^>]*type="checkbox"[^>]*>/g) ?? [];
        expect(boxes.length).toBe(3);
        expect(boxes.every((b) => b.includes('checked'))).toBe(true);
    });

    it('admin user: shows admin-role note instead of edit UI', () => {
        const html = renderToStaticMarkup(
            <GrantDialog
                user={user(['admin'], [])}
                onClose={() => {}}
                onSaved={() => {}}
                manifests={MANIFESTS}
            />
        );
        expect(html).toContain('admin 角色已含全部模块');
    });
});
