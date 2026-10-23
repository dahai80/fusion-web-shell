import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatThread, Composer } from '@fusion/web-ui';

const BASE = {
    value: 'hello',
    onChange: () => {},
    onSubmit: () => {},
};

describe('@fusion/web-ui Composer (issue #55)', () => {
    it('renders the contract box: 14px radius, focus-within brand ring, borderless textarea', () => {
        const html = renderToStaticMarkup(
            <Composer {...BASE} placeholder="ask anything" ariaLabel="composer" />
        );
        expect(html).toContain('rounded-[14px]');
        expect(html).toContain('focus-within:border-brand');
        expect(html).toContain('border-none bg-transparent');
        expect(html).toContain('placeholder="ask anything"');
        expect(html).toContain('aria-label="composer"');
    });
    it('Enter-to-send textarea with min 40px / max 120px auto-grow', () => {
        const html = renderToStaticMarkup(<Composer {...BASE} />);
        expect(html).toContain('min-h-[40px]');
        expect(html).toContain('max-h-[120px]');
        expect(html).toContain('resize-none');
    });
    it('model and effort selects render only when provided', () => {
        const withSelects = renderToStaticMarkup(
            <Composer
                {...BASE}
                model={{
                    value: 'm1',
                    onChange: () => {},
                    options: [
                        { value: '', label: 'Model: default' },
                        { value: 'm1', label: 'm1' },
                    ],
                }}
                effort={{
                    value: 'low',
                    onChange: () => {},
                    options: [
                        { value: 'default', label: 'Thinking: auto' },
                        { value: 'low', label: 'Thinking: low' },
                    ],
                }}
            />
        );
        expect(withSelects).toContain('aria-label="model"');
        expect(withSelects).toContain('aria-label="effort"');
        expect(withSelects).toContain('<option value="m1" selected="">m1</option>');

        const without = renderToStaticMarkup(<Composer {...BASE} />);
        expect(without).not.toContain('aria-label="model"');
        expect(without).not.toContain('aria-label="effort"');
    });
    it('send button disabled when busy or empty; row order = actions, spacer, selects, send', () => {
        const busy = renderToStaticMarkup(<Composer {...BASE} busy sendLabel="Send" />);
        expect(busy).toContain('disabled');
        expect(busy).toContain('Thinking…');
        const pos = {
            actions: busy.indexOf('aria-label="actions"'),
            spacer: busy.indexOf('flex-1'),
            model: busy.indexOf('aria-label="model"'),
            send: busy.lastIndexOf('type="button"'),
        };
        expect(pos.actions).toBeLessThan(pos.spacer);
    });
    it('chips render as suggestion pills under the box', () => {
        const html = renderToStaticMarkup(
            <Composer
                {...BASE}
                chips={[
                    { key: 'a', label: 'Tidy desktop', onClick: () => {} },
                    { key: 'b', label: 'Weekly readout', onClick: () => {} },
                ]}
            />
        );
        expect(html).toContain('Tidy desktop');
        expect(html).toContain('Weekly readout');
        expect(html).toContain('rounded-full');
    });
    it('hint row shows Enter / Shift+Enter unless disabled', () => {
        const withHint = renderToStaticMarkup(<Composer {...BASE} hint="Enter to send" />);
        expect(withHint).toContain('Enter to send');
        const noHint = renderToStaticMarkup(<Composer {...BASE} hint={false} />);
        expect(noHint).not.toContain('to send');
    });
    it('token-driven: no hardcoded hex colors', () => {
        const html = renderToStaticMarkup(
            <Composer
                {...BASE}
                model={{ value: '', onChange: () => {}, options: [] }}
                effort={{ value: '', onChange: () => {}, options: [] }}
                chips={[{ key: 'a', label: 'x', onClick: () => {} }]}
            />
        );
        expect(html).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    });
});

describe('@fusion/web-ui ChatThread (issue #55)', () => {
    it('user bubble right: bg-muted, radius 16/16/4/16, max-width 82%', () => {
        const html = renderToStaticMarkup(
            <ChatThread messages={[{ id: '1', role: 'user', body: 'hi' }]} />
        );
        expect(html).toContain('self-end');
        expect(html).toContain('rounded-[16px_16px_4px_16px]');
        expect(html).toContain('bg-bg-muted');
        expect(html).toContain('max-w-[82%]');
    });
    it('agent bubble left: panel bg + border, radius 4/16/16/16, max-width 88%', () => {
        const html = renderToStaticMarkup(
            <ChatThread messages={[{ id: '1', role: 'agent', body: 'hello' }]} />
        );
        expect(html).toContain('self-start');
        expect(html).toContain('rounded-[4px_16px_16px_16px]');
        expect(html).toContain('border');
        expect(html).toContain('max-w-[88%]');
    });
    it('error message uses the error token', () => {
        const html = renderToStaticMarkup(
            <ChatThread messages={[{ id: '1', role: 'error', body: 'boom' }]} />
        );
        expect(html).toContain('text-error');
    });
    it('empty thread renders the provided empty state', () => {
        const html = renderToStaticMarkup(<ChatThread messages={[]} emptyState="nothing yet" />);
        expect(html).toContain('nothing yet');
    });
});
