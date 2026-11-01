import type { Lang } from '@/stores/lang';

/** Relative time for task cards (issue #86): "just now / 5m / 3h / yesterday /
 *  4d", bilingual. Falls back to '' when no timestamp is known. */
export function relativeTime(iso: string | undefined, lang: Lang, now = Date.now()): string {
    if (!iso) return '';
    const ts = Date.parse(iso);
    if (Number.isNaN(ts)) return '';
    const diff = Math.max(0, now - ts);
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return lang === 'en' ? 'just now' : '刚刚';
    if (minutes < 60) return lang === 'en' ? `${minutes}m ago` : `${minutes} 分钟前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return lang === 'en' ? `${hours}h ago` : `${hours} 小时前`;
    const days = Math.floor(hours / 24);
    if (days === 1) return lang === 'en' ? 'yesterday' : '昨天';
    if (days < 30) return lang === 'en' ? `${days}d ago` : `${days} 天前`;
    const months = Math.floor(days / 30);
    return lang === 'en' ? `${months}mo ago` : `${months} 个月前`;
}
