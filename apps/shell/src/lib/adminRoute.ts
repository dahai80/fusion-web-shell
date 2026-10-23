/**
 * Shell-wrapped admin pages (issue #51): /settings, /users, /audit render
 * inside the shell layout instead of replacing the window. SPA navigation
 * only — history.pushState + a custom event the App root listens to, so the
 * sidebar/tab strip stay mounted and module tabs keep their KeepAlive state.
 */

export type AdminPageName = 'settings' | 'admin-users' | 'audit';

const PATHS: Record<AdminPageName, string> = {
    settings: '/settings',
    'admin-users': '/users',
    audit: '/audit',
};

/** Event fired after every in-shell navigation (pushState or re-notify). */
export const ROUTE_EVENT = 'fusion:route';

export function adminPageForPath(path: string): AdminPageName | null {
    for (const [page, p] of Object.entries(PATHS) as [AdminPageName, string][]) {
        if (path === p) return page;
    }
    return null;
}

export function pathForAdminPage(page: AdminPageName): string {
    return PATHS[page];
}

/**
 * In-shell SPA navigation: push the path (skipped when unchanged so repeated
 * Home clicks do not grow the history stack) and notify route listeners.
 */
export function navigateShell(path: string): void {
    if (window.location.pathname !== path) {
        window.history.pushState({}, '', path);
    } else {
        console.log('[adminRoute] path unchanged, notifying only:', path);
    }
    window.dispatchEvent(new Event(ROUTE_EVENT));
}
