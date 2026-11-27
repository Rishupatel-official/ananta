import { useEffect, useState } from "react";

export function useModelRequest<T>(key: string, load: (signal: AbortSignal) => Promise<T>, delay = 0) {
  const [result, setResult] = useState<{ key: string; data: T | null; error: string }>({ key: "", data: null, error: "" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setResult({ key, data: null, error: "" });
    const timer = setTimeout(() => {
      void load(controller.signal).then(data => {
        if (!controller.signal.aborted) setResult({ key, data, error: "" });
      }).catch(error => {
        if (!controller.signal.aborted) setResult({ key, data: null, error: error instanceof Error ? error.message : "The prediction request failed." });
      });
    }, delay);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [key, load, delay, attempt]);
  return { data: result.key === key ? result.data : null, error: result.key === key ? result.error : "",
    retry: () => setAttempt(value => value + 1) };
}
