import { useAuth } from '@/stores/auth';
import { t, useLang } from '@/stores/lang';
import { useManifests } from '@/stores/manifests';
import {
    type PaletteCommand,
    buildNavCommands,
    buildQuickActions,
    filterCommands,
    runSearch,
    usePalette,
} from '@/stores/palette';
import { useEffect, useMemo, useRef, useState } from 'react';

const SEARCH_DEBOUNCE_MS = 250;

/**
 * ⌘K overlay (issue #24, G4/C1): navigation + quick actions filtered locally,
 * cross-module search results fetched via manifest searchProviders (debounced,
 * isolated failures). Keyboard: ⌘K/Ctrl+K toggle, ↑↓ move, ↵ run, Esc close.
 */
export function CommandPalette() {
    const openState = usePalette((s) => s.openState);
    const query = usePalette((s) => s.query);
    const activeIndex = usePalette((s) => s.activeIndex);
    const open = usePalette((s) => s.open);
    const close = usePalette((s) => s.close);
    const setQuery = usePalette((s) => s.setQuery);
    const setActive = usePalette((s) => s.setActive);
    const manifests = useManifests((s) => s.manifests);
    const canView = useAuth((s) => s.canView);
    const lang = useLang((s) => s.lang);
    const [searchResults, setSearchResults] = useState<PaletteCommand[]>([]);
    const inputRef = useRef<HTMLInputElement>(null);
    const dialogRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    // Global toggle key.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                if (usePalette.getState().openState) close();
                else open();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, close]);

    // Focus + re-focus the input whenever the palette opens.
    useEffect(() => {
        if (openState) inputRef.current?.focus();
    }, [openState]);

    // Debounced cross-module search (providers only, isolated failures).
    useEffect(() => {
        if (!openState) return;
        const q = query.trim();
        if (!q) {
            setSearchResults([]);
            return;
        }
        const timer = setTimeout(() => {
            runSearch(manifests, canView, q)
                .then((cmds) => {
                    if (usePalette.getState().query.trim() === q) setSearchResults(cmds);
                })
                .catch((err) => console.warn('[palette] search failed:', err));
        }, SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [query, openState, manifests, canView]);

    const localCmds = useMemo(() => {
        const nav = buildNavCommands(manifests, canView, lang);
        const actions = buildQuickActions(manifests, canView, lang);
        return filterCommands([...nav, ...actions], query);
    }, [manifests, canView, lang, query]);

    const all = useMemo(() => [...localCmds, ...searchResults], [localCmds, searchResults]);

    useEffect(() => {
        if (activeIndex >= all.length) setActive(Math.max(0, all.length - 1));
    }, [all.length, activeIndex, setActive]);

    if (!openState) return null;

    const runAt = (i: number) => {
        const cmd = all[i];
        if (!cmd) return;
        console.log('[palette] run:', cmd.id);
        close();
        cmd.run();
    };

    const onDialogKey = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            close();
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive(all.length === 0 ? 0 : (activeIndex + 1) % all.length);
            return;
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive(all.length === 0 ? 0 : (activeIndex - 1 + all.length) % all.length);
            return;
        }
        if (e.key === 'Enter') {
            e.preventDefault();
            runAt(activeIndex);
            return;
        }
        // Focus trap: Tab wraps within the dialog (review fix #5).
        if (e.key !== 'Tab') return;
        const root = dialogRef.current;
        if (!root) return;
        const focusables = Array.from(root.querySelectorAll<HTMLElement>('input, button')).filter(
            (el) => !el.hasAttribute('disabled')
        );
        if (focusables.length === 0) return;
        const first = focusables[0]!;
        const last = focusables[focusables.length - 1]!;
        const active = document.activeElement;
        if (e.shiftKey && (active === first || active === inputRef.current)) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && active === last) {
            e.preventDefault();
            first.focus();
        }
    };

    const navItems = localCmds.filter((c) => c.group === 'nav');
    const actionItems = localCmds.filter((c) => c.group === 'action');
    const sections: Array<{ key: string; label: string; items: PaletteCommand[] }> = [
        { key: 'nav', label: t('导航', 'Navigation'), items: navItems },
        { key: 'action', label: t('执行', 'Actions'), items: actionItems },
        { key: 'search', label: t('搜索结果', 'Search results'), items: searchResults },
    ];
    const showSearchSection = query.trim().length > 0;

    let flatIdx = -1;

    return (
        <div
            className="fixed inset-0 z-overlay flex items-start justify-center bg-black/50 pt-24"
            onClick={(e) => {
                if (e.target === e.currentTarget) close();
            }}
            onKeyDown={(e) => {
                if (e.target === e.currentTarget && e.key === 'Escape') close();
            }}
            tabIndex={-1}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                onKeyDown={onDialogKey}
                aria-label={t('命令面板', 'Command palette')}
                className="fs-elev-2 w-full max-w-lg rounded-card border border-bg bg-bg-elevated"
            >
                <input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={onDialogKey}
                    placeholder={t('搜索 / 跳转 / 执行…', 'Search / jump / run…')}
                    aria-label={t('命令输入', 'Command input')}
                    className="w-full rounded-t-card bg-transparent px-4 py-3 text-sm text-text-primary outline-none placeholder:text-text-muted"
                />
                <div
                    ref={listRef}
                    aria-label={t('命令列表', 'Command list')}
                    className="max-h-96 overflow-y-auto border-t border-border px-1 py-1"
                >
                    {sections.map((s) =>
                        s.key === 'search' && !showSearchSection ? null : s.items.length ===
                          0 ? null : (
                            <div key={s.key}>
                                <div className="px-3 pb-1 pt-2 text-xs text-text-muted">
                                    {s.label}
                                </div>
                                {s.items.map((cmd) => {
                                    flatIdx += 1;
                                    const idx = flatIdx;
                                    const active = idx === activeIndex;
                                    return (
                                        <button
                                            type="button"
                                            key={cmd.id}
                                            role="option"
                                            aria-selected={active}
                                            onMouseEnter={() => setActive(idx)}
                                            onClick={() => runAt(idx)}
                                            className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm ${active ? 'bg-brand/15 text-brand' : 'text-text-primary'}`}
                                        >
                                            <span className="truncate">{cmd.label}</span>
                                            {cmd.hint ? (
                                                <span className="ml-3 shrink-0 text-xs text-text-muted">
                                                    {cmd.hint}
                                                </span>
                                            ) : null}
                                        </button>
                                    );
                                })}
                            </div>
                        )
                    )}
                    {all.length === 0 ? (
                        <div className="px-3 py-6 text-center text-sm text-text-muted">
                            {t('无匹配命令', 'No matching commands')}
                        </div>
                    ) : null}
                </div>
                <div className="flex justify-end gap-3 border-t border-border px-4 py-2 text-xs text-text-muted">
                    <span>↑↓ {t('选择', 'Select')}</span>
                    <span>↵ {t('执行', 'Run')}</span>
                    <span>Esc {t('关闭', 'Close')}</span>
                </div>
            </div>
        </div>
    );
}
