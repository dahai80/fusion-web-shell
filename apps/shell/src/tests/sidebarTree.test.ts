import './setup';
import { describe, expect, it } from 'bun:test';
import { syncExpandedWithActive, toggleExpanded } from '../lib/sidebarTree';

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
});
