import { parseDevModules } from '@/stores/tabs';

/** Dev-only: VITE_SHELL_ENV=dev + FUSION_DEV_MODULES=id:port overrides iframe src (PRD §7.1 A6). */
export function isDevShell(): boolean {
    return import.meta.env.VITE_SHELL_ENV === 'dev';
}

export function initDevModules(): Map<string, string> {
    if (!isDevShell()) return new Map();
    const raw = import.meta.env.FUSION_DEV_MODULES as string | undefined;
    const map = parseDevModules(
        raw ?? (import.meta.env.VITE_FUSION_DEV_MODULES as string | undefined)
    );
    if (map.size > 0) console.log('[dev-hmr] overrides active:', [...map.entries()]);
    return map;
}
