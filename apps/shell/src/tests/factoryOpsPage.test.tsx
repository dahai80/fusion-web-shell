import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { FactoryOpsPage } from '../pages/FactoryOps';
import './domSetup';

/**
 * Factory Ops page structural contract (issue #179): server-rendered markup
 * carries the operator console landmarks — bilingual header, three tabs
 * (orders / pricing / discounts), the owed-action queue labels and the
 * honest DAG empty state. The static render has no data (effects do not
 * run), so data-dependent rendering — order cards, the mock-payment button
 * on `created` rows, price rows — stays live-shell acceptance.
 */
describe('FactoryOpsPage (issue #179)', () => {
    const html = renderToStaticMarkup(<FactoryOpsPage />);

    it('renders the bilingual operator header + refresh', () => {
        expect(html).toContain('工厂运营');
        expect(html).toContain('刷新');
    });

    it('renders the three ops tabs', () => {
        expect(html).toContain('订单队列');
        expect(html).toContain('定价配置');
        expect(html).toContain('折扣规则');
    });

    it('renders the owed-action queue labels and DAG empty state', () => {
        expect(html).toContain('客户待支付');
        expect(html).toContain('待开工 (运营)');
        expect(html).toContain('进行中 / 已完结');
        expect(html).toContain('DAG 运行视图');
        expect(html).toContain('构建管线尚未接入');
    });

    it('renders empty-queue placeholders before data loads', () => {
        expect(html).toContain('暂无订单');
    });

    it('uses shell tokens, not raw palette classes', () => {
        expect(html).toContain('text-text-primary');
        expect(html).toContain('border-border');
        expect(html).not.toContain('bg-primary-600');
    });
});
