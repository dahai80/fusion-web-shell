import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import './domSetup';
import { MessagesPage } from '../pages/MessagesPage';

/**
 * Messages page contract (issue #186): the operator messaging console
 * renders its structural landmarks. SSR (renderToStaticMarkup) never runs
 * effects, so the guarded pending notice fires only client-side — the
 * pending degradation is exercised by pendingSurfaces tests; here we pin
 * the pre-data empty state the operator first sees.
 */
describe('MessagesPage (issue #186)', () => {
    const html = renderToStaticMarkup(<MessagesPage />);

    it('renders the bilingual header + operator framing', () => {
        // SSR renders the default (zh) locale — t() picks the active lang.
        expect(html).toContain('客户消息');
        expect(html).toContain('工单线程');
    });

    it('renders the pre-data empty placeholders', () => {
        expect(html).toContain('暂无会话。');
        expect(html).toContain('选择左侧会话查看线程。');
    });

    it('uses shell tokens, not raw palette classes', () => {
        expect(html).toContain('text-text-primary');
        expect(html).toContain('border-border');
        expect(html).not.toContain('bg-primary-600');
    });
});
