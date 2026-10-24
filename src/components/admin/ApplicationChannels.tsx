import type { Channels } from "@/hooks/useApplicationChannels";

/** Under an applicant's name: a bold WHERE-THEY-APPLIED badge (Indeed vs Tidy website), our application result, and the call. */
export default function ApplicationChannels({ c, className = "" }: { c?: Channels; className?: string }) {
  if (!c) return null;
  const originTone = c.origin === "indeed"
    ? "bg-accent text-accent-foreground border-accent"
    : c.origin === "website" ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-border";
  const linkTone = c.submitted ? "bg-primary/15 text-primary border-primary/40" : c.link === "started" ? "bg-destructive/10 text-destructive border-destructive/40" : "bg-muted text-muted-foreground border-border";
  return (
    <span className={`mt-1 flex flex-wrap gap-1 ${className}`}>
      <span className={`rounded border px-1.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide ${originTone}`}>{c.origin === "indeed" ? "INDEED" : c.origin === "website" ? "TIDY WEBSITE" : "OTHER SOURCE"}</span>
      <span className={`rounded border px-1.5 py-0.5 text-[11px] font-semibold ${linkTone}`}>{c.linkLabel}</span>
      {c.callLabel && <span className={`rounded border px-1.5 py-0.5 text-[11px] font-semibold ${c.callBooked ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-border"}`}>{c.callLabel}</span>}
    </span>
  );
}
