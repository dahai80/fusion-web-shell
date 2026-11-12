import { describe, expect, it } from 'bun:test';
import { type Toast, pushToast, subscribeToasts } from '../components/ToastHost';

describe('toast dedupe (#150)', () => {
    it('identical live toasts do not stack — timer refreshes instead', async () => {
        const seen: Toast[][] = [];
        const off = subscribeToasts((list) => seen.push(list));
        pushToast('warning', '无效或过期的 API Key');
        pushToast('warning', '无效或过期的 API Key');
        pushToast('warning', '无效或过期的 API Key');
        const last = seen[seen.length - 1];
        expect(last?.filter((x) => x.message === '无效或过期的 API Key').length).toBe(1);
        // A different message still adds its own toast.
        pushToast('error', 'different message');
        const last2 = seen[seen.length - 1];
        expect(last2?.filter((x) => x.message === 'different message').length).toBe(1);
        off();
        // Let the armed timers fire so the process can exit cleanly.
        await new Promise((r) => setTimeout(r, 15));
    });
});
