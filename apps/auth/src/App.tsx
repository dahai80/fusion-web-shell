import { useEffect, useState } from 'react';
import { ApiPendingError, type TokenPair, api, redirectToClient, safeReturnPath } from './api';
import { type Lang, detectLang, t } from './i18n';

type Channel = 'login' | 'personal' | 'tenant' | 'join';

/** Email verification states (issue #125 AC): pending / verified / resend. */
function VerificationBlock({ lang, pair }: { lang: Lang; pair: TokenPair }) {
    const [sent, setSent] = useState(false);
    const [busy, setBusy] = useState(false);
    if (pair.email_verified) {
        return (
            <div className="mt-3 text-xs font-medium text-ok">
                {t('verificationVerified', lang)}
            </div>
        );
    }
    const resend = async () => {
        setBusy(true);
        try {
            await api.resendVerification();
            setSent(true);
        } catch (err) {
            console.warn('[auth-portal] resend failed', err);
        } finally {
            setBusy(false);
        }
    };
    return (
        <div className="mt-3 rounded-xl border border-hairline p-3 text-xs">
            <div className="font-medium">{t('emailVerification', lang)}</div>
            <div className="mt-1 text-subtle">
                {t('verificationPending', lang)}
                {sent ? ` ${t('resendSent', lang)}` : ''}
            </div>
            <button
                type="button"
                disabled={busy}
                onClick={() => void resend()}
                className="mt-2 text-accent underline"
            >
                {t('resend', lang)}
            </button>
        </div>
    );
}

const set = (form: Record<string, string>, key: string, value: string) => ({
    ...form,
    [key]: value,
});

