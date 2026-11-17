/** Full DOM for bun test via happy-dom (api tests stub fetch against a
 *  window-ish environment; Response/URL globals). */
import { GlobalRegistrator } from '@happy-dom/global-registrator';

// Other suites register too; second register throws.
try {
    GlobalRegistrator.register();
} catch (err) {
    console.log('[domSetup] happy-dom already registered, skip');
}
