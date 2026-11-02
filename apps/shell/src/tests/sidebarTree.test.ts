import './setup';
import { describe, expect, it } from 'bun:test';
import {
    DEFAULT_EXPANDED_SECTIONS,
    MODULE_STATUS_DOT,
    isPageActive,
    moduleStatus,
    rowClickIntent,
    standaloneEntry,
    syncExpandedWithActive,
    toggleExpanded,
    unreadApprovalsFor,
    unreadCountFor,
} from '../lib/sidebarTree';

describe('L2 page active state (issue #53)', () => {
    const tab = (route?: string) => ({ id: 't', manifestId: 'fusion-cowork', route });

    it('active when the focused tab is this exact page', () => {
        expect(isPageActive(tab('/runs'), 'fusion-cowork', '/runs')).toBe(true);
    });

    it('inactive for another route, another module, or no tab', () => {
        expect(isPageActive(tab('/runs'), 'fusion-cowork', '/workflows')).toBe(false);
        expect(isPageActive(tab('/runs'), 'fusion-agent-studio', '/runs')).toBe(false);
        expect(isPageActive(null, 'fusion-cowork', '/runs')).toBe(false);
    });

    it('a tab without a route owns no specific page', () => {
        expect(isPageActive(tab(undefined), 'fusion-cowork', '/workflows')).toBe(false);
    });
});

describe('sidebar accordion state (issue #46)', () => {
    it('toggling a product switches expansion to it', () => {
        expect(toggleExpanded(null, 'fusion-cowork')).toBe('fusion-cowork');
        expect(toggleExpanded('fusion-mlx', 'fusion-cowork')).toBe('fusion-cowork');
    });

    it('toggling the expanded product collapses it', () => {
        expect(toggleExpanded('fusion-cowork', 'fusion-cowork')).toBeNull();
    });

    it('active product auto-expands; no active tab keeps current expansion', () => {
        expect(syncExpandedWithActive('fusion-mlx', 'fusion-cowork')).toBe('fusion-cowork');
        expect(syncExpandedWithActive('fusion-mlx', null)).toBe('fusion-mlx');
    });

    it('main-row click on a collapsed product expands and navigates', () => {
        expect(rowClickIntent(null, 'fusion-cowork')).toEqual({ expand: true, navigate: true });
        expect(rowClickIntent('fusion-mlx', 'fusion-cowork')).toEqual({
            expand: true,
            navigate: true,
        });
    });

    it('main-row click on the expanded product collapses in place (no navigation)', () => {
        expect(rowClickIntent('fusion-cowork', 'fusion-cowork')).toEqual({
            expand: false,
            navigate: false,
        });
    });
});

describe('standalone first-class entry (issue #92)', () => {
    const manifests = [
        { id: 'fusion-cowork', title: '工作流画布' },
        { id: 'fusion-mlx', title: '推理引擎' },
    ];

    it('present when the module is registered and granted', () => {
        expect(standaloneEntry(manifests, () => true, 'fusion-cowork')?.id).toBe('fusion-cowork');
    });

    it('hidden when not granted (RBAC) or not registered', () => {
        expect(standaloneEntry(manifests, () => false, 'fusion-cowork')).toBeNull();
        expect(
            standaloneEntry(manifests, (id) => id !== 'fusion-cowork', 'fusion-cowork')
        ).toBeNull();
        expect(standaloneEntry(manifests, () => true, 'fusion-missing')).toBeNull();
    });

    it('unread approvals count only counts the module, approvals kind, unread items', () => {
        const items = [
            { id: 'a', moduleId: 'fusion-cowork', kind: 'approvals' },
            { id: 'b', moduleId: 'fusion-cowork', kind: 'approvals' },
            { id: 'c', moduleId: 'fusion-cowork', kind: 'runs' },
            { id: 'd', moduleId: 'fusion-mlx', kind: 'approvals' },
        ];
        expect(unreadApprovalsFor(items, new Set(['b']), 'fusion-cowork')).toBe(1);
        expect(unreadApprovalsFor(items, new Set(), 'fusion-cowork')).toBe(2);
        expect(unreadApprovalsFor(items, new Set(), 'fusion-mlx')).toBe(1);
        expect(unreadApprovalsFor(items, new Set(), 'fusion-agent-studio')).toBe(0);
    });
});

describe('module status + unread bubbles (issue #99, MT-2)', () => {
    const items = [
        { id: 'a', moduleId: 'fusion-cowork', kind: 'approvals' },
        { id: 'b', moduleId: 'fusion-cowork', kind: 'runs' },
        { id: 'c', moduleId: 'fusion-cowork', kind: 'runs' },
        { id: 'd', moduleId: 'fusion-mlx', kind: 'approvals' },
    ];

    it('three-state status: offline > events > healthy', () => {
        expect(moduleStatus('fusion-cowork', new Set(['fusion-cowork']), items, new Set())).toBe(
            'offline'
        );
        expect(moduleStatus('fusion-cowork', new Set(), items, new Set())).toBe('events');
        expect(moduleStatus('fusion-cowork', new Set(), items, new Set(['b', 'c']))).toBe(
            'healthy'
        );
        // Approvals alone are not "running events" — no amber for them.
        expect(moduleStatus('fusion-mlx', new Set(), items, new Set())).toBe('healthy');
    });

    it('dot styles + tooltips exist for all three states, bilingual', () => {
        expect(MODULE_STATUS_DOT.healthy.cls).toBe('bg-success');
        expect(MODULE_STATUS_DOT.events.cls).toBe('bg-warning');
        expect(MODULE_STATUS_DOT.offline.cls).toBe('bg-offline');
        expect(MODULE_STATUS_DOT.offline.en).toBe('Offline');
    });

    it('unread count covers all kinds and caps rendering at 99+ client-side', () => {
        expect(unreadCountFor(items, new Set(), 'fusion-cowork')).toBe(3);
        expect(unreadCountFor(items, new Set(['a']), 'fusion-cowork')).toBe(2);
        expect(unreadCountFor(items, new Set(), 'fusion-agent-studio')).toBe(0);
    });

    it('section collapse defaults: domain collapsed, others expanded (MT-3)', () => {
        expect(DEFAULT_EXPANDED_SECTIONS).toEqual(['core', 'governance', 'platform']);
        expect(DEFAULT_EXPANDED_SECTIONS.includes('domain')).toBe(false);
    });
});