export function App() {
    const [lang, setLang] = useState<Lang>('zh');
    const [channel, setChannel] = useState<Channel>('login');
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [pair, setPair] = useState<TokenPair | null>(null);
    const [form, setForm] = useState<Record<string, string>>({});
    const returnPath = safeReturnPath();

    useEffect(() => {
        setLang(detectLang());
        if (!safeReturnPath() && new URLSearchParams(window.location.search).has('return')) {
            setError(t('invalidReturn', detectLang()));
        }
    }, []);

    /** Success path: token pair in hand — mint the handoff code and bounce
     * back to the origin client. If the handoff route is pending, show the
     * pair state with verification block instead of stranding the user. */
    const finish = async (result: TokenPair) => {
        setPair(result);
        const path = safeReturnPath();
        if (!path) return;
        try {
            const { code } = await api.handoff(path);
            if (code) redirectToClient(code);
        } catch (err) {
            console.warn('[auth-portal] handoff unavailable', err);
        }
    };

    const run = async (fn: () => Promise<TokenPair>, key: string) => {
        setBusy(true);
        setError(null);
        setPending(false);
        try {
            await finish(await fn());
        } catch (err) {
            if (err instanceof ApiPendingError) {
                setPending(true);
            } else {
                setError((err as Error).message);
                console.warn(`[auth-portal] ${key} failed`, err);
            }
        } finally {
            setBusy(false);
        }
    };

    const field = (key: string, label: string, opts?: { type?: string; hint?: string }) => (
        <div className="mt-3">
            <label className="label" htmlFor={key}>
                {label}
            </label>
            <input
                id={key}
                type={opts?.type ?? 'text'}
                value={form[key] ?? ''}
                autoComplete={opts?.type === 'password' ? 'current-password' : 'off'}
                onChange={(e) => setForm((f) => set(f, key, e.target.value))}
                className="field"
            />
            {opts?.hint ? <div className="mt-1 text-[11px] text-subtle">{opts.hint}</div> : null}
        </div>
    );

    const tabs: [Channel, string][] = [
        ['login', t('signIn', lang)],
        ['personal', t('signUpPersonal', lang)],
        ['tenant', t('signUpTenant', lang)],
        ['join', t('joinTenant', lang)],
    ];

    const submit = () => {
        if (channel === 'login') {
            void run(() => api.login(form.username ?? '', form.password ?? ''), 'login');
        } else if (channel === 'personal') {
            void run(
                () =>
                    api.registerPersonal({
                        username: form.username ?? '',
                        password: form.password ?? '',
                        display_name: form.display_name || undefined,
                        email: form.email || undefined,
                    }),
                'register-personal'
            );
        } else if (channel === 'tenant') {
            void run(
                () =>
                    api.registerTenant({
                        tenant_display_name: form.tenant_name ?? '',
                        admin_username: form.username ?? '',
                        admin_password: form.password ?? '',
                        admin_email: form.email || undefined,
                    }),
                'register-tenant'
            );
        } else {
            const mode = form.invite_code ? 'invite' : 'request';
            void run(
                () =>
                    api.join({
                        tenant: form.tenant_name ?? '',
                        mode,
                        invite_code: form.invite_code || undefined,
                    }),
                'join'
            );
        }
    };

    const cta =
        channel === 'login'
            ? busy
                ? t('signingIn', lang)
                : t('signInCta', lang)
            : channel === 'tenant'
              ? busy
                  ? t('joiningTenant', lang)
                  : t('registerCta', lang)
              : busy
                ? t('joining', lang)
                : t('registerCta', lang);

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-paper p-4">
            <div className="w-full max-w-sm">
                <div className="mb-5 text-center">
                    <div className="text-2xl font-semibold tracking-tight text-ink">✳ Fusion</div>
                    <div className="mt-1 text-xs text-subtle">{t('welcome', lang)}</div>
                    {returnPath ? (
                        <div className="mt-1 text-[11px] text-subtle/80">
                            {t('returnTo', lang)} <code className="text-ink">{returnPath}</code>
                        </div>
                    ) : null}
                </div>
                <div className="hair-card">
                    <div className="flex gap-1 rounded-pill bg-black/5 p-1 text-xs">
                        {tabs.map(([key, label]) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => {
                                    setChannel(key);
                                    setError(null);
                                    setPending(false);
                                }}
                                className={
                                    channel === key
                                        ? 'flex-1 rounded-pill bg-paper px-2 py-1.5 font-medium text-ink shadow-sm'
                                        : 'flex-1 rounded-pill px-2 py-1.5 text-subtle'
                                }
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    {channel === 'login' ? (
                        <>
                            {field('username', t('username', lang))}
                            {field('password', t('password', lang), { type: 'password' })}
                        </>
                    ) : channel === 'personal' ? (
                        <>
                            {field('username', t('username', lang), {
                                hint: t('usernameRules', lang),
                            })}
                            {field('password', t('password', lang), {
                                type: 'password',
                                hint: t('passwordRules', lang),
                            })}
                            {field('display_name', t('displayName', lang))}
                            {field('email', t('email', lang), {
                                hint: t('emailOptionalNote', lang),
                            })}
                        </>
                    ) : channel === 'tenant' ? (
                        <>
                            {field('tenant_name', t('tenantName', lang), {
                                hint: t('planNote', lang),
                            })}
                            {field('username', t('adminUsername', lang))}
                            {field('password', t('adminPassword', lang), {
                                type: 'password',
                                hint: t('passwordRules', lang),
                            })}
                            {field('email', t('email', lang))}
                        </>
                    ) : (
                        <>
                            {field('tenant_name', t('tenantName', lang))}
                            {field('invite_code', t('inviteCode', lang))}
                            <div className="mt-2 text-[11px] text-subtle">
                                {form.invite_code ? t('joinInvite', lang) : t('joinApproval', lang)}
                            </div>
                        </>
                    )}

                    {error ? <div className="mt-3 text-xs text-danger">{error}</div> : null}
                    {pending ? (
                        <div className="mt-3 rounded-xl border border-hairline p-3 text-xs text-subtle">
                            {t('backendPending', lang)}
                        </div>
                    ) : null}
                    {pair ? (
                        <>
                            <VerificationBlock lang={lang} pair={pair} />
                            <div className="mt-2 text-[11px] text-subtle">
                                handoff unavailable — keep this window open; tokens issued.
                            </div>
                        </>
                    ) : null}

                    <button type="button" disabled={busy} onClick={submit} className="pill mt-4">
                        {cta}
                    </button>
                </div>
                <div className="mt-4 text-center text-[11px] text-subtle">
                    <button
                        type="button"
                        className="underline"
                        onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
                    >
                        {lang === 'zh' ? 'English' : '中文'}
                    </button>
                </div>
            </div>
        </div>
    );
}
