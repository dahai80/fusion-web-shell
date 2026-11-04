import type { Config } from 'tailwindcss';

/**
 * Auth portal tokens (issue #125, design doc §6): Apple black/white refined —
 * white bg, #1d1d1f ink, #d2d2d7 hairlines, black pill buttons. Deliberately
 * NOT the shell's slate/indigo preset: the portal is a standalone surface
 * shared by site + shell and keeps its own visual language.
 */
export default {
    content: ['./index.html', './src/**/*.{ts,tsx}'],
    theme: {
        extend: {
            colors: {
                ink: '#1d1d1f',
                hairline: '#d2d2d7',
                paper: '#ffffff',
                subtle: '#6e6e73',
                accent: '#0071e3',
                danger: '#d70015',
                ok: '#248a3d',
            },
            borderRadius: {
                pill: '980px',
                card: '18px',
            },
            fontFamily: {
                sans: [
                    '-apple-system',
                    'BlinkMacSystemFont',
                    'SF Pro Text',
                    'Helvetica Neue',
                    'PingFang SC',
                    'sans-serif',
                ],
            },
        },
    },
} satisfies Config;
