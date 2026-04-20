import { useEffect, useState } from 'react';

/**
 * Returns true only after `isPending` has been true for `delayMs`. Suppresses
 * spinners on fast writes (most warm-server mutations < 300ms) so indicators
 * only appear when they add value — cold starts, slow networks.
 */
export function useDelayedPending(isPending: boolean, delayMs = 500): boolean {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isPending) {
      setShow(false);
      return;
    }
    const t = setTimeout(() => setShow(true), delayMs);
    return () => clearTimeout(t);
  }, [isPending, delayMs]);

  return show;
}
