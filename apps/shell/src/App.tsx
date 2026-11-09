import { ApiClient, setSharedClient, sharedClient } from '@/api/client';
import * as api from '@/api/endpoints';
import { ToastHost, pushToast } from '@/components/ToastHost';
import { type AdminPageName, ROUTE_EVENT, adminPageForPath } from '@/lib/adminRoute';
import {
    consumeCodeParam,
    exchangeCode,
    portalAvailable,
    redirectToPortal,
} from '@/lib/portalAuth';
import { consumeTicketParam, exchangeTicket } from '@/lib/ssoAuth';
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
const AgentsPage = lazy(() =>
    import('@/pages/AgentsPage').then((m) => ({ default: m.AgentsPage }))
);

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
    if (route.name === 'agents') {
        return (
            <Suspense fallback={null}>
                <AgentsPage />
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
                console.warn('[app] 401 received, checking unified auth portal (#126)');
                useAuth.getState().clearUser();
                sessionStorage.clear();
                // Portal-first: when the gateway serves /auth, land the user
                // there with a safe return path; pending backend (gateway
                // #506) falls back to the local login page as today.
                void portalAvailable().then((ok) => {
                    if (ok) redirectToPortal();
                });
            },
            onForbidden: (message) => pushToast('error', message),
        })
    );
    void restoreSession();
}

async function restoreSession(): Promise<void> {
    // One-time code handoff return (issue #126): the portal bounces back with
    // ?code= — exchange for the session before any other restore step. The
    // exchange route is gateway #506 contract; pending → fall through to the
    // local session restore untouched.
    const code = consumeCodeParam();
    if (code) {
        try {
            // redirect_uri must match the code grant (scheme://host/path,
            // gateway #506): the current origin + return path, minus the
            // already-stripped ?code=.
            const redirectUri = window.location.origin + window.location.pathname;
            const pair = await exchangeCode(code, redirectUri);
            const token = pair.access_token ?? '';
            if (token) {
                sessionStorage.setItem('fusion.shell.token', token);
                const me = await api.fetchMe();
                useAuth.getState().setUser(me, token);
                console.log('[app] portal handoff complete');
                return;
            }
        } catch (err) {
            console.warn('[app] portal code exchange failed, falling back to local login', err);
        }
    }
    // Cloud-try SSO ticket return (issue #130): fusion-site appends a
    // one-time identity ticket; exchange for the shell session before any
    // other restore step. Pending route (404/501) → fall through untouched.
    const ticket = consumeTicketParam();
    if (ticket) {
        try {
            const session = await exchangeTicket(ticket);
            if (session) {
                sessionStorage.setItem('fusion.shell.token', session.token);
                if (session.identity_token) {
                    sessionStorage.setItem('fusion.identity.token', session.identity_token);
                }
                const me = await api.fetchMe();
                useAuth.getState().setUser(me, session.token);
                console.log('[app] sso ticket handoff complete');
                return;
            }
        } catch (err) {
            console.warn('[app] sso ticket exchange failed, falling back to local login', err);
        }
    }
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
