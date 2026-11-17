/**
 * Anchored comment capture (issue #163 AC2). Reducer over comment drafts:
 * each entry binds a stable anchor {kind, id, range} to free text + verdict,
 * serialized exactly in the shape agent-studio #731 persists on the plan
 * record. Pure — the UI keeps this in state and renders from it.
 */

export type Verdict = 'approve' | 'request_changes' | 'question';

export interface Anchor {
    kind: 'line' | 'node' | 'span';
    id: string;
    range?: string;
}

export interface CapturedComment {
    anchor: Anchor;
    comment: string;
    verdict: Verdict;
}

export interface CommentDraft {
    key: string;
    anchor: Anchor;
    text: string;
    verdict: Verdict;
}

let seq = 0;
const nextKey = (): string => `c-${Date.now().toString(36)}-${++seq}`;

export function openDraft(anchor: Anchor, drafts: CommentDraft[]): CommentDraft[] {
    if (drafts.some((d) => d.anchor.id === anchor.id)) return drafts;
    return [...drafts, { key: nextKey(), anchor, text: '', verdict: 'question' }];
}

export function updateDraft(
    drafts: CommentDraft[],
    key: string,
    patch: Partial<Pick<CommentDraft, 'text' | 'verdict'>>
): CommentDraft[] {
    return drafts.map((d) => (d.key === key ? { ...d, ...patch } : d));
}

export function closeDraft(drafts: CommentDraft[], key: string): CommentDraft[] {
    return drafts.filter((d) => d.key !== key);
}

/** Drafts → wire shape; empty-comment drafts dropped (never sent). */
export function serialize(drafts: CommentDraft[]): CapturedComment[] {
    return drafts
        .filter((d) => d.text.trim().length > 0)
        .map((d) => ({
            anchor: {
                kind: d.anchor.kind,
                id: d.anchor.id,
                ...(d.anchor.range ? { range: d.anchor.range } : {}),
            },
            comment: d.text.trim(),
            verdict: d.verdict,
        }));
}

/** Aggregate verdict for the submit action: any request_changes wins, then
 *  question, else approve (matches the #731 plan-review semantics). */
export function aggregateVerdict(comments: CapturedComment[]): Verdict {
    if (comments.some((c) => c.verdict === 'request_changes')) return 'request_changes';
    if (comments.some((c) => c.verdict === 'question')) return 'question';
    return 'approve';
}
