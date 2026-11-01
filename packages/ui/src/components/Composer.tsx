import { type ReactNode, type Ref, useEffect, useRef, useState } from 'react';
import { StreamingMarkdown } from './StreamingMarkdown';

export interface ComposerOption {
    value: string;
    label: string;
    /** Secondary text under the label (raw engine id) — shown in popovers. */
    hint?: string;
    /** Chat-capable default-list entry; non-curated items surface only via
     *  popover search (issue #87 curation contract). */
    curated?: boolean;
}

export interface ComposerSelectProps {
    value: string;
    options: ComposerOption[];
    onChange(value: string): void;
    /** Placeholder-ish label while no option matches (e.g. default model). */
    fallbackLabel?: string;
}

export interface ComposerActionItem {
    key: string;
    label: string;
    onClick?(): void;
}

export interface ComposerChip {
    key: string;
    label: string;
    onClick(): void;
    /** Visual-only dimming (e.g. module currently unreachable). */
    muted?: boolean;
}

export interface ComposerProps {
    value: string;
    onChange(value: string): void;
    onSubmit(): void;
    placeholder?: string;
    ariaLabel?: string;
    /** Optional model picker (bottom-toolbar text button + popover). */
    model?: ComposerSelectProps;
    /** Optional effort/thinking picker (bottom-toolbar text button + popover). */
    effort?: ComposerSelectProps;
    /** Optional `+` popover entries (agent capabilities etc.). */
    actions?: { items: ComposerActionItem[]; popoverTitle?: string; emptyLabel?: string };
    /** Row under the box; pass a custom string or false to hide. */
    hint?: string | false;
    busy?: boolean;
    disabled?: boolean;
    sendLabel?: string;
    busyLabel?: string;
    textareaRef?: Ref<HTMLTextAreaElement>;
}

/** Bottom-toolbar popover (issue #87): a text button that opens a floating
 *  panel above it, closing on outside mousedown or Escape. */
function ToolbarPopover({
    buttonLabel,
    buttonAria,
    align = 'left',
    width = 'w-[240px]',
    children,
}: {
    buttonLabel: ReactNode;
    buttonAria: string;
    align?: 'left' | 'right';
    width?: string;
    children: (close: () => void) => ReactNode;
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement | null>(null);
    const close = () => setOpen(false);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                aria-haspopup="dialog"
                aria-label={buttonAria}
                className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-text-secondary hover:bg-bg-muted hover:text-text-primary"
            >
                {buttonLabel}
                <span aria-hidden className="text-[9px] text-text-muted">
                    ▾
                </span>
            </button>
            {open ? (
                <div
                    role="dialog"
                    aria-label={buttonAria}
                    className={`absolute bottom-[32px] z-dropdown max-h-[280px] overflow-y-auto rounded-xl border border-border bg-bg-elevated p-1.5 shadow-overlay ${width} ${align === 'right' ? 'right-0' : 'left-0'}`}
                >
                    {children(close)}
                </div>
            ) : null}
        </div>
    );
}

function OptionRow({
    option,
    selected,
    onPick,
}: {
    option: ComposerOption;
    selected: boolean;
    onPick(value: string): void;
}) {
    return (
        <button
            key={option.value}
            type="button"
            onClick={() => onPick(option.value)}
            className={`flex w-full items-start justify-between gap-2 rounded-md px-2 py-1.5 text-left hover:bg-bg-muted ${selected ? 'text-brand' : 'text-text-secondary'}`}
        >
            <span className="min-w-0">
                <span className="block truncate text-xs">{option.label}</span>
                {option.hint ? (
                    <span className="block truncate text-[10px] text-text-muted">
                        {option.hint}
                    </span>
                ) : null}
            </span>
            {selected ? (
                <span aria-hidden className="shrink-0 text-xs text-brand">
                    ✓
                </span>
            ) : null}
        </button>
    );
}

/** Model picker (issue #87): search input + curated-by-default list; a
 *  non-empty query reveals every option (raw ids included). */
function ModelPicker({ model }: { model: ComposerSelectProps }) {
    return (
        <ToolbarPopover
            buttonAria="model"
            align="right"
            width="w-[300px]"
            buttonLabel={
                model.options.find((o) => o.value === model.value)?.label ??
                model.fallbackLabel ??
                'Model'
            }
        >
            {(close) => <ModelPickerBody model={model} close={close} />}
        </ToolbarPopover>
    );
}

