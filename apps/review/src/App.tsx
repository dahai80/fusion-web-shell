import { PendingList } from '@/components/PendingList';
import { ReviewPane } from '@/components/ReviewPane';
import { type ReviewRpc, type RpcError, rpcFromEnv } from '@/lib/api';
import { useEffect, useState } from 'react';

/**
 * Review module root (issue #163): pending queue → plan/diff pane with
 * line-anchored comment capture → structured round-trip to the agent
 * session via the agent-studio web bridge (#731/#730 contract).
 * Deep link: ?plan=<id> jumps straight into a plan.
 */

export function App() {
    const [rpc] = useState<ReviewRpc>(() => rpcFromEnv());
    const [planId, setPlanId] = useState<string | null>(() => {
        const q = new URLSearchParams(window.location.search);
        return q.get('plan');
    });
    const [reload, setReload] = useState(0);

    useEffect(() => {
        document.documentElement.classList.add('dark');
    }, []);

    if (planId) {
        return (
            <ReviewPane
                rpc={rpc}
                planId={planId}
                onBack={() => {
                    setPlanId(null);
                    setReload((n) => n + 1);
                }}
                onSubmitted={() => setReload((n) => n + 1)}
            />
        );
    }
    return <PendingList rpc={rpc} reload={reload} onOpen={(id) => setPlanId(id)} />;
}

export function ErrorNote({ err }: { err: RpcError | Error }): null {
    console.error('[review] error', err);
    return null;
}
