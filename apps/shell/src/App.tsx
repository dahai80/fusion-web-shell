import { ApiClient, setSharedClient, sharedClient } from '@/api/client';
import * as api from '@/api/endpoints';
import { ToastHost, pushToast } from '@/components/ToastHost';
import { type AdminPageName, ROUTE_EVENT, adminPageForPath } from '@/lib/adminRoute';
import { LoginPage } from '@/pages/Login';
import { MainPage } from '@/pages/Main';
import { useAuth } from '@/stores/auth';
import { type ReactNode, Suspense, lazy, useEffect, useState } from 'react';

// Route-level code split (admin console is rarely the landing view).
const AdminUsersPage = lazy(() =>
    import('@/pages/AdminUsers').then((m) => ({ default: m.AdminUsersPage }))
);
const SettingsPage = lazy(() =>
    import('@/pages/Settings').then((m) => ({ default: m.SettingsPage }))
);
const AuditPage = lazy(() => import('@/pages/Audit').then((m) => ({ default: m.AuditPage })));

type Route = { name: 'main' } | { name: AdminPageName };

function readRoute(): Route {
    // /users, not /admin/users: the gateway reserves /admin/* for its own
    // embedded admin SPA, which would shadow this route (#42 followup).
    const page = adminPageForPath(window.location.pathname);
    return page ? { name: page } : { name: 'main' };
}

/** Admin page content for the current route, rendered inside the shell (issue #51). */
function adminNodeFor(route: Route): ReactNode {
    if (route.name === 'admin-users') {
        return (
            <Suspense fallback={null}>
                <AdminUsersPage />
            </Suspense>
        );
    }
    if (route.name === 'settings') {
        return (
            <Suspense fallback={null}>
                <SettingsPage />
            </Suspense>
        );
    }
    if (route.name === 'audit') {
        return (
            <Suspense fallback={null}>
                <AuditPage />
            </Suspense>
        );
    }
    return null;
}

/** Shell root (PRD §4.1): unknown session renders login; 401 anywhere kicks back here. */
export function App() {
    const authStatus = useAuth((s) => s.status);
    const user = useAuth((s) => s.user);
    const [route, setRoute] = useState<Route>(readRoute);

    useEffect(() => {
        // popstate covers browser back/forward; ROUTE_EVENT covers in-shell
        // navigateShell() calls (issue #51 SPA admin navigation).
        const sync = () => setRoute(readRoute());
        window.addEventListener('popstate', sync);
        window.addEventListener(ROUTE_EVENT, sync);
        return () => {
            window.removeEventListener('popstate', sync);
            window.removeEventListener(ROUTE_EVENT, sync);
        };
    }, []);

    const onAuthed = (u: api.SessionUser, token: string) => {
        useAuth.getState().setUser(u, token);
        // Manifest loading is owned by MainPage's useAutoRetry (retry UX lives there).
        if (u.must_change_password) pushToast('warning', '请在管理员处修改初始密码');
    };

    if (authStatus !== 'authed' || !user) {
        return <LoginPage onAuthed={onAuthed} />;
    }

    return (
        <>
            <ToastHost />
            <MainPage
                onLogout={logoutAll}
                adminPage={route.name === 'main' ? null : route.name}
                adminNode={adminNodeFor(route)}
            />
        </>
    );
}

async function logoutAll(): Promise<void> {
    try {
        await sharedClient().post('/api/v1/shell/session/logout');
    } catch (err) {
        console.warn('[app] logout call failed, clearing session anyway', err);
    }
    useAuth.getState().clearUser();
    sessionStorage.clear();
    window.location.assign('/');
}

/** Wire the shared API client + session restore. Call once before rendering <App/>. */
export function initApp(): void {
    setSharedClient(
        new ApiClient({
            tokenProvider: () => sessionStorage.getItem('fusion.shell.token'),
            onUnauthorized: () => {
                console.warn('[app] 401 received, redirecting to login');
                useAuth.getState().clearUser();
                sessionStorage.clear();
            },
            onForbidden: (message) => pushToast('error', message),
        })
    );
    void restoreSession();
}

async function restoreSession(): Promise<void> {
    const token = sessionStorage.getItem('fusion.shell.token');
    if (!token) {
        useAuth.getState().clearUser();
        return;
    }
    try {
        const me = await api.fetchMe();
        useAuth.getState().setUser(me, token);
        // Main page mounts and loads manifests with auto-retry.
    } catch (err) {
        console.warn('[app] session restore failed', err);
        useAuth.getState().clearUser();
    }
}
