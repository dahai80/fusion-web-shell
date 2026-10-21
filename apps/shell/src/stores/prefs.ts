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
    setModel(model: string): void;
    setEffort(effort: Effort): void;
}

export const usePrefs = create<PrefsState>((set) => ({
    ...loadPrefs(),
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
}));
