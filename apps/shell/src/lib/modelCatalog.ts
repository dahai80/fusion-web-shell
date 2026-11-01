import type { ComposerOption } from '@fusion/web-ui';

/** Model curation (issue #87) over the gateway's session-gated model
 *  catalog (issue #94, fusion-gateway#443): local + cloud + alias entries
 *  with liveness metadata. The prefs handoff stays unchanged; only the
 *  default popover list is curated. */

/** One entry of GET /api/v1/shell/models (gateway handleModels). */
export interface ShellModel {
    id: string;
    /** "local" (fusion-mlx) | "cloud" | "alias". */
    ownedBy: string;
    /** Resident in a local engine; false/omitted for cloud and unloaded. */
    loaded: boolean;
    /** Gateway #245 normalized engine kind: "text" | "embedding" |
     *  "image" | "video" | "audio" | "draft"; "" when undeclared (cloud). */
    engineType: string;
}

/** Non-chat model families hidden from the default list (still searchable). */
const NON_CHAT_RE =
    /bge|minilm|embed|rerank|whisper|kokoro|tts|speech|asr|flux|wan2|ltx|stable-diffusion|-sd-|qwen-image|musetalk|clip|vox/i;

/** Registry / org prefixes stripped before prettifying. */
const PREFIX_RE = /^(mlx-community|models|--)+--/;

/** `mlx-community--Qwen3.8-27B-8bit` -> `Qwen3.8 27B 8bit`. */
export function friendlyModelName(id: string): string {
    const stripped = id.replace(PREFIX_RE, '');
    const pretty = stripped.replaceAll('-', ' ');
    return pretty || id;
}

export function isChatModel(id: string): boolean {
    return !NON_CHAT_RE.test(id);
}

/** Chat-usable (issue #94): cloud and alias entries are LLM backends (glm-5
 *  and friends — engine_type undeclared), local entries need a text engine
 *  so embeddings/image/video/audio never qualify; the name blocklist stays
 *  as a backstop for undeclared kinds. */
export function isChatModelInfo(m: ShellModel): boolean {
    if (!isChatModel(m.id)) return false;
    if (m.ownedBy === 'local') return m.engineType === 'text';
    return true;
}

/** Curated (empty-query list): chat-usable AND servable — cloud/alias
 *  always route, a local model must actually be loaded in the engine. */
export function isCuratedModel(m: ShellModel): boolean {
    return isChatModelInfo(m) && (m.ownedBy !== 'local' || m.loaded);
}

/** Collapse per-backend duplicates (gateway lists the same id once per
 *  serving backend, e.g. one claude-* entry per anthropic backend): merge
 *  by id — loaded/ownedBy/engineType win from the first entry that
 *  declares them, so a 10-backend model renders as one option. */
export function uniqueModels(models: ShellModel[]): ShellModel[] {
    const out: ShellModel[] = [];
    const byId = new Map<string, ShellModel>();
    for (const m of models) {
        const prev = byId.get(m.id);
        if (!prev) {
            byId.set(m.id, { ...m });
            out.push(byId.get(m.id) as ShellModel);
            continue;
        }
        prev.loaded = prev.loaded || m.loaded;
        if (!prev.ownedBy && m.ownedBy) prev.ownedBy = m.ownedBy;
        if (!prev.engineType && m.engineType) prev.engineType = m.engineType;
    }
    return out;
}

/** Build the composer model options: curated chat LLMs first, everything
 *  else flagged non-curated (popover search reveals them with raw ids). */
export function modelOptions(models: ShellModel[], defaultLabel: string): ComposerOption[] {
    return [
        { value: '', label: defaultLabel, curated: true },
        ...models.map((m) => ({
            value: m.id,
            label: friendlyModelName(m.id),
            hint: m.id,
            curated: isCuratedModel(m),
        })),
    ];
}
