/** Full DOM for bun test via happy-dom (stores like lang.ts touch document at
 *  module load — the Storage shim in setup.ts is not enough). */
import { GlobalRegistrator } from '@happy-dom/global-registrator';

// Other suites (packages/sdk) register too; second register throws.
try {
    GlobalRegistrator.register();
} catch (err) {
    console.log('[domSetup] happy-dom already registered, skip');
}
