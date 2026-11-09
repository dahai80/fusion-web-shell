/**
 * Fetch-stream SSE reader (issue #137): cowork run events need the shell
 * session Bearer header, which EventSource cannot send — so parse the
 * text/event-stream wire format manually off a streaming fetch body.
 * Yields {event, data} per SSE frame; `close()` aborts the stream.
 */

export interface SseFrame {
    event: string;
    data: string;
}

export interface SseStreamHandle {
    close(): void;
}

/**
 * Core parser: split a buffered chunk stream into complete SSE frames.
 * Exported for tests — handles the "frame split across chunks" case.
 */
export function createSseParser(onFrame: (frame: SseFrame) => void): {
    push(chunk: string): void;
    end(): void;
} {
    let buffer = '';
    let curEvent = 'message';
    let curData: string[] = [];
    let sawAny = false;

    function flush(): void {
        if (!sawAny) return;
        const data = curData.join('\n');
        const event = curEvent;
        curEvent = 'message';
        curData = [];
        sawAny = false;
        if (data) onFrame({ event, data });
    }

    function process(block: string): void {
        for (const line of block.split('\n')) {
            if (line === '') {
                flush();
                continue;
            }
            if (line.startsWith(':')) continue; // comment / heartbeat
            if (line.startsWith('event:')) {
                curEvent = line.slice(6).trim();
                sawAny = true;
            } else if (line.startsWith('data:')) {
                curData.push(line.slice(5).trimStart());
                sawAny = true;
            }
        }
    }

    return {
        push(chunk: string) {
            buffer += chunk;
            const blocks = buffer.split('\n\n');
            // Last element is an unterminated tail — keep it buffered.
            buffer = blocks.pop() ?? '';
            for (const block of blocks) process(`${block}\n`);
        },
        end() {
            if (buffer) process(`${buffer}\n`);
            flush();
        },
    };
}

export function openSseStream(
    url: string,
    token: string,
    onFrame: (frame: SseFrame) => void,
    onError: (err: unknown) => void
): SseStreamHandle {
    const controller = new AbortController();
    let parser = createSseParser(onFrame);
    console.log('[sseStream] opening:', url);
    void (async () => {
        try {
            const res = await fetch(url, {
                headers: { authorization: `Bearer ${token}`, accept: 'text/event-stream' },
                signal: controller.signal,
            });
            if (!res.ok || !res.body) {
                throw new Error(`sse stream failed: ${res.status}`);
            }
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                parser.push(decoder.decode(value, { stream: true }));
            }
            parser.end();
            console.log('[sseStream] stream ended:', url);
        } catch (err) {
            if (!controller.signal.aborted) {
                console.warn('[sseStream] stream error:', err);
                onError(err);
            }
        }
    })();
    return {
        close() {
            controller.abort();
            parser = createSseParser(() => undefined);
            console.log('[sseStream] closed:', url);
        },
    };
}
