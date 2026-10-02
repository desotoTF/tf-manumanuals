import { useEffect } from "react";
import { recordManualView } from "@/lib/analytics.functions";

/** Counts one anonymous view per manual per browser session. No cookies, no identity. */
export function useRecordManualView(manualId: string | null | undefined) {
  useEffect(() => {
    if (!manualId) return;
    const key = `mv:${manualId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      /* storage blocked: still count */
    }
    const source = new URLSearchParams(window.location.search).get("src") ?? undefined;
    recordManualView({
      data: { manualId, referrer: document.referrer || undefined, source },
    }).catch(() => {});
  }, [manualId]);
}
