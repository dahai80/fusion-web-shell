import type { ComposerOption } from '@fusion/web-ui';

/** Model curation (issue #87): shell-side mapping over the raw
 *  fetchEngineModels() output — the engine API and the prefs handoff stay
 *  unchanged, only the default popover list is curated. */

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

/** Build the composer model options: curated chat LLMs first, everything
 *  else flagged non-curated (popover search reveals them with raw ids). */
export function modelOptions(rawIds: string[], defaultLabel: string): ComposerOption[] {
    return [
        { value: '', label: defaultLabel, curated: true },
        ...rawIds.map((id) => ({
            value: id,
            label: friendlyModelName(id),
            hint: id,
            curated: isChatModel(id),
        })),
    ];
}
