import { ApiClient, setSharedClient, sharedClient } from '@/api/client';
import * as api from '@/api/endpoints';
import { ToastHost, pushToast } from '@/components/ToastHost';
import { LoginPage } from '@/pages/Login';
import { MainPage } from '@/pages/Main';
import { useAuth } from '@/stores/auth';
import { useManifests } from '@/stores/manifests';
import { Suspense, lazy, useEffect, useState } from 'react';

// Route-level code split (admin console is rarely the landing view).
const AdminUsersPage = lazy(() =>
    import('@/pages/AdminUsers').then((m) => ({ default: m.AdminUsersPage }))
);

type Route = { name: 'main' } | { name: 'admin-users' };

function readRoute(): Route {
    return window.location.pathname === '/admin/users' ? { name: 'admin-users' } : { name: 'main' };
}

/** Shell root (PRD §4.1): unknown session renders login; 401 anywhere kicks back here. */
export function App() {
    const authStatus = useAuth((s) => s.status);
    const user = useAuth((s) => s.user);
    const [route, setRoute] = useState<Route>(readRoute);

    useEffect(() => {
        const onPop = () => setRoute(readRoute());
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, []);

    const onAuthed = (u: api.SessionUser, token: string) => {
        useAuth.getState().setUser(u, token);
        void useManifests.getState().load(true);
        if (u.must_change_password) pushToast('warning', '请在管理员处修改初始密码');
    };

    if (authStatus !== 'authed' || !user) {
        return <LoginPage onAuthed={onAuthed} />;
    }

    return (
        <>
            <ToastHost />
            {route.name === 'admin-users' ? (
                <Suspense fallback={null}>
                    <AdminUsersPage />
                </Suspense>
            ) : (
                <MainPage onLogout={logoutAll} />
            )}
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
        void useManifests.getState().load(true);
    } catch (err) {
        console.warn('[app] session restore failed', err);
        useAuth.getState().clearUser();
    }
}
