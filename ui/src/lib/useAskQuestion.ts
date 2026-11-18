import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, ask, toFriendlyMessage, type AskResponse } from "@/lib/api";

export type AskOutcome = AskResponse & { historyError?: string };

type AskFailure = {
  answer?: unknown;
  model_version?: unknown;
};

export function useAskQuestion(imageId: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);

  const submit = useCallback(
    async (question: string): Promise<AskOutcome | null> => {
      if (!imageId || controller.current) return null;
      const nextController = new AbortController();
      controller.current = nextController;
      setError("");
      setLoading(true);
      try {
        return await ask(imageId, question, nextController.signal);
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 500) {
          const payload = cause.payload as AskFailure | null;
          if (typeof payload?.answer === "string") {
            return {
              entry_id: "",
              created_at: "",
              answer: payload.answer,
              model_version:
                typeof payload.model_version === "string"
                  ? payload.model_version
                  : "unknown",
              historyError: cause.message,
            };
          }
        }
        if (
          cause instanceof Error &&
          (cause.name === "AbortError" || nextController.signal.aborted)
        ) {
          return null;
        }
        if (mounted.current) {
          setError(
            toFriendlyMessage(
              cause,
              "We couldn't answer that question. Please try again.",
            ),
          );
        }
        return null;
      } finally {
        if (controller.current === nextController) {
          controller.current = null;
          if (mounted.current) setLoading(false);
        }
      }
    },
    [imageId],
  );

  const cancel = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setLoading(false);
    setError("");
  }, []);

  return { submit, cancel, loading, error };
}
