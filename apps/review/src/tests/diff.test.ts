import { describe, expect, test } from 'bun:test';
import { diffAnchors, parseUnifiedDiff } from '@/lib/diff';

const SAMPLE = `--- a/src/app.ts
+++ b/src/app.ts
@@ -10,4 +10,5 @@ import { x } from './x';
 const keep = 1;
-const gone = 2;
+const added = 3;
+const added2 = 4;
 const tail = 5;`;

describe('parseUnifiedDiff', () => {
    test('parses file, hunk, and changed lines with numbers', () => {
        const files = parseUnifiedDiff(SAMPLE);
        expect(files.length).toBe(1);
        expect(files[0]!.path).toBe('src/app.ts');
        expect(files[0]!.hunks.length).toBe(1);
        const lines = files[0]!.hunks[0]!.lines;
        expect(lines.map((l) => l.kind)).toEqual(['context', 'del', 'add', 'add', 'context']);
        expect(lines[1]!.oldLine).toBe(11);
        expect(lines[2]!.newLine).toBe(11);
        expect(lines[4]!.newLine).toBe(13);
    });

    test('hunk anchor carries file + new start', () => {
        const files = parseUnifiedDiff(SAMPLE);
        expect(files[0]!.hunks[0]!.anchor).toBe('src/app.ts@@10');
    });

    test('non-diff input yields zero files, never throws', () => {
        expect(parseUnifiedDiff('hello\nworld')).toEqual([]);
        expect(parseUnifiedDiff('')).toEqual([]);
    });

    test('anchors list only changed lines plus hunk headers', () => {
        const anchors = diffAnchors(parseUnifiedDiff(SAMPLE));
        expect(anchors).toEqual([
            'src/app.ts@@10',
            'src/app.ts:old-11',
            'src/app.ts:11',
            'src/app.ts:12',
        ]);
    });
});
