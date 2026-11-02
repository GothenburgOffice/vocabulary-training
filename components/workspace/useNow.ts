import { useEffect, useState } from "react";

// The current time for rendering, refreshed every minute. Event handlers read Date.now().
export function useNow(interval = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(timer);
  }, [interval]);
  return now;
}
