import { useCallback, useEffect, useRef, useState } from "react";

interface UsePollingOptions<T> {
  enabled: boolean;
  intervalMs?: number;
  fetcher: () => Promise<T>;
  shouldStop?: (data: T) => boolean;
}

export function usePolling<T>({
  enabled,
  intervalMs = 2000,
  fetcher,
  shouldStop,
}: UsePollingOptions<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const fetcherRef = useRef(fetcher);
  const stopRef = useRef(shouldStop);
  fetcherRef.current = fetcher;
  stopRef.current = shouldStop;

  const tick = useCallback(async () => {
    try {
      const next = await fetcherRef.current();
      setData(next);
      setError(null);
      if (stopRef.current?.(next)) {
        setIsPolling(false);
        return false;
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Polling failed");
      return true;
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setIsPolling(false);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setIsPolling(true);

    const loop = async () => {
      const keepGoing = await tick();
      if (cancelled || !keepGoing) {
        setIsPolling(false);
        return;
      }
      timer = setTimeout(loop, intervalMs);
    };

    void loop();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled, intervalMs, tick]);

  return { data, error, isPolling };
}
