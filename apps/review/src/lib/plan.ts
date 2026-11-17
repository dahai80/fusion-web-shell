/**
 * Plan-row projection for the review surface (issue #163 AC1). A plan
 * document (planner.get_plan → plan.to_dict()) renders as anchorable rows:
 * one per step, id = the step index — the stable id the agent reads back in
 * plan.metadata.review. Pure; unknown shapes degrade to a single document
 * row so the surface never blocks on a schema drift.
 */

export interface PlanStep {
    /** Anchor id: `step-<index>` (1-based, matches agent-facing numbering). */
    anchor: string;
    index: number;
    title: string;
    detail: string;
    risk?: string;
}

export interface PlanView {
    planId: string;
    title: string;
    goal: string;
    status: string;
    steps: PlanStep[];
    overallRisk?: string;
    review?: PlanReviewMeta;
}

export interface ReviewComment {
    anchor?: { kind: string; id: string; range?: string };
    comment: string;
    chapter?: string;
    verdict?: 'approve' | 'request_changes' | 'question';
}

export interface PlanReviewMeta {
    verdict?: string;
    source?: string;
    comments?: ReviewComment[];
    reviewedAt?: string;
}

interface RawPlan {
    id?: unknown;
    task?: unknown;
    goal?: unknown;
    title?: unknown;
    status?: unknown;
    overall_risk?: unknown;
    steps?: unknown;
    metadata?: unknown;
}

/** Project a raw plan dict into render rows. */
export function planView(raw: Record<string, unknown>): PlanView {
    const p = raw as RawPlan;
    const steps: PlanStep[] = Array.isArray(p.steps)
        ? p.steps.slice(0, 200).map((s, i) => {
              const rec = (s ?? {}) as Record<string, unknown>;
              return {
                  anchor: `step-${i + 1}`,
                  index: i + 1,
                  title:
                      str(rec.title) ||
                      str(rec.description) ||
                      str(rec.action) ||
                      '(untitled step)',
                  detail: str(rec.description) && str(rec.title) ? str(rec.description)! : '',
                  risk: str(rec.risk) ?? undefined,
              };
          })
        : [];
    if (steps.length === 0) {
        steps.push({
            anchor: 'step-1',
            index: 1,
            title: str(p.goal) || '(no steps parsed)',
            detail: '',
        });
    }
    const meta = (p.metadata ?? {}) as Record<string, unknown>;
    return {
        planId: str(p.id) ?? '',
        title: str(p.title) || str(p.task) || 'Plan review',
        goal: str(p.goal) || str(p.task) || '',
        status: str(p.status) ?? 'unknown',
        steps,
        overallRisk: str(p.overall_risk) ?? undefined,
        review: isReviewMeta(meta.review) ? meta.review : undefined,
    };
}

function isReviewMeta(v: unknown): v is PlanReviewMeta {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | null {
    return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}
