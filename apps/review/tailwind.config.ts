import { fusionPreset } from '@fusion/design-tokens/preset';
import type { Config } from 'tailwindcss';

// Review module tokens (issue #163): shared design-token preset, same
// slate/indigo language as the host shell; dark-mode default like the host.
const preset = fusionPreset as Partial<Config>;

export default {
    ...preset,
    darkMode: ['class', '.light'],
    content: ['./index.html', './src/**/*.{ts,tsx}'],
} satisfies Config;
