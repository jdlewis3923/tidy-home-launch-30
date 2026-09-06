/**
 * Notifications — /pro/notifications
 * Everything Tidy has sent this Pro. Opening the screen marks them read.
 */
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import ProShell from "@/components/pro/portal/ProShell";
import { EmptyState, ErrorState, ScheduleSkeleton } from "@/components/pro/portal/kit";
import { fetchNotifications, markNotificationsRead, type ProNotification } from "@/lib/pro-portal";
import { useProSession } from "@/hooks/useProSession";

export default function ProNotifications() {
  const { userId } = useProSession();
  const [rows, setRows] = useState<ProNotification[] | null>(null);
  const [error, setError] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setError(false);
    fetchNotifications()
      .then(async (n) => {
        if (cancelled) return;
        setRows(n);
        await markNotificationsRead(n.filter((x) => !x.read_at).map((x) => x.id));
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [userId, nonce]);

  return (
    <ProShell title="Notifications" back="/pro/schedule">
      {!rows && !error && <ScheduleSkeleton />}
      {error && <ErrorState title="Couldn't load notifications" onRetry={() => setNonce((n) => n + 1)} />}
      {rows && !error && rows.length === 0 && (
        <EmptyState icon={Bell} title="Nothing new" body="Messages from Tidy show up here." />
      )}
      {rows && rows.length > 0 && (
        <div className="space-y-3 p-4">
          {rows.map((n) => (
            <article
              key={n.id}
              className={`rounded-2xl border bg-white p-4 ${
                n.read_at ? "border-[hsl(var(--pro-line))]" : "border-[hsl(var(--pro-blue)/0.35)]"
              }`}
            >
              <p className="text-[15px] font-bold text-[hsl(var(--pro-ink))]">{n.title}</p>
              {n.body && <p className="mt-1 text-[14px] text-[hsl(var(--pro-ink-soft))]">{n.body}</p>}
              <p className="mt-2 text-[12px] text-[hsl(var(--pro-ink-soft))]">
                {new Date(n.created_at).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
            </article>
          ))}
        </div>
      )}
    </ProShell>
  );
}
