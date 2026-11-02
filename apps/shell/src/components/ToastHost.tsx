import { useLang } from '@/stores/lang';
import { useEffect, useState } from 'react';

export interface Toast {
    id: number;
    level: 'info' | 'success' | 'warning' | 'error';
    message: string;
}

let seq = 0;
const listeners = new Set<(toasts: Toast[]) => void>();
const toasts: Toast[] = [];

/** Hover-keep (issue #86): pausing a toast stops its dismiss timer and keeps
 *  the remaining budget; leaving resumes it. Decision toasts auto-dismiss in
 *  3s but stay readable while hovered. */
const timers = new Map<
    number,
    { timer: ReturnType<typeof setTimeout>; startedAt: number; remaining: number }
>();

function notify(): void {
    listeners.forEach((fn) => fn([...toasts]));
}

function dismiss(id: number): void {
    timers.delete(id);
    const idx = toasts.findIndex((x) => x.id === id);
    if (idx >= 0) toasts.splice(idx, 1);
    notify();
}

function arm(id: number, ms: number): void {
    const entry = {
        timer: setTimeout(() => dismiss(id), ms),
        startedAt: Date.now(),
        remaining: ms,
    };
    timers.set(id, entry);
}

/** Non-blocking toast (PRD §7.2): gateway error envelope shows here, 4s
 *  auto-dismiss (routing-decision toasts pass 3000 — issue #86). */
export function pushToast(level: Toast['level'], message: string, durationMs = 4000): void {
    const t: Toast = { id: ++seq, level, message };
    toasts.push(t);
    notify();
    arm(t.id, durationMs);
    console.log(`[toast:${level}]`, message);
}

export function pauseToast(id: number): void {
    const entry = timers.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    entry.remaining = Math.max(0, entry.remaining - (Date.now() - entry.startedAt));
}

export function resumeToast(id: number): void {
    const entry = timers.get(id);
    if (!entry) return;
    arm(id, entry.remaining);
}

const LEVEL_STYLE: Record<Toast['level'], string> = {
    info: 'border-border text-text-primary',
    success: 'border-success/60 text-success',
    warning: 'border-warning/60 text-warning',
    error: 'border-error/60 text-error',
};

export function ToastHost() {
    useLang((l) => l.lang);
    const [items, setItems] = useState<Toast[]>([]);
    useEffect(() => {
        listeners.add(setItems);
        return () => {
            listeners.delete(setItems);
        };
    }, []);
    return (
        <div
            className="pointer-events-none fixed right-4 top-4 z-toast flex w-80 flex-col gap-2"
            role="status"
        >
            {items.map((t) => (
                <div
                    key={t.id}
                    onMouseEnter={() => pauseToast(t.id)}
                    onMouseLeave={() => resumeToast(t.id)}
                    className={`fs-elev-1 pointer-events-auto rounded-card border bg-bg-elevated px-3 py-2 text-sm ${LEVEL_STYLE[t.level]}`}
                >
                    {t.message}
                </div>
            ))}
        </div>
    );
}