function ModelPickerBody({ model, close }: { model: ComposerSelectProps; close(): void }) {
    const [query, setQuery] = useState('');
    const q = query.trim().toLowerCase();
    const visible = q
        ? model.options.filter(
              (o) =>
                  o.label.toLowerCase().includes(q) ||
                  o.value.toLowerCase().includes(q) ||
                  (o.hint ?? '').toLowerCase().includes(q)
          )
        : model.options.filter((o) => o.curated !== false);
    return (
        <>
            <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search models…"
                aria-label="search models"
                className="mb-1 w-full rounded-md border border-border bg-bg px-2 py-1.5 text-xs text-text-primary outline-none focus:border-brand"
            />
            {visible.length === 0 ? (
                <div className="px-2 py-1 text-xs text-text-muted">No matches</div>
            ) : (
                visible.map((o) => (
                    <OptionRow
                        key={o.value}
                        option={o}
                        selected={o.value === model.value}
                        onPick={(v) => {
                            model.onChange(v);
                            close();
                        }}
                    />
                ))
            )}
        </>
    );
}

/**
 * Shared chat/delegation composer (issue #55, retooled #87) — claude.ai
 * input anatomy: rounded-input bordered card with brand focus ring,
 * borderless auto-grow textarea, bottom toolbar (left `+` attach slot +
 * capability pill, right model/effort text buttons + brand-blue circular
 * send button), Enter-to-send. Token-driven via @fusion/design-tokens.
 */
