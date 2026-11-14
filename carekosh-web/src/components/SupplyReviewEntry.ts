import { useEffect, useState } from "react";
import { DEMO, sessionEpoch } from "../services/api";
import { supplyReview } from "../services/supply-review";

/** Discover this optional service without changing ordinary inventory or Coach. */
export function useSupplyReviewAvailability(
  ownerId: string | undefined,
  online: boolean,
) {
  const [available, setAvailable] = useState<{
    owner?: string;
    visible: boolean;
  }>({ visible: false });
  useEffect(() => {
    const controller = new AbortController(),
      epoch = sessionEpoch();
    if (DEMO || !ownerId || !online) return () => controller.abort();
    void supplyReview
      .capabilities(controller.signal)
      .then((caps) => {
        if (!controller.signal.aborted && epoch === sessionEpoch())
          setAvailable({
            owner: ownerId,
            visible: caps.enabled || !!caps.has_history,
          });
      })
      .catch(() => {
        /* An unavailable optional feature must not block manual work. */
      });
    return () => controller.abort();
  }, [ownerId, online]);
  return !DEMO && online && available.owner === ownerId && available.visible;
}
