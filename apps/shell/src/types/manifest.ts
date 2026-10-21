/** Manifest schema v1 (PRD §5.1). Single source for shell-side types. */
export type DeviceMode = 'desktop' | 'mobile-ready' | 'mobile-readonly' | 'desktop-only';

/**
 * Schema v1 ext fields (issue #24, fusion-all-gui-1020 §5): optional module
 * registrations for ⌘K search, sub-page deep links and the notification
 * center. Gateway pass-through of these fields is tracked upstream.
 */
export interface SearchProvider {
    id: string;
    label: string;
    label_en?: string;
    /** Gateway-absolute path queried as `${endpoint}?q=<query>`. */
    endpoint: string;
}

export interface ModulePage {
    /** In-module hash route, e.g. '/runs'. Deep link: `${entry}#${route}`. */
    route: string;
    title: string;
    title_en?: string;
}

export type NotificationKind = 'approvals' | 'runs' | 'engine' | 'tasks';

export interface NotificationSource {
    id: string;
    label: string;
    label_en?: string;
    /** Gateway-absolute path polled for `{ count, items: [...] }`. */
    endpoint: string;
    kind: NotificationKind;
}

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
    searchProviders?: SearchProvider[];
    pages?: ModulePage[];
    notifications?: NotificationSource[];
    home?: HomeCard[];
}

/**
 * Home-page contribution (issue #32, gateway #263): one card a module
 * renders on the shell Home landing. route is a module-relative deep link
 * of the same form as ModulePage.route.
 */
export interface HomeCard {
    id: string;
    title: string;
    title_en?: string;
    description?: string;
    description_en?: string;
    route: string;
    /** true = also surface as a suggested chip under the message box. */
    chip?: boolean;
}
