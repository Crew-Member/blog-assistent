import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Laedt Daten und pollt, solange `shouldPoll` true liefert (laufende KI-Auftraege).
 * Auch ein manuelles `reload()` startet das Polling neu, wenn die frischen Daten noch laufende Auftraege zeigen.
 */
export function useLoad<T>(load: () => Promise<T>, shouldPoll?: (data: T) => boolean) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const loadRef = useRef(load);
  loadRef.current = load;
  const pollRef = useRef(shouldPoll);
  pollRef.current = shouldPoll;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const alive = useRef(true);

  const reload = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    try {
      const next = await loadRef.current();
      if (!alive.current) return undefined;
      setData(next);
      setError(undefined);
      if (pollRef.current?.(next)) timer.current = setTimeout(() => void reload(), 3000);
      return next;
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : String(e));
      return undefined;
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void reload();
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [reload]);

  return { data, error, reload };
}

export function useHashRoute(): string {
  const [hash, setHash] = useState(window.location.hash || "#/");
  useEffect(() => {
    const onChange = () => setHash(window.location.hash || "#/");
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}
