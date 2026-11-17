import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Issue #163: the gateway hosts this dist at /shell/fusion-review/ — base
// must match so asset refs survive the SPA route. Dev proxies agent-studio
// RPC straight to the daemon for standalone testing.
export default defineConfig({
    plugins: [react()],
    base: '/shell/fusion-review/',
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src'),
        },
    },
    server: {
        port: 11597,
        proxy: {
            '/shell/fusion-agent-studio/v1/rpc': {
                target: 'http://localhost:11432',
                changeOrigin: true,
            },
        },
    },
    build: {
        target: 'es2020',
        sourcemap: false,
    },
});