export function Composer({
    value,
    onChange,
    onSubmit,
    placeholder,
    ariaLabel,
    model,
    effort,
    actions,
    hint = 'Enter to send · Shift+Enter new line',
    busy = false,
    disabled = false,
    sendLabel = 'Send',
    busyLabel = 'Thinking…',
    textareaRef,
}: ComposerProps) {
    const [popOpen, setPopOpen] = useState(false);
    const popRef = useRef<HTMLDivElement | null>(null);

    // Close the actions popover on any click outside it (agent.html UX).
    useEffect(() => {
        if (!popOpen) return;
        const onDown = (e: MouseEvent) => {
            if (popRef.current && !popRef.current.contains(e.target as Node)) setPopOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [popOpen]);

    return (
        <div className="w-full text-left">
            <div className="rounded-input border border-border bg-bg-elevated px-3 pb-2 pt-2.5 focus-within:border-brand">
                <textarea
                    ref={textareaRef}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            onSubmit();
                        }
                    }}
                    rows={2}
                    placeholder={placeholder}
                    aria-label={ariaLabel}
                    disabled={disabled}
                    className="block max-h-[120px] min-h-[40px] w-full resize-none border-none bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
                />
                <div className="mt-1.5 flex items-center gap-1.5">
                    {/* Attach slot: no upload pipeline yet — kept as the
                        documented anatomy slot (issue #87). */}
                    <button
                        type="button"
                        disabled
                        aria-label="attach"
                        title="Attach"
                        className="flex h-[30px] w-[30px] items-center justify-center rounded-full p-0 text-base leading-none text-text-muted opacity-50"
                    >
                        +
                    </button>
                    {actions ? (
                        <div className="relative" ref={popRef}>
                            <button
                                type="button"
                                onClick={() => setPopOpen((v) => !v)}
                                aria-expanded={popOpen}
                                aria-haspopup="dialog"
                                aria-label="actions"
                                className="flex items-center gap-1 rounded-full border border-border bg-bg-muted px-2.5 py-1 text-xs text-text-secondary hover:border-brand hover:text-brand"
                            >
                                <span aria-hidden>⚙</span>
                                <span>Tools</span>
                            </button>
                            {popOpen ? (
                                <div
                                    role="dialog"
                                    aria-label={actions.popoverTitle ?? 'ACTIONS'}
                                    className="absolute bottom-[38px] left-0 z-dropdown max-h-[260px] w-[300px] overflow-y-auto rounded-xl border border-border bg-bg-elevated p-2.5 shadow-overlay"
                                >
                                    <div className="px-1.5 pb-2 pt-0.5 text-xs text-text-secondary">
                                        {actions.popoverTitle ?? 'ACTIONS'}
                                    </div>
                                    {actions.items.length === 0 ? (
                                        <div className="px-1.5 text-xs text-text-muted">
                                            {actions.emptyLabel ?? 'No entries yet'}
                                        </div>
                                    ) : (
                                        actions.items.map((a) => (
                                            <button
                                                key={a.key}
                                                type="button"
                                                onClick={() => {
                                                    a.onClick?.();
                                                    setPopOpen(false);
                                                }}
                                                className="block w-full px-1.5 py-1 text-left text-xs text-text-secondary hover:text-brand"
                                            >
                                                {a.label}
                                            </button>
                                        ))
                                    )}
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                    <span className="flex-1" />
                    {model ? <ModelPicker model={model} /> : null}
                    {effort ? (
                        <ToolbarPopover
                            buttonAria="effort"
                            align="right"
                            buttonLabel={
                                effort.options.find((o) => o.value === effort.value)?.label ??
                                effort.fallbackLabel ??
                                'Effort'
                            }
                        >
                            {(close) => (
                                <>
                                    {effort.options.map((o) => (
                                        <OptionRow
                                            key={o.value}
                                            option={o}
                                            selected={o.value === effort.value}
                                            onPick={(v) => {
                                                effort.onChange(v);
                                                close();
                                            }}
                                        />
                                    ))}
                                </>
                            )}
                        </ToolbarPopover>
                    ) : null}
                    <button
                        type="button"
                        onClick={onSubmit}
                        disabled={busy || disabled || value.trim().length === 0}
                        aria-label={busy ? busyLabel : sendLabel}
                        title={busy ? busyLabel : sendLabel}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-sm text-white hover:bg-brand-hover disabled:opacity-40"
                    >
                        <span aria-hidden className={busy ? 'animate-pulse' : ''}>
                            ↑
                        </span>
                    </button>
                </div>
            </div>
            {hint !== false ? (
                <div className="mt-1.5 text-center text-[11.5px] text-text-secondary">{hint}</div>
            ) : null}
        </div>
    );
}

export type ChatStreamState = 'pending' | 'streaming' | 'done' | 'failed';

export interface ChatStep {
    id: string;
    label: string;
    /** ⚡ mutation (writes) or ◇ read-only — default read-only. */
    kind?: 'mutation' | 'read';
    /** Human duration, e.g. "1.2s". */
    duration?: string;
}

export interface ChatDatum {
    id: string;
    label: string;
    onClick?(): void;
}

export interface ChatCitation {
    id: string;
    label: string;
    href?: string;
}

export interface ChatArtifact {
    id: string;
    label: string;
    href?: string;
}

export interface ChatMessage {
    id: string;
    role: 'user' | 'agent' | 'system' | 'error';
    body: string;
    /** Streaming agent message: rendered via the shared StreamingMarkdown. */
    streaming?: boolean;
    /** Streaming lifecycle (#57): pending = typing indicator, streaming =
     *  markdown + cursor, failed = error block (error token, monospace). */
    state?: ChatStreamState;
    steps?: ChatStep[];
    data?: ChatDatum[];
    citations?: ChatCitation[];
    artifacts?: ChatArtifact[];
}

export interface ChatThreadProps {
    messages: ChatMessage[];
    onCitationClick?(citation: ChatCitation): void;
    onArtifactClick?(artifact: ChatArtifact): void;
    emptyState?: ReactNode;
    /** Scrollable container label (a11y). */
    ariaLabel?: string;
}

/**
 * Shared chat thread (issue #55) — f-ecommerce bubble geometry: user right
 * (bg-muted, radius 16/16/4/16, max-w 82%), agent left (panel bg + border,
 * radius 4/16/16/16, max-w 88%). Agent bodies stream via StreamingMarkdown.
 * Issue #57 adds the output contract: tool-call step rows (⚡/◇ markers +
 * duration), scrollable step-data result lists, citation chips, artifact
 * cards, and the pending/streaming/done/failed lifecycle.
 */
export function ChatThread({
    messages,
    onCitationClick,
    onArtifactClick,
    emptyState,
    ariaLabel,
}: ChatThreadProps) {
    if (messages.length === 0 && emptyState) {
        return <div className="text-sm text-text-secondary">{emptyState}</div>;
    }
    return (
        <div className="flex flex-col gap-1" aria-label={ariaLabel} role="log" aria-live="polite">
            {messages.map((m) => {
                if (m.role === 'error' || (m.role === 'agent' && m.state === 'failed')) {
                    return (
                        <div
                            key={m.id}
                            role="alert"
                            className="max-w-[88%] self-start rounded-[4px_16px_16px_16px] border border-error/50 bg-bg px-3.5 py-2 font-mono text-xs text-error"
                        >
                            {m.body}
                        </div>
                    );
                }
                if (m.role === 'system') {
                    return (
                        <div key={m.id} className="self-center text-xs text-text-muted">
                            {m.body}
                        </div>
                    );
                }
                if (m.role === 'user') {
                    return (
                        <div
                            key={m.id}
                            className="max-w-[82%] self-end rounded-[16px_16px_4px_16px] bg-bg-muted px-3.5 py-2 text-sm whitespace-pre-wrap break-words text-text-primary"
                        >
                            {m.body}
                        </div>
                    );
                }
                return (
                    <div
                        key={m.id}
                        className="max-w-[88%] self-start rounded-[4px_16px_16px_16px] border border-border bg-bg px-3.5 py-2 text-sm text-text-secondary"
                    >
                        {m.state === 'pending' ? (
                            <span
                                className="inline-flex items-center gap-1 py-1"
                                aria-label="typing"
                            >
                                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-text-muted" />
                                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-text-muted [animation-delay:150ms]" />
                                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-text-muted [animation-delay:300ms]" />
                            </span>
                        ) : null}
                        {m.steps && m.steps.length > 0 ? (
                            <div className="flex flex-col gap-0.5">
                                {m.steps.map((s) => (
                                    <div
                                        key={s.id}
                                        className="step flex items-center gap-1.5 text-xs text-text-secondary"
                                    >
                                        <span aria-hidden>
                                            {s.kind === 'mutation' ? '⚡' : '◇'}
                                        </span>
                                        <span>{s.label}</span>
                                        {s.duration ? (
                                            <span className="text-text-muted">{s.duration}</span>
                                        ) : null}
                                    </div>
                                ))}
                            </div>
                        ) : null}
                        {m.body ? (
                            m.streaming || m.state === 'streaming' ? (
                                <>
                                    <StreamBody text={m.body} />
                                    <span className="animate-pulse text-text-secondary" aria-hidden>
                                        ▍
                                    </span>
                                </>
                            ) : (
                                m.body
                            )
                        ) : null}
                        {m.data && m.data.length > 0 ? (
                            <div className="step-data mt-1 max-h-40 overflow-y-auto rounded-md border border-border bg-bg-muted">
                                {m.data.map((d) => (
                                    <button
                                        key={d.id}
                                        type="button"
                                        onClick={d.onClick}
                                        className="block w-full px-2.5 py-1.5 text-left text-xs text-text-secondary hover:text-brand"
                                    >
                                        {d.label}
                                    </button>
                                ))}
                            </div>
                        ) : null}
                        {m.citations && m.citations.length > 0 ? (
                            <div className="citation mt-1.5 flex flex-wrap gap-1.5">
                                {m.citations.map((c) => (
                                    <button
                                        key={c.id}
                                        type="button"
                                        onClick={() => onCitationClick?.(c)}
                                        className="rounded-full border border-border bg-bg-muted px-2 py-0.5 text-xs text-text-secondary hover:border-brand hover:text-brand"
                                    >
                                        {c.label}
                                    </button>
                                ))}
                            </div>
                        ) : null}
                        {m.artifacts && m.artifacts.length > 0 ? (
                            <div className="artifact mt-1.5 flex flex-wrap gap-1.5">
                                {m.artifacts.map((a) => (
                                    <button
                                        key={a.id}
                                        type="button"
                                        onClick={() => onArtifactClick?.(a)}
                                        className="flex items-center gap-1.5 rounded-md border border-border bg-bg-muted px-2.5 py-1.5 text-xs text-text-primary hover:border-brand"
                                    >
                                        <span aria-hidden>📄</span>
                                        {a.label}
                                    </button>
                                ))}
                            </div>
                        ) : null}
                    </div>
                );
            })}
        </div>
    );
}

function StreamBody({ text }: { text: string }) {
    return <StreamingMarkdown text={text} />;
}
