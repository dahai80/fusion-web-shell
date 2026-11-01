import { describe, expect, it } from 'bun:test';
import { ChatThread, Composer } from '@fusion/web-ui';
import { renderToStaticMarkup } from 'react-dom/server';

const BASE = {
    value: 'hello',
    onChange: () => {},
    onSubmit: () => {},
};

describe('@fusion/web-ui Composer (FCS-1, fusion-composer-standard-1101)', () => {
    it('zone contract: rounded-2xl zinc container, indigo focus ring, borderless textarea', () => {
        const html = renderToStaticMarkup(
            <Composer {...BASE} placeholder="ask anything" ariaLabel="composer" />
        );
        expect(html).toContain('rounded-2xl');
        expect(html).toContain('border-zinc-200/80');
        expect(html).toContain('focus-within:ring-2');
        expect(html).toContain('ring-indigo-500/30');
        expect(html).toContain('[.dark_&amp;]:bg-zinc-900');
        expect(html).toContain('border-none bg-transparent');
        expect(html).toContain('placeholder="ask anything"');
        expect(html).toContain('aria-label="composer"');
    });
    it('zone 3: auto-grow textarea clamped 1 row (44px) to 8 rows (176px)', () => {
        const html = renderToStaticMarkup(<Composer {...BASE} />);
        expect(html).toContain('height:44px');
        expect(html).toContain('max-height:176px');
        expect(html).toContain('resize-none');
    });
    it('zones 1/2: context chips and removable attachment chips render when provided', () => {
        const html = renderToStaticMarkup(
            <Composer
                {...BASE}
                contextChips={[{ key: 'wd', label: '~/fusion', onClick: () => {} }]}
                attachments={[{ key: 'f1', label: 'report.xlsx' }]}
                onRemoveAttachment={() => {}}
            />
        );
        expect(html).toContain('~/fusion');
        expect(html).toContain('report.xlsx');
        expect(html).toContain('aria-label="remove report.xlsx"');
    });
    it('zone 4 left: attach / image / reference entries appear only when provided', () => {
        const full = renderToStaticMarkup(
            <Composer
                {...BASE}
                attach={{ onFiles: () => {} }}
                images={{ onImage: () => {} }}
                references={{ items: [{ key: 'r', label: 'agent' }] }}
            />
        );
        expect(full).toContain('aria-label="attach files"');
        expect(full).toContain('aria-label="attach image"');
        expect(full).toContain('aria-label="reference"');
        const bare = renderToStaticMarkup(<Composer {...BASE} />);
        expect(bare).not.toContain('aria-label="attach files"');
        expect(bare).not.toContain('aria-label="reference"');
        expect(bare).not.toContain('aria-label="parameters"');
    });
    it('zone 4 right: params popup button only when params provided, send always rightmost', () => {
        const withParams = renderToStaticMarkup(
            <Composer
                {...BASE}
                params={{
                    model: { value: 'm1', onChange: () => {}, options: [] },
                    effort: { value: 'low', onChange: () => {}, options: [] },
                }}
            />
        );
        expect(withParams).toContain('aria-label="parameters"');
        expect(withParams).toContain('aria-haspopup="dialog"');
        // Send sits after the params trigger in the tool row.
        expect(withParams.lastIndexOf('aria-label="Send"')).toBeGreaterThan(
            withParams.lastIndexOf('aria-label="parameters"')
        );
        expect(withParams).not.toContain('<select');
    });
    it('send three states: empty disabled, content indigo, busy becomes stop (no label switch)', () => {
        const empty = renderToStaticMarkup(<Composer {...BASE} value="" sendLabel="Send" />);
        expect(empty).toContain('disabled');
        expect(empty).toContain('bg-zinc-200');
        const filled = renderToStaticMarkup(<Composer {...BASE} value="hi" sendLabel="Send" />);
        expect(filled).toContain('bg-indigo-600');
        expect(filled).toContain('aria-label="Send"');
        const busy = renderToStaticMarkup(
            <Composer
                {...BASE}
                busy
                onStop={() => {}}
                sendLabel="Send"
                stopLabel="Stop"
                sendVariant="pill"
            />
        );
        expect(busy).toContain('⏹');
        expect(busy).toContain('aria-label="Stop"');
        // FCS-1 §2: the pill label never swaps with state.
        expect(busy).toContain('>Send</span>');
        expect(busy).not.toContain('disabled');
        const busyNoStop = renderToStaticMarkup(<Composer {...BASE} busy onStop={undefined} />);
        expect(busyNoStop).toContain('disabled');
    });
    it('zone 5: persistent hint row, stop hint appended only while busy', () => {
        const idle = renderToStaticMarkup(
            <Composer {...BASE} hint="Enter 发送" stopHint="· Esc 停止" />
        );
        expect(idle).toContain('Enter 发送');
        expect(idle).not.toContain('Esc 停止');
        const busy = renderToStaticMarkup(
            <Composer {...BASE} busy onStop={() => {}} hint="Enter 发送" stopHint="· Esc 停止" />
        );
        expect(busy).toContain('Enter 发送 · Esc 停止');
        const noHint = renderToStaticMarkup(<Composer {...BASE} hint={false} />);
        expect(noHint).not.toContain('to send');
    });
    it('token discipline: no hardcoded hex colors in the rendered contract', () => {
        const html = renderToStaticMarkup(
            <Composer
                {...BASE}
                params={{ model: { value: '', onChange: () => {}, options: [] } }}
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
