import { useCallback, useEffect, useRef, useState } from "react";

interface UsePollingOptions<T> {
  enabled: boolean;
  intervalMs?: number;
  getIntervalMs?: (data: T | null, consecutiveFailures: number) => number;
  fetcher: () => Promise<T>;
  shouldStop?: (data: T) => boolean;
}

export function usePolling<T>({ enabled, intervalMs = 2000, getIntervalMs, fetcher, shouldStop }: UsePollingOptions<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const fetcherRef = useRef(fetcher);
  const stopRef = useRef(shouldStop);
  const intervalRef = useRef(getIntervalMs);
  const dataRef = useRef<T | null>(null);
  const failuresRef = useRef(0);
  fetcherRef.current = fetcher;
  stopRef.current = shouldStop;
  intervalRef.current = getIntervalMs;

  const tick = useCallback(async () => {
    try {
      const next = await fetcherRef.current();
      dataRef.current = next;
      failuresRef.current = 0;
      setData(next); setError(null);
      if (stopRef.current?.(next)) { setIsPolling(false); return false; }
      return true;
    } catch (err) {
      failuresRef.current += 1;
      setError(err instanceof Error ? err.message : "Polling failed");
      return true;
    }
  }, []);

  useEffect(() => {
    if (!enabled) { setIsPolling(false); return; }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setIsPolling(true);
    const loop = async () => {
      const keepGoing = await tick();
      if (cancelled || !keepGoing) { setIsPolling(false); return; }
      const delay = intervalRef.current?.(dataRef.current, failuresRef.current) ?? intervalMs;
      timer = setTimeout(loop, Math.max(1000, delay));
    };
    void loop();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [enabled, intervalMs, tick]);
  return { data, error, isPolling };
}