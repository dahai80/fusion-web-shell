import { create } from 'zustand';

export type Lang = 'zh' | 'en';

interface LangState {
    lang: Lang;
    setLang(lang: Lang): void;
}

const KEY = 'fusion.shell.lang';

function initial(): Lang {
    try {
        const saved = localStorage.getItem(KEY) as Lang | null;
        if (saved === 'zh' || saved === 'en') return saved;
    } catch {
        // storage unavailable
    }
    return 'zh';
}

export const useLang = create<LangState>((set, get) => ({
    lang: initial(),
    setLang(lang: Lang) {
        try {
            localStorage.setItem(KEY, lang);
        } catch (err) {
            console.warn('[lang] persist failed', err);
        }
        document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
        set({ lang });
        window.dispatchEvent(new CustomEvent('fusion:lang', { detail: lang }));
        console.log('[lang] switched to', get().lang);
    },
}));

// Keep <html lang> in sync from boot.
document.documentElement.lang = initial() === 'en' ? 'en' : 'zh-CN';

/** Spec S9: pick copy by active language. */
export function t(zh: string, en: string): string {
    return useLang.getState().lang === 'en' ? en : zh;
}
