/** Full DOM for bun test via happy-dom (host.ts/index.ts touch window at
 *  module scope). Default window URL is about:blank (origin null) — pin a
 *  realistic host origin like the real shell page has. */
import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
    GlobalRegistrator.register();
} catch (err) {
    console.log('[sdk domSetup] happy-dom already registered, skip');
}
if (!/^https?:\/\//.test(window.location.origin ?? '')) {
    window.location.href = 'http://127.0.0.1:11430/';
}
