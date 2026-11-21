import { useEffect, useState } from "react";

export type BackendStatus = "checking" | "ready" | "db-down" | "offline";

/** Polls GET /ready so you can see at a glance whether the API and database are up. */
export function useBackendStatus(intervalMs = 10_000): BackendStatus {
    const [status, setStatus] = useState<BackendStatus>("checking");

    useEffect(() => {
        let cancelled = false;
        const check = async () => {
            try {
                const res = await fetch("/ready", { cache: "no-store" });
                if (!cancelled) setStatus(res.ok ? "ready" : "db-down");
            } catch {
                if (!cancelled) setStatus("offline");
            }
        };
        void check();
        const timer = setInterval(check, intervalMs);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [intervalMs]);

    return status;
}
