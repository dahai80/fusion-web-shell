import { useEffect, useState } from 'react';

const QUERY = '(max-width: 767px)';

/**
 * Shell viewport class (spec §8.2). Same 767px breakpoint as the SDK's
 * devices.get() so shell and module agree on mobile detection.
 */
export function useViewport(): 'desktop' | 'mobile' {
    const [mobile, setMobile] = useState(
        () => typeof window !== 'undefined' && !!window.matchMedia?.(QUERY).matches
    );
    useEffect(() => {
        const mql = window.matchMedia(QUERY);
        const onChange = (e: MediaQueryListEvent) => setMobile(e.matches);
        setMobile(mql.matches);
        mql.addEventListener('change', onChange);
        return () => mql.removeEventListener('change', onChange);
    }, []);
    return mobile ? 'mobile' : 'desktop';
}
