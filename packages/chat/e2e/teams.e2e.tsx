/** E2E evidence script (issue #157): teams adapter against the LIVE studio
 *  daemon (:11442) via the #726 web bridge. Broadcast @mention → target
 *  member inbox via subscribe polling; members() presence. */
import { TeamsChatAdapter } from '../../sdk/src/teamsChat';

const BASE = 'http://127.0.0.1:11442';
const TEAM = 'e2e_c3_http';

async function main(): Promise<void> {
    const token = process.env.C3_E2E_KEY;
    if (!token) throw new Error('C3_E2E_KEY not set');

    const alice = new TeamsChatAdapter({ baseUrl: BASE, token, team: TEAM, member: 'alice' });
    const bob = new TeamsChatAdapter({ baseUrl: BASE, token, team: TEAM, member: 'bob' });
    console.log('[e2e:teams] capabilities', alice.capabilities);

    const members = await alice.members();
    console.log('[e2e:teams] members + presence', members);
    if (!members.some((m) => m.name === 'bob')) throw new Error('member bob missing');
    if (!members.every((m) => m.online === true)) throw new Error('presence not available');

    const gotBob: string[] = [];
    const unsub = bob.subscribe((m) => gotBob.push(`${m.id}:${m.body}`));

    const out = await alice.send({ body: 'hello @bob from the chat adapter', mentions: ['bob'] });
    console.log('[e2e:teams] broadcast send', out);
    if (!out.delivered) throw new Error('broadcast not delivered');

    await new Promise((r) => setTimeout(r, 3000));
    unsub();

    const hit = gotBob.find((x) => x.includes('hello @bob'));
    console.log('[e2e:teams] bob inbox via subscribe', gotBob);
    if (!hit) throw new Error('bob did not receive the @mention via inbox poll');

    const page = await bob.list(0);
    console.log('[e2e:teams] bob list(0)', page.messages.length, 'msgs, hasMore', page.hasMore);
    if (page.messages.length === 0) throw new Error('list returned empty page');

    console.log('[e2e:teams] PASS');
    process.exit(0);
}

main().catch((err) => {
    console.error('[e2e:teams] FAIL', err);
    process.exit(1);
});
