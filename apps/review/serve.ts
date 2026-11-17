/**
 * Static file server for the review module dist (issue #163). The gateway
 * proxies /shell/fusion-review/ here (web_shell.modules upstream); SPA
 * routes fall back to index.html. Port 11483 — registered in
 * ~/fusion/architecture/port-registry.yaml.
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const PORT = Number(process.env.FUSION_REVIEW_PORT ?? 11483);
const DIST = new URL('./dist/', import.meta.url).pathname;

const MIME: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
};

let serving = '';
try {
    serving = (await readdir(DIST)).join(',');
    console.log(`[review-serve] dist contents: ${serving}`);
} catch (err) {
    console.error('[review-serve] dist missing — run `bun run build` first', err);
    process.exit(1);
}

const server = Bun.serve({
    port: PORT,
    async fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === '/api/health') {
            return Response.json({
                status: 'ok',
                module: 'fusion-review',
                dist: serving.slice(0, 120),
            });
        }
        const rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
        const file = join(DIST, rel === '/' || !rel.includes('.') ? 'index.html' : rel);
        try {
            const s = await stat(file);
            if (!s.isFile()) throw new Error('not a file');
            const body = await readFile(file);
            console.log(`[review-serve] 200 ${url.pathname}`);
            return new Response(body, {
                headers: { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' },
            });
        } catch {
            console.warn(`[review-serve] 404 ${url.pathname}`);
            return new Response('not found', { status: 404 });
        }
    },
});

console.log(`[review-serve] fusion-review listening on :${server.port}`);
