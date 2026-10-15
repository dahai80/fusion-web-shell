/** Manifest schema v1 (PRD §5.1). Single source for shell-side types. */
export type DeviceMode = 'desktop' | 'mobile-ready' | 'mobile-readonly' | 'desktop-only';

export interface ModuleManifest {
    id: string;
    title: string;
    title_en?: string;
    version?: string;
    path: string;
    icon?: string;
    entry: string;
    health?: string | null;
    backend?: string | null;
    devices: DeviceMode[];
    category: 'platform' | 'domain' | 'infra' | 'dev';
    unreachable?: boolean;
}
