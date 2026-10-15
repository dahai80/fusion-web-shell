import { create } from 'zustand';

type ThemeMode = 'dark' | 'light';

interface ThemeState {
    mode: ThemeMode;
    toggle(): void;
}

const KEY = 'fusion.shell.theme';

function initial(): ThemeMode {
    try {
        const saved = localStorage.getItem(KEY) as ThemeMode | null;
        if (saved === 'light' || saved === 'dark') return saved;
    } catch {
        // storage unavailable
    }
    return 'dark'; // dark default (spec §3.1)
}

export const useTheme = create<ThemeState>((set, get) => ({
    mode: initial(),
    toggle() {
        const next: ThemeMode = get().mode === 'dark' ? 'light' : 'dark';
        try {
            localStorage.setItem(KEY, next);
        } catch (err) {
            console.warn('[theme] persist failed', err);
        }
        set({ mode: next });
    },
}));

export function applyTheme(mode: ThemeMode): void {
    document.documentElement.classList.toggle('light', mode === 'light');
    document.documentElement.classList.toggle('dark', mode === 'dark');
}

// Subscribe once: theme changes propagate to DOM and modules via host bridge.
useTheme.subscribe((state) => {
    applyTheme(state.mode);
    window.dispatchEvent(new CustomEvent('fusion:theme', { detail: state.mode }));
});
