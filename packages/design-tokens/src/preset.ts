import type { Config } from 'tailwindcss';
import { cssVarName, palette, radius, typography } from './tokens';

/**
 * Tailwind preset generated from the token source (G5): every fusion web UI
 * imports this preset so color/border/typography stay single-sourced.
 */
export const fusionPreset: Partial<Config> = {
    darkMode: ['class', '.light'],
    theme: {
        extend: {
            colors: Object.fromEntries(
                Object.keys(palette.dark).map((key) => [
                    // Semantic tailwind name: camelCase → kebab (bgElevated → bg-elevated).
                    key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`),
                    `var(${cssVarName(key as keyof typeof palette.dark)})`,
                ])
            ),
            borderRadius: {
                sm: radius.sm,
                DEFAULT: radius.md,
                card: radius.card,
                lg: radius.lg,
                full: radius.full,
            },
            fontFamily: {
                sans: typography.fontFamily.sans,
                mono: typography.fontFamily.mono,
            },
            fontSize: {
                xs: typography.fontSize.xs,
                sm: typography.fontSize.sm,
                base: typography.fontSize.base,
                lg: typography.fontSize.lg,
                xl: typography.fontSize.xl,
            },
            boxShadow: {
                overlay: '0 8px 24px rgb(0 0 0 / 0.35)',
            },
        },
    },
};

export default fusionPreset;
