/** Bilingual dictionary (issue #125 AC: no half-shipped locale). */
export type Lang = 'zh' | 'en';

const zh: Record<string, string> = {
    brand: 'Fusion 账号',
    signIn: '登录',
    signUpPersonal: '个人注册',
    signUpTenant: '租户注册',
    joinTenant: '加入租户',
    username: '用户名',
    password: '密码',
    displayName: '显示名称（可选）',
    email: '邮箱（可选）',
    tenantName: '租户名称',
    adminUsername: '管理员用户名',
    adminPassword: '管理员密码',
    inviteCode: '邀请码',
    signInCta: '登录',
    registerCta: '注册',
    joinCta: '加入',
    joining: '提交中…',
    signingIn: '登录中…',
    joiningTenant: '创建租户中…',
    emailVerification: '邮箱验证',
    verificationPending: '验证邮件已发送，请查收邮箱完成验证。',
    verificationVerified: '邮箱已验证。',
    resend: '重新发送',
    resendSent: '已重新发送。',
    emailOptionalNote: '填写邮箱后需要完成邮箱验证（设计决策 3）。',
    joinInvite: '输入租户管理员发放的邀请码，兑换后即成为成员。',
    joinApproval: '提交加入申请，等待租户管理员审批。',
    joinOpen: '该租户为开放加入，提交后直接成为成员。',
    joinProof: '该租户需要密码证明加入，请登录后在个人设置中操作。',
    welcome: '登录 Fusion 生态：统一账号，站点与工作台共用。',
    backendPending: '认证后端尚未上线（identity #39/#40、gateway #506），接口暂不可用。',
    returnTo: '完成后将返回：',
    invalidReturn: '返回地址不受信任，已忽略。',
    codeError: '一次性凭证无效或已过期，请重新登录。',
    identityDown: '认证服务暂不可用，请稍后再试。',
    usernameRules: '3–32 个字符，字母/数字/下划线',
    passwordRules: '至少 8 个字符',
    planNote: '租户默认 free 套餐，配额自开通起生效。',
};

const en: Record<string, string> = {
    brand: 'Fusion Account',
    signIn: 'Sign in',
    signUpPersonal: 'Personal signup',
    signUpTenant: 'Tenant signup',
    joinTenant: 'Join a tenant',
    username: 'Username',
    password: 'Password',
    displayName: 'Display name (optional)',
    email: 'Email (optional)',
    tenantName: 'Tenant name',
    adminUsername: 'Admin username',
    adminPassword: 'Admin password',
    inviteCode: 'Invite code',
    signInCta: 'Sign in',
    registerCta: 'Create account',
    joinCta: 'Join',
    joining: 'Submitting…',
    signingIn: 'Signing in…',
    joiningTenant: 'Creating tenant…',
    emailVerification: 'Email verification',
    verificationPending: 'Verification email sent — check your inbox to finish.',
    verificationVerified: 'Email verified.',
    resend: 'Resend',
    resendSent: 'Resent.',
    emailOptionalNote: 'Providing an email requires completing verification (decision 3).',
    joinInvite: 'Redeem the invite code minted by a tenant admin to join.',
    joinApproval: 'Submit a join request and wait for tenant-admin approval.',
    joinOpen: 'This tenant is open-join — you become a member right away.',
    joinProof:
        'This tenant requires password-proof join — do it from your profile after signing in.',
    welcome: 'One account for the fusion ecosystem: site and shell share it.',
    backendPending:
        'Auth backend not shipped yet (identity #39/#40, gateway #506) — endpoints unavailable.',
    returnTo: 'You will return to:',
    invalidReturn: 'Untrusted return path ignored.',
    codeError: 'One-time code invalid or expired — sign in again.',
    identityDown: 'Auth service unavailable, try again later.',
    usernameRules: '3–32 chars, letters/digits/underscore',
    passwordRules: 'At least 8 characters',
    planNote: 'New tenants start on the free plan; quotas bind at provisioning.',
};

export const dicts: Record<Lang, Record<string, string>> = { zh, en };

export function t(key: string, lang: Lang): string {
    return dicts[lang][key] ?? dicts.en[key] ?? key;
}

export function detectLang(): Lang {
    return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}
