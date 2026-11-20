import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MarketplacePage } from '../pages/Marketplace';
import './domSetup';

/**
 * Marketplace page contract (issue #174): server-rendered markup carries the
 * prototype's structural landmarks — hero title, category rows with counts,
 * the five prototype cards, publish-your-plugin dashed card and the upload
 * affordance. Browser visual walkthrough (light/dark, drawer interaction)
 * stays a live-shell acceptance step.
 */
describe('MarketplacePage (issue #174)', () => {
    const html = renderToStaticMarkup(<MarketplacePage />);

    it('renders the bilingual hero + search + upload affordance', () => {
        expect(html).toContain('插件市场');
        expect(html).toContain('上传插件');
        expect(html).toContain('搜索插件');
    });

    it('renders category rows with counts and installed/updates section', () => {
        expect(html).toContain('全部');
        expect(html).toContain('办公效率');
        expect(html).toContain('待更新');
        expect(html).toContain('(1)');
    });

    it('renders the prototype plugin cards with module · version line', () => {
        expect(html).toContain('Excel 报表助手');
        expect(html).toContain('RAG 知识检索');
        expect(html).toContain('Douyin 选品雷达');
        expect(html).toContain('股票行情面板');
        expect(html).toContain('代码审查 Skill');
        expect(html).toContain('fusion-rag · v2.1.0');
        expect(html).toContain('★ 4.9');
    });

    it('renders install states and the publish-your-plugin dashed card', () => {
        expect(html).toContain('已安装 ✓');
        expect(html).toContain('更新');
        expect(html).toContain('发布你的插件');
        expect(html).toContain('border-dashed');
    });

    it('uses shell tokens, not raw prototype palette classes', () => {
        expect(html).toContain('text-text-primary');
        expect(html).toContain('bg-bg-elevated');
        expect(html).not.toContain('bg-primary-600');
    });
});
