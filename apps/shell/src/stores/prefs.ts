import { DEFAULT_EXPANDED_SECTIONS, toggleGroupExpanded } from '@/lib/sidebarTree';
import { create } from 'zustand';

/**
 * Global model/effort preferences (issue #34): persisted at shell level and
 * handed off to modules through the documented same-origin localStorage keys
 * `fusion.shell.model` / `fusion.shell.effort` — module iframes are served
 * same-origin via the gateway, so cowork delegate / agent-studio Composer
 * converge their per-module preference keys onto these.
 */

export type Effort = 'default' | 'low' | 'medium' | 'high';

export const MODEL_KEY = 'fusion.shell.model';
export const EFFORT_KEY = 'fusion.shell.effort';
export const EXPANDED_GROUPS_KEY = 'fusion.shell.menuExpandedGroups';
export const EXPANDED_SECTIONS_KEY = 'fusion.shell.menuExpandedSections';

export interface ShellPrefs {
    /** '' = gateway routing default. */
    model: string;
    effort: Effort;
}

export function loadPrefs(): ShellPrefs {
    try {
        const model = localStorage.getItem(MODEL_KEY);
        const effort = localStorage.getItem(EFFORT_KEY);
        return {
            model: typeof model === 'string' ? model : '',
            effort:
                effort === 'low' || effort === 'medium' || effort === 'high' ? effort : 'default',
        };
    } catch (err) {
        console.warn('[prefs] load failed', err);
        return { model: '', effort: 'default' };
    }
}

interface PrefsState extends ShellPrefs {
    /** Sidebar group expansion (issue #71): per group, persisted. */
    expandedGroups: Set<string>;
    /** Sidebar section collapse (issue #99, MT-3): per section, persisted. */
    expandedSections: Set<string>;
    setModel(model: string): void;
    setEffort(effort: Effort): void;
    toggleExpandedGroup(groupId: string): void;
    setExpandedGroups(groups: Set<string>): void;
    toggleExpandedSection(section: string): void;
}

/** Sidebar group expansion (issue #71): per group, persisted. */
function loadExpandedGroups(): Set<string> {
    try {
        const raw = localStorage.getItem(EXPANDED_GROUPS_KEY);
        const ids = raw ? (JSON.parse(raw) as unknown) : [];
        return new Set(
            Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : []
        );
    } catch (err) {
        console.warn('[prefs] expanded groups load failed', err);
        return new Set();
    }
}

/**
 * Sidebar section expansion (issue #99, MT-3): persisted set of expanded
 * section ids; first run defaults to domain collapsed.
 */
function loadExpandedSections(): Set<string> {
    try {
        const raw = localStorage.getItem(EXPANDED_SECTIONS_KEY);
        if (raw === null) return new Set(DEFAULT_EXPANDED_SECTIONS);
        const ids = JSON.parse(raw) as unknown;
        return new Set(
            Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : []
        );
    } catch (err) {
        console.warn('[prefs] expanded sections load failed', err);
        return new Set(DEFAULT_EXPANDED_SECTIONS);
    }
}

function persistExpandedSections(sections: Set<string>): void {
    try {
        localStorage.setItem(EXPANDED_SECTIONS_KEY, JSON.stringify([...sections]));
    } catch (err) {
        console.warn('[prefs] expanded sections persist failed', err);
    }
}

function persistExpandedGroups(groups: Set<string>): void {
    try {
        localStorage.setItem(EXPANDED_GROUPS_KEY, JSON.stringify([...groups]));
    } catch (err) {
        console.warn('[prefs] expanded groups persist failed', err);
    }
}

export const usePrefs = create<PrefsState>((set, get) => ({
    ...loadPrefs(),
    expandedGroups: loadExpandedGroups(),
    expandedSections: loadExpandedSections(),
    setModel(model) {
        try {
            localStorage.setItem(MODEL_KEY, model);
        } catch (err) {
            console.warn('[prefs] model persist failed', err);
        }
        set({ model });
        console.log('[prefs] model set to', model || '(gateway default)');
    },
    setEffort(effort) {
        try {
            localStorage.setItem(EFFORT_KEY, effort);
        } catch (err) {
            console.warn('[prefs] effort persist failed', err);
        }
        set({ effort });
        console.log('[prefs] effort set to', effort);
    },
    toggleExpandedGroup(groupId) {
        const next = toggleGroupExpanded(get().expandedGroups, groupId);
        persistExpandedGroups(next);
        set({ expandedGroups: next });
        console.log('[prefs] menu group', groupId, next.has(groupId) ? 'expanded' : 'collapsed');
    },
    setExpandedGroups(groups) {
        persistExpandedGroups(groups);
        set({ expandedGroups: groups });
    },
    toggleExpandedSection(section) {
        const next = toggleGroupExpanded(get().expandedSections, section);
        persistExpandedSections(next);
        set({ expandedSections: next });
        console.log('[prefs] menu section', section, next.has(section) ? 'expanded' : 'collapsed');
    },
}));
