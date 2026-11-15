import { useEffect } from "react";

import { announce } from "@/lib/a11y";

// Progress has no visual output of its own; it exists so a screen reader hears
// each milestone without the calling screen re-implementing live regions.
export function ProgressAnnouncer({ message }: { message: string | null }) {
  useEffect(() => {
    if (message) announce(message, { queue: true });
  }, [message]);

  return null;
}
