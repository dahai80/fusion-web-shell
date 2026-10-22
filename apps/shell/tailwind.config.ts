import { fusionPreset } from '@fusion/web-ui/preset';
import type { Config } from 'tailwindcss';

// Spread the shared preset at the TOP LEVEL instead of via the `preset` key:
// through the preset indirection, resolveConfig drops both the class-based
// darkMode and the semantic color mapping (bg-elevated / text-primary / …),
// so every `bg-bg-*` / `text-text-*` utility class silently vanished from the
// build — dialogs and popovers rendered transparent with dark-on-dark text in
// light theme (command palette, notification center).
const preset = fusionPreset as Partial<Config>;

export default {
    ...preset,
    darkMode: ['class', '.light'],
    content: ['./index.html', './src/**/*.{ts,tsx}'],
} satisfies Config;
