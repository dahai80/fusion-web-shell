import { describe, expect, test } from 'bun:test';
import { planView } from '@/lib/plan';

describe('planView', () => {
    test('projects raw plan dict into anchorable step rows', () => {
        const v = planView({
            id: 'plan-1',
            task: 'Ship thing',
            status: 'pending',
            overall_risk: 'medium',
            steps: [
                { title: 'Design', description: 'Draw the boxes', risk: 'low' },
                { description: 'Only description' },
            ],
        });
        expect(v.planId).toBe('plan-1');
        expect(v.steps.length).toBe(2);
        expect(v.steps[0]!.anchor).toBe('step-1');
        expect(v.steps[0]!.title).toBe('Design');
        expect(v.steps[0]!.detail).toBe('Draw the boxes');
        expect(v.steps[1]!.title).toBe('Only description');
        expect(v.steps[1]!.detail).toBe('');
    });

    test('schema drift degrades to a single document row, never throws', () => {
        const v = planView({ id: 'plan-2', task: 'Weird plan', steps: 'not-a-list' });
        expect(v.steps.length).toBe(1);
        expect(v.steps[0]!.anchor).toBe('step-1');
        expect(v.title).toBe('Weird plan');
    });

    test('surfaces an existing review from plan.metadata', () => {
        const v = planView({
            id: 'plan-3',
            task: 'T',
            metadata: {
                review: { verdict: 'request_changes', comments: [{ comment: 'fix step 2' }] },
            },
        });
        expect(v.review?.verdict).toBe('request_changes');
        expect(v.review?.comments?.length).toBe(1);
    });
});
