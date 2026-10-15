import * as api from '@/api/endpoints';
import { useAuth } from '@/stores/auth';
import { useState } from 'react';

/** Unified login (PRD §4.1): mandatory, no anonymous mode. */
export function LoginPage({ onAuthed }: { onAuthed(user: api.SessionUser, token: string): void }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [mustChange, setMustChange] = useState(false);

    const submit = async () => {
        if (!username || !password) {
            setError('请输入用户名和密码');
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const res = await api.login(username, password);
            if (res.must_change_password) {
                setMustChange(true);
                setError('首次登录请修改初始密码');
                return;
            }
            finish(res);
        } catch (err) {
            setError((err as Error).message);
            console.warn('[login] failed', err);
        } finally {
            setBusy(false);
        }
    };

    const finish = (user: api.SessionUser, token?: string) => {
        useAuth.getState().setUser(user, token ?? '');
        onAuthed(user, token ?? '');
    };

    const changePw = async () => {
        if (newPassword.length < 8) {
            setError('新密码至少 8 位');
            return;
        }
        setBusy(true);
        try {
            await api.changePassword(newPassword);
            const me = await api.fetchMe();
            finish(me, useAuth.getState().token ?? '');
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="flex h-screen items-center justify-center bg-bg p-4">
            <div className="w-full max-w-sm rounded-card border border-border bg-bg-elevated p-6">
                <div className="mb-4 text-lg text-text-primary">Fusion 统一登录</div>
                <label className="block text-xs text-text-muted" htmlFor="username">
                    用户名
                </label>
                <input
                    id="username"
                    value={username}
                    autoComplete="username"
                    onChange={(e) => setUsername(e.target.value)}
                    className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text-primary outline-none focus:border-brand"
                />
                <label className="mt-3 block text-xs text-text-muted" htmlFor="password">
                    密码
                </label>
                <input
                    id="password"
                    type="password"
                    value={password}
                    autoComplete="current-password"
                    disabled={mustChange}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !mustChange && void submit()}
                    className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text-primary outline-none focus:border-brand disabled:opacity-50"
                />
                {mustChange ? (
                    <>
                        <label className="mt-3 block text-xs text-warning" htmlFor="newpw">
                            新密码（≥8 位）
                        </label>
                        <input
                            id="newpw"
                            type="password"
                            value={newPassword}
                            autoComplete="new-password"
                            onChange={(e) => setNewPassword(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && void changePw()}
                            className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text-primary outline-none focus:border-brand"
                        />
                    </>
                ) : null}
                {error ? <div className="mt-3 text-xs text-error">{error}</div> : null}
                <button
                    type="button"
                    disabled={busy}
                    onClick={() => (mustChange ? void changePw() : void submit())}
                    className="mt-4 min-h-[44px] w-full rounded-md bg-brand text-sm text-white disabled:opacity-50"
                >
                    {busy ? '登录中…' : mustChange ? '修改密码并登录' : '登录'}
                </button>
            </div>
        </div>
    );
}
