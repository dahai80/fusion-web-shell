import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Gateway #506 will host this dist at /auth — base must be /auth/ so asset
// refs survive the SPA route. Dev proxies auth API calls to the gateway.
export default defineConfig({
    plugins: [react()],
    base: '/auth/',
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src'),
        },
    },
    server: {
        port: 11431,
        proxy: {
            '/api/auth': {
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
