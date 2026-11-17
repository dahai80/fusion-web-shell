/**
 * Unified-diff parser with line-anchor targets (issue #163 AC1). Pure and
 * framework-free: the review UI renders rows from this, and every comment
 * anchors to a stable `file:startNew` id so the revising agent can map
 * feedback back to exact spans.
 */

export interface DiffLine {
    kind: 'context' | 'add' | 'del' | 'hunk';
    /** Display text without the diff sigil. */
    text: string;
    oldLine: number | null;
    newLine: number | null;
}

export interface DiffHunk {
    /** Anchor id for the hunk header row: `file@@startNew`. */
    anchor: string;
    header: string;
    lines: DiffLine[];
}

export interface DiffFile {
    path: string;
    hunks: DiffHunk[];
}

function parseHeaderPath(prefix: string, line: string): string | null {
    if (!line.startsWith(prefix)) return null;
    const raw = line.slice(prefix.length).trim();
    return raw.replace(/^b\//, '') || null;
}

/** Parse a unified diff into per-file hunk/line structures. Tolerant: a
 *  non-diff input yields zero files, never throws. */
export function parseUnifiedDiff(text: string): DiffFile[] {
    const files: DiffFile[] = [];
    let current: DiffFile | null = null;
    let hunk: DiffHunk | null = null;
    let oldLine = 0;
    let newLine = 0;

    for (const raw of text.split('\n')) {
        if (raw.startsWith('--- ')) continue;
        if (raw.startsWith('+++ ')) {
            const path = parseHeaderPath('+++', raw);
            current = { path: path ?? 'unknown', hunks: [] };
            files.push(current);
            hunk = null;
            continue;
        }
        const hunkMatch = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
        if (hunkMatch && current) {
            oldLine = Number(hunkMatch[1]);
            newLine = Number(hunkMatch[2]);
            hunk = {
                anchor: `${current.path}@@${newLine}`,
                header: raw,
                lines: [],
            };
            current.hunks.push(hunk);
            continue;
        }
        if (!current || !hunk) continue;
        if (raw.startsWith('+')) {
            hunk.lines.push({ kind: 'add', text: raw.slice(1), oldLine: null, newLine });
            newLine += 1;
        } else if (raw.startsWith('-')) {
            hunk.lines.push({ kind: 'del', text: raw.slice(1), oldLine, newLine: null });
            oldLine += 1;
        } else if (raw.startsWith('\\')) {
            // "\ No newline at end of file" — no anchor target.
        } else {
            hunk.lines.push({ kind: 'context', text: raw.slice(1), oldLine, newLine });
            oldLine += 1;
            newLine += 1;
        }
    }
    return files;
}

/** All commentable anchors in render order (file → hunk → changed lines). */
export function diffAnchors(files: DiffFile[]): string[] {
    const out: string[] = [];
    for (const f of files) {
        for (const h of f.hunks) {
            out.push(h.anchor);
            for (const l of h.lines) {
                if (l.kind !== 'context') {
                    out.push(`${f.path}:${l.newLine ?? `old-${l.oldLine}`}`);
                }
            }
        }
    }
    return out;
}
