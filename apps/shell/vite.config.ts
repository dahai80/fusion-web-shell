import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [react()],
    // Expose FUSION_DEV_MODULES to the client (PRD 7.1 spelling, issue #14).
    envPrefix: ['VITE_', 'FUSION_'],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src'),
        },
    },
    server: {
        port: 11430,
        proxy: {
            '/api': {
                target: 'http://localhost:11432',
                changeOrigin: true,
            },
            // Dev-only passthroughs (issues #13/#15 / F-7): relative-entry
            // modules resolve against this dev server; without the proxies
            // they recurse into the shell SPA itself. Prod serves all routes
            // same-origin from the gateway at :11432.
            '/admin': {
                target: 'http://localhost:11432',
                changeOrigin: true,
            },
            '/shell': {
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
