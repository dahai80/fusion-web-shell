import * as api from '@/api/endpoints';
import {
    type CaptchaChallenge,
    type LoginCaptchaFields,
    fetchCaptchaChallenge,
    isCaptchaError,
} from '@/lib/captcha';
import { readToken, useAuth, writeToken } from '@/stores/auth';
import { t, useLang } from '@/stores/lang';
import { useCallback, useEffect, useState } from 'react';

/** Unified login (PRD §4.1): mandatory, no anonymous mode. */
export function LoginPage({ onAuthed }: { onAuthed(user: api.SessionUser, token: string): void }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [mustChange, setMustChange] = useState(false);
    // CAPTCHA (issue #139): probe once; off entirely while the gateway
    // endpoint is missing. Refresh on captcha_* rejections and on demand.
    const [captcha, setCaptcha] = useState<CaptchaChallenge | null>(null);
    const [captchaCode, setCaptchaCode] = useState('');
    useLang((l) => l.lang);

    const loadCaptcha = useCallback(async () => {
        setCaptchaCode('');
        const challenge = await fetchCaptchaChallenge();
        setCaptcha(challenge);
        return challenge;
    }, []);

    useEffect(() => {
        void loadCaptcha();
    }, [loadCaptcha]);

    const submit = async () => {
        if (!username || !password) {
            setError(t('请输入用户名和密码', 'Enter username and password'));
            return;
        }
        if (captcha && captchaCode.trim() === '') {
            setError(t('请输入图形验证码', 'Enter the verification code'));
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const captchaFields: LoginCaptchaFields | undefined = captcha
                ? { captcha_id: captcha.captchaId, captcha_code: captchaCode.trim() }
                : undefined;
            const res = await api.login(username, password, captchaFields);
            if (res.must_change_password) {
                // Keep the token: changePw() needs it to authenticate
                // POST /api/v1/password before the session is finished.
                writeToken(res.token);
                setMustChange(true);
                setError(t('首次登录请修改初始密码', 'First login: change the initial password'));
                return;
            }
            finish(res, res.token);
        } catch (err) {
            setError((err as Error).message);
            console.warn('[login] failed', err);
            // A burned/rejected challenge is single-use — rotate it so the
            // next attempt carries a fresh one (#139).
            if (isCaptchaError(err)) void loadCaptcha();
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
            setError(t('新密码至少 8 位', 'New password must be at least 8 characters'));
            return;
        }
        setBusy(true);
        try {
            await api.changePassword(newPassword);
            const me = await api.fetchMe();
            finish(me, readToken() ?? '');
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="flex h-screen items-center justify-center bg-bg p-4">
            <div className="w-full max-w-sm rounded-card border border-border bg-bg-elevated p-6 shadow-overlay">
                <div className="font-serif text-2xl font-normal text-text-primary">✳ Fusion</div>
                <div className="mb-4 mt-1 text-xs text-text-muted">{t('统一登录', 'Sign in')}</div>
                <label className="block text-xs text-text-muted" htmlFor="username">
                    {t('用户名', 'Username')}
                </label>
                <input
                    id="username"
                    value={username}
                    autoComplete="username"
                    onChange={(e) => setUsername(e.target.value)}
                    className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text-primary outline-none focus:border-brand"
                />
                <label className="mt-3 block text-xs text-text-muted" htmlFor="password">
                    {t('密码', 'Password')}
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
                {captcha ? (
                    <>
                        <label className="mt-3 block text-xs text-text-muted" htmlFor="captcha">
                            {t('验证码', 'Verification code')}
                        </label>
                        <div className="mt-1 flex items-center gap-2">
                            <input
                                id="captcha"
                                value={captchaCode}
                                autoComplete="off"
                                maxLength={8}
                                onChange={(e) => setCaptchaCode(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && !mustChange && void submit()}
                                className="w-28 rounded-md border border-border bg-bg px-3 py-2 text-sm text-text-primary outline-none focus:border-brand"
                            />
                            <button
                                type="button"
                                onClick={() => void loadCaptcha()}
                                title={t('点击刷新验证码', 'Refresh the code')}
                                className="h-11 flex-1 overflow-hidden rounded-md border border-border bg-bg p-1"
                            >
                                <img
                                    src={captcha.imageDataUri}
                                    alt={t('验证码图片', 'Verification code image')}
                                    className="mx-auto h-full"
                                />
                            </button>
                        </div>
                    </>
                ) : null}
                {mustChange ? (
                    <>
                        <label className="mt-3 block text-xs text-warning" htmlFor="newpw">
                            {t('新密码（≥8 位）', 'New password (8+ chars)')}
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
                    className="fs-btn fs-btn-primary mt-4 min-h-[44px] w-full"
                >
                    {busy
                        ? t('登录中…', 'Signing in…')
                        : mustChange
                          ? t('修改密码并登录', 'Change password & sign in')
                          : t('登录', 'Sign in')}
                </button>
                <a
                    href={`/auth/?redirect=${encodeURIComponent(window.location.origin)}`}
                    className="mt-3 block text-center text-xs text-brand underline"
                    onClick={(e) => {
                        // Portal-first (issue #126): probe before navigating —
                        // until gateway #506 serves /auth the local form stays
                        // the honest fallback instead of a dead link.
                        e.preventDefault();
                        void import('@/lib/portalAuth').then(
                            ({ portalAvailable, redirectToPortal }) =>
                                portalAvailable().then((ok) => {
                                    if (ok) redirectToPortal();
                                    else
                                        setError(
                                            t(
                                                '统一认证门户尚未上线，请使用本地登录',
                                                'Auth portal not live yet — use local sign-in'
                                            )
                                        );
                                })
                        );
                    }}
                >
                    {t('统一账号登录 / 注册', 'Unified account sign-in / register')}
                </a>
            </div>
        </div>
    );
}
