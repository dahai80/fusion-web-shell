import { useEffect, useState } from 'react';

export interface Toast {
    id: number;
    level: 'info' | 'success' | 'warning' | 'error';
    message: string;
}

let seq = 0;
const listeners = new Set<(toasts: Toast[]) => void>();
const toasts: Toast[] = [];

/** Non-blocking toast (PRD §7.2): gateway error envelope shows here, 4s auto-dismiss. */
export function pushToast(level: Toast['level'], message: string, durationMs = 4000): void {
    const t: Toast = { id: ++seq, level, message };
    toasts.push(t);
    listeners.forEach((fn) => fn([...toasts]));
    setTimeout(() => {
        const idx = toasts.findIndex((x) => x.id === t.id);
        if (idx >= 0) toasts.splice(idx, 1);
        listeners.forEach((fn) => fn([...toasts]));
    }, durationMs);
    console.log(`[toast:${level}]`, message);
}

const LEVEL_STYLE: Record<Toast['level'], string> = {
    info: 'border-border text-text-primary',
    success: 'border-success/60 text-success',
    warning: 'border-warning/60 text-warning',
    error: 'border-error/60 text-error',
};

export function ToastHost() {
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
                    className={`fs-elev-1 pointer-events-auto rounded-card border bg-bg-elevated px-3 py-2 text-sm ${LEVEL_STYLE[t.level]}`}
                >
                    {t.message}
                </div>
            ))}
        </div>
    );
}
