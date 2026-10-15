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
            // Dev-only /shell passthrough (issue #13 / F-7): relative-entry
            // modules resolve against this dev server; without the proxy they
            // recurse into the shell SPA itself. Prod serves both same-origin
            // from the gateway at :11432.
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
