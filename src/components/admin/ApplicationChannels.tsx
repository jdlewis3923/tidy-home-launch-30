import type { Channels } from "@/hooks/useApplicationChannels";

/** Two plain chips under an applicant's name: Indeed yes/no, and our texted link status. */
export default function ApplicationChannels({ c, className = "" }: { c?: Channels; className?: string }) {
  if (!c) return null;
  const linkTone = c.submitted ? "bg-primary/15 text-primary border-primary/30" : c.link === "started" ? "bg-accent/30 text-foreground border-accent" : "bg-muted text-muted-foreground border-border";
  return (
    <span className={`mt-1 flex flex-wrap gap-1 ${className}`}>
      <span className={`rounded border px-1.5 py-0.5 text-[11px] font-semibold ${c.indeed ? "bg-secondary text-secondary-foreground border-border" : "bg-muted text-muted-foreground border-border"}`}>{c.indeedLabel}</span>
      <span className={`rounded border px-1.5 py-0.5 text-[11px] font-semibold ${linkTone}`}>{c.linkLabel}</span>
      {c.callLabel && <span className={`rounded border px-1.5 py-0.5 text-[11px] font-semibold ${c.callBooked ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-border"}`}>{c.callLabel}</span>}
    </span>
  );
}
