import type { ModuleManifest } from '@/types/manifest';

/**
 * Home composer popover — AGENT CAPABILITIES (issue #50): the delegation
 * targets are the composer-relevant capability surface; their manifest pages
 * are what a natural-language instruction can actually reach today. The
 * ACTIONS section is intentionally omitted — the shell has no attachments yet.
 */

const DELEGATION_TARGETS = ['fusion-cowork', 'fusion-agent-studio'] as const;

export interface ComposerCapability {
    moduleId: string;
    route: string;
    title: string;
}

export function composerCapabilities(
    manifests: ModuleManifest[],
    lang: 'zh' | 'en'
): ComposerCapability[] {
    const byId = new Map(manifests.map((m) => [m.id, m]));
    const caps: ComposerCapability[] = [];
    for (const id of DELEGATION_TARGETS) {
        const m = byId.get(id);
        if (!m) continue;
        for (const p of m.pages ?? []) {
            const title = lang === 'en' && p.title_en ? p.title_en : p.title;
            caps.push({ moduleId: id, route: p.route, title });
        }
    }
    return caps;
}
