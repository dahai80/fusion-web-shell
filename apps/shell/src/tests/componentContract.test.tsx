import { describe, expect, it } from 'bun:test';
import { ChatThread, Composer } from '@fusion/web-ui';
import { renderToStaticMarkup } from 'react-dom/server';

const BASE = {
    value: 'hello',
    onChange: () => {},
    onSubmit: () => {},
};

describe('@fusion/web-ui Composer (issue #55, retooled #87)', () => {
    it('renders the contract box: rounded-input, focus-within brand ring, borderless textarea', () => {
        const html = renderToStaticMarkup(
            <Composer {...BASE} placeholder="ask anything" ariaLabel="composer" />
        );
        expect(html).toContain('rounded-input');
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
    it('no native select remains; model/effort render as toolbar text buttons only when provided', () => {
        const withPickers = renderToStaticMarkup(
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
        expect(withPickers).not.toContain('<select');
        expect(withPickers).not.toContain('<option');
        expect(withPickers).toContain('aria-label="model"');
        expect(withPickers).toContain('aria-label="effort"');
        expect(withPickers).toContain('aria-haspopup="dialog"');

        const without = renderToStaticMarkup(<Composer {...BASE} />);
        expect(without).not.toContain('aria-label="model"');
        expect(without).not.toContain('aria-label="effort"');
    });
    it('send button is a brand circle: disabled when empty, hover uses brand-hover', () => {
        const empty = renderToStaticMarkup(<Composer {...BASE} value="" sendLabel="Send" />);
        expect(empty).toContain('rounded-full bg-brand');
        expect(empty).toContain('hover:bg-brand-hover');
        expect(empty).toContain('disabled');
        const filled = renderToStaticMarkup(<Composer {...BASE} value="hi" sendLabel="Send" />);
        expect(filled).toContain('aria-label="Send"');
        const busy = renderToStaticMarkup(<Composer {...BASE} busy sendLabel="Send" />);
        expect(busy).toContain('aria-label="Thinking…"');
        expect(busy).toContain('animate-pulse');
    });
    it('chips prop is gone from the composer contract (moved to Home, issue #86)', () => {
        const html = renderToStaticMarkup(<Composer {...BASE} />);
        expect(html).not.toContain('suggestion pills');
    });
    it('attach slot + capability pill render in the bottom toolbar', () => {
        const html = renderToStaticMarkup(
            <Composer
                {...BASE}
                actions={{ items: [{ key: 'a', label: 'Run graph' }], popoverTitle: 'CAPS' }}
            />
        );
        expect(html).toContain('aria-label="attach"');
        expect(html).toContain('aria-label="actions"');
        expect(html).toContain('⚙');
        expect(html).toContain('Tools');
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

describe('@fusion/web-ui ChatThread output contract (issue #57)', () => {
    it('tool-call steps render ⚡ mutation / ◇ read markers with label and duration', () => {
        const html = renderToStaticMarkup(
            <ChatThread
                messages={[
                    {
                        id: '1',
                        role: 'agent',
                        body: '',
                        steps: [
                            { id: 's1', label: 'write file', kind: 'mutation', duration: '1.2s' },
                            { id: 's2', label: 'read kb', kind: 'read', duration: '0.4s' },
                        ],
                    },
                ]}
            />
        );
        expect(html).toContain('class="step');
        expect(html).toContain('⚡');
        expect(html).toContain('◇');
        expect(html).toContain('write file');
        expect(html).toContain('1.2s');
    });
    it('step-data renders a scrollable clickable result list', () => {
        const html = renderToStaticMarkup(
            <ChatThread
                messages={[
                    {
                        id: '1',
                        role: 'agent',
                        body: '',
                        data: [
                            { id: 'd1', label: 'row one' },
                            { id: 'd2', label: 'row two' },
                        ],
                    },
                ]}
            />
        );
        expect(html).toContain('class="step-data');
        expect(html).toContain('overflow-y-auto');
        expect(html).toContain('max-h-');
        expect(html).toContain('row one');
        expect(html).toContain('<button');
    });
    it('citation chips and artifact cards render with click handlers wired', () => {
        const html = renderToStaticMarkup(
            <ChatThread
                messages={[
                    {
                        id: '1',
                        role: 'agent',
                        body: 'done',
                        citations: [{ id: 'c1', label: 'spec §5.1' }],
                        artifacts: [{ id: 'a1', label: 'report.md' }],
                    },
                ]}
                onCitationClick={() => {}}
                onArtifactClick={() => {}}
            />
        );
        expect(html).toContain('spec §5.1');
        expect(html).toContain('report.md');
        expect(html).toContain('citation');
        expect(html).toContain('artifact');
    });
    it('pending agent message shows a typing indicator, not an empty bubble body', () => {
        const html = renderToStaticMarkup(
            <ChatThread messages={[{ id: '1', role: 'agent', body: '', state: 'pending' }]} />
        );
        expect(html).toContain('animate-pulse');
        expect(html).not.toContain('whitespace-pre-wrap');
    });
    it('streaming agent message shows the cursor and markdown body', () => {
        const html = renderToStaticMarkup(
            <ChatThread
                messages={[{ id: '1', role: 'agent', body: 'partial **bo', state: 'streaming' }]}
            />
        );
        expect(html).toContain('▍');
        expect(html).toContain('partial');
    });
    it('failed agent message renders the error block contract (error token, monospace)', () => {
        const html = renderToStaticMarkup(
            <ChatThread messages={[{ id: '1', role: 'agent', body: 'oops', state: 'failed' }]} />
        );
        expect(html).toContain('text-error');
        expect(html).toContain('font-mono');
        expect(html).toContain('role="alert"');
    });
});
