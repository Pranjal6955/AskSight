import { useEffect, useRef } from "react";

import { announce } from "@/lib/a11y";

type Props = {
  working: boolean;
  startMessage: string;
  stillWorkingMessage: string;
  finishMessage: string | null;
  delayMs?: number;
};

// Progress has no visual output of its own. It speaks the start, one delayed
// wait update, and completion without each screen rebuilding the timer.
export function ProgressAnnouncer({
  working,
  startMessage,
  stillWorkingMessage,
  finishMessage,
  delayMs = 8000,
}: Props) {
  const wasWorking = useRef(false);

  useEffect(() => {
    if (working) {
      if (!wasWorking.current) announce(startMessage, { queue: true });
      wasWorking.current = true;
      const timer = setTimeout(
        () => announce(stillWorkingMessage, { queue: true }),
        delayMs,
      );
      return () => clearTimeout(timer);
    }

    if (wasWorking.current && finishMessage) {
      wasWorking.current = false;
      announce(finishMessage, { queue: true });
    }
  }, [working, startMessage, stillWorkingMessage, finishMessage, delayMs]);

  return null;
}
