/**
 * Tidy Pro Portal — reusable component kit.
 *
 * One outline icon family (lucide), tap targets >= 44px, operational text
 * (pay + address) never shrunk. All color comes from --pro-* tokens.
 */
import { forwardRef, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, Check, ChevronRight, Clock, Copy, Dog, Car, KeyRound,
  MapPin, ShieldAlert, Sparkles, Leaf, StickyNote, Trash2, Upload,
} from "lucide-react";
import { money } from "@/lib/pro-pay";

/* ---------------- surfaces ---------------- */

export function ProCard({
  children,
  className = "",
  tone = "white",
}: {
  children: ReactNode;
  className?: string;
  tone?: "white" | "blue" | "green" | "amber" | "gold" | "red" | "tint" | "navy";
}) {
  const tones: Record<string, string> = {
    white: "bg-white pro-hair pro-card",
    tint: "bg-[hsl(var(--pro-tint))] border-[hsl(var(--pro-blue)/0.12)]",
    navy: "bg-[hsl(var(--pro-navy))] border-white/10 text-white",
    blue: "bg-[hsl(var(--pro-blue-soft))] border-[hsl(var(--pro-blue)/0.16)]",
    green: "bg-[hsl(var(--pro-green-soft))] border-[hsl(var(--pro-green)/0.2)]",
    amber: "bg-[hsl(var(--pro-amber-soft))] border-[hsl(var(--pro-amber)/0.28)]",
    gold: "bg-[hsl(var(--pro-gold-soft))] border-[hsl(var(--pro-gold)/0.3)]",
    red: "bg-[hsl(var(--pro-red-soft))] border-[hsl(var(--pro-red)/0.24)]",
  };
  return (
    <div className={`rounded-[18px] border p-5 ${tones[tone]} ${className}`}>{children}</div>
  );
}

/** Uppercase micro-label used above titles and metrics. */
export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`pro-eyebrow text-[hsl(var(--pro-ink-soft))] ${className}`}>{children}</p>;
}

/** Section heading with an optional trailing action, on a hairline baseline. */
export function SectionHeader({
  title,
  action,
  className = "",
}: {
  title: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-end justify-between gap-3 pb-2 ${className}`}>
      <h2 className="text-[17px] font-bold tracking-[-0.01em] text-[hsl(var(--pro-ink))]">{title}</h2>
      {action}
    </div>
  );
}

/**
 * Navy brand region used to anchor the top of a screen. Frames information —
 * never consumes a whole screen.
 */
export function HeroPanel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-[22px] bg-[hsl(var(--pro-navy))] p-5 text-white pro-float ${className}`}
    >
      <div aria-hidden className="pro-hero-texture pointer-events-none absolute inset-0 opacity-60" />
      <div className="relative">{children}</div>
    </div>
  );
}


/* ---------------- buttons ---------------- */

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "outlined" | "danger";
  full?: boolean;
};

export const ProButton = forwardRef<HTMLButtonElement, BtnProps>(function ProButton(
  { variant = "primary", full, className = "", children, ...rest },
  ref,
) {
  const base =
    "min-h-[50px] rounded-xl px-5 text-[15px] font-bold tracking-[-0.01em] transition-[transform,box-shadow,background-color] duration-150 active:scale-[0.98] disabled:opacity-45 disabled:shadow-none disabled:active:scale-100 inline-flex items-center justify-center gap-2";
  const styles: Record<string, string> = {
    primary:
      "bg-[hsl(var(--pro-blue))] text-white shadow-[0_6px_16px_hsl(var(--pro-blue)/0.28)] hover:bg-[hsl(var(--pro-blue)/0.94)]",
    secondary: "bg-[hsl(var(--pro-navy))] text-white shadow-[0_6px_16px_hsl(var(--pro-navy)/0.22)]",
    outlined:
      "border border-[hsl(var(--pro-blue)/0.35)] text-[hsl(var(--pro-blue))] bg-white",
    danger: "bg-[hsl(var(--pro-red))] text-white",
  };
  return (
    <button ref={ref} className={`${base} ${styles[variant]} ${full ? "w-full" : ""} ${className}`} {...rest}>
      {children}
    </button>
  );
});

/* ---------------- status pill ---------------- */

export function StatusPill({
  tone,
  children,
}: {
  tone: "green" | "amber" | "blue" | "red" | "neutral" | "gold";
  children: ReactNode;
}) {
  const tones: Record<string, string> = {
    green: "bg-[hsl(var(--pro-green-soft))] text-[hsl(var(--pro-green))] ring-[hsl(var(--pro-green)/0.2)]",
    amber: "bg-[hsl(var(--pro-amber-soft))] text-[hsl(38_80%_32%)] ring-[hsl(var(--pro-amber)/0.25)]",
    gold: "bg-[hsl(var(--pro-gold-soft))] text-[hsl(38_80%_32%)] ring-[hsl(var(--pro-gold)/0.3)]",
    blue: "bg-[hsl(var(--pro-blue-soft))] text-[hsl(var(--pro-blue))] ring-[hsl(var(--pro-blue)/0.18)]",
    red: "bg-[hsl(var(--pro-red-soft))] text-[hsl(var(--pro-red))] ring-[hsl(var(--pro-red)/0.22)]",
    neutral: "bg-[hsl(var(--pro-ground))] text-[hsl(var(--pro-ink-soft))] ring-[hsl(var(--pro-navy)/0.08)]",
  };
  return (
    <span
      className={`pro-eyebrow inline-flex items-center gap-1 rounded-full px-2.5 py-1 ring-1 animate-in fade-in duration-300 ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/* ---------------- service visual language ---------------- */

const SERVICE_META: Record<
  string,
  { icon: typeof Sparkles; ring: string; edge: string; label: string }
> = {
  cleaning: {
    icon: Sparkles,
    ring: "bg-[hsl(var(--pro-blue-soft))] text-[hsl(var(--pro-blue))]",
    edge: "bg-[hsl(var(--pro-blue))]",
    label: "House cleaning",
  },
  lawn: {
    icon: Leaf,
    ring: "bg-[hsl(var(--pro-green-soft))] text-[hsl(var(--pro-lawn))]",
    edge: "bg-[hsl(var(--pro-lawn))]",
    label: "Lawn care",
  },
  detailing: {
    icon: Car,
    ring: "bg-[hsl(210_40%_94%)] text-[hsl(var(--pro-car))]",
    edge: "bg-[hsl(var(--pro-car))]",
    label: "Car care",
  },
};

export function serviceEdge(service?: string | null) {
  return (SERVICE_META[service ?? ""] ?? SERVICE_META.cleaning).edge;
}

export function ServiceBadge({ service, size = 40 }: { service?: string | null; size?: number }) {
  const meta = SERVICE_META[service ?? ""] ?? SERVICE_META.cleaning;
  const Icon = meta.icon;
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-[12px] ${meta.ring}`}
      style={{ width: size, height: size }}
      aria-label={meta.label}
    >
      <Icon className="h-5 w-5" aria-hidden strokeWidth={1.9} />
    </span>
  );
}

/* ---------------- metric tile ---------------- */

export function MetricTile({
  label,
  value,
  hint,
  tone = "white",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "white" | "blue" | "green" | "amber" | "gold" | "red" | "tint" | "navy";
}) {
  return (
    <ProCard tone={tone} className="p-4">
      <Eyebrow className={tone === "navy" ? "text-white/60" : ""}>{label}</Eyebrow>
      <p
        className={`pro-num mt-1.5 text-[26px] font-extrabold leading-none ${
          tone === "navy" ? "text-white" : "text-[hsl(var(--pro-ink))]"
        }`}
      >
        {value}
      </p>
      {hint && (
        <p
          className={`mt-1.5 text-[12.5px] font-medium ${
            tone === "navy" ? "text-white/65" : "text-[hsl(var(--pro-ink-soft))]"
          }`}
        >
          {hint}
        </p>
      )}
    </ProCard>
  );

}

/* ---------------- visit row ---------------- */

export function VisitRow({
  to,
  service,
  street,
  zip,
  window,
  payCents,
  isNext,
  completed,
  sample,
}: {
  to: string;
  service?: string | null;
  street?: string | null;
  zip?: string | null;
  window: string;
  payCents?: number | null;
  isNext?: boolean;
  completed?: boolean;
  sample?: boolean | null;
}) {
  return (
    <Link
      to={to}
      className="relative flex min-h-[76px] items-center gap-3.5 border-b border-[hsl(var(--pro-navy)/0.07)] bg-white px-4 py-3.5 pl-5 last:border-0 active:bg-[hsl(var(--pro-tint))]"
    >
      <span aria-hidden className={`absolute bottom-3 left-0 top-3 w-[3px] rounded-r-full ${serviceEdge(service)}`} />
      <ServiceBadge service={service} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="pro-num inline-flex items-center gap-1 text-[13px] font-semibold text-[hsl(var(--pro-ink-soft))]">
            <Clock className="h-3.5 w-3.5" aria-hidden strokeWidth={1.9} /> {window}
          </span>
          {isNext && <StatusPill tone="blue">Next</StatusPill>}
          {sample && <StatusPill tone="neutral">Sample</StatusPill>}
          {completed && (
            <span className="grid h-4 w-4 place-items-center rounded-full bg-[hsl(var(--pro-green))]">
              <Check className="h-3 w-3 text-white" aria-label="Completed" strokeWidth={3} />
            </span>
          )}
        </span>
        <span className="mt-1 block truncate text-[16px] font-bold tracking-[-0.01em] text-[hsl(var(--pro-ink))]">
          {street ?? "Address to be confirmed"}
        </span>
        <span className="pro-num text-[13px] text-[hsl(var(--pro-ink-soft))]">{zip ?? ""}</span>
      </span>
      <span className="text-right">
        <span className="pro-num block text-[19px] font-extrabold text-[hsl(var(--pro-ink))]">{money(payCents)}</span>
        <span className="pro-eyebrow text-[hsl(var(--pro-ink-soft))]">Visit pay</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-[hsl(var(--pro-navy)/0.28)]" aria-hidden />
    </Link>
  );
}


/* ---------------- banners, empty, error, skeleton ---------------- */

export function WarningBanner({
  title,
  body,
  pulse,
  action,
}: {
  title: string;
  body: string;
  pulse?: boolean;
  action?: ReactNode;
}) {
  return (
    <div
      className={`mx-4 mt-4 flex gap-3 rounded-2xl border border-[hsl(var(--pro-amber)/0.35)] bg-[hsl(var(--pro-amber-soft))] p-4 ${pulse ? "pro-pulse-once" : ""}`}
      role="status"
    >
      <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--pro-amber))]" aria-hidden />
      <div>
        <p className="text-[15px] font-bold text-[hsl(var(--pro-ink))]">{title}</p>
        <p className="mt-0.5 text-[14px] leading-snug text-[hsl(var(--pro-ink))]">{body}</p>
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}

/** Small branded line illustration — never a grey box. */
export function EmptyState({
  title,
  body,
  icon: Icon = Sparkles,
  action,
}: {
  title: string;
  body?: string;
  icon?: typeof Sparkles;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-8 py-12 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-full border-2 border-dashed border-[hsl(var(--pro-sky)/0.6)] bg-[hsl(var(--pro-blue-soft))]">
        <Icon className="h-7 w-7 text-[hsl(var(--pro-sky))]" aria-hidden strokeWidth={1.5} />
      </span>
      <p className="mt-4 text-[16px] font-bold text-[hsl(var(--pro-ink))]">{title}</p>
      {body && <p className="mt-1 max-w-[30ch] text-[14px] text-[hsl(var(--pro-ink-soft))]">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ title, onRetry }: { title: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center px-8 py-10 text-center">
      <AlertTriangle className="h-6 w-6 text-[hsl(var(--pro-red))]" aria-hidden />
      <p className="mt-3 text-[15px] font-bold text-[hsl(var(--pro-ink))]">{title}</p>
      <p className="mt-1 text-[14px] text-[hsl(var(--pro-ink-soft))]">
        Check your signal and try again.
      </p>
      <ProButton variant="outlined" className="mt-4" onClick={onRetry}>
        Try again
      </ProButton>
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`pro-skeleton rounded-xl ${className}`} />;
}

export function ScheduleSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      <Skeleton className="h-10" />
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-[72px]" />
      ))}
    </div>
  );
}

/* ---------------- info + access rows ---------------- */

export function InfoRow({
  kind,
  label,
  value,
}: {
  kind: "access" | "gate" | "pet" | "parking" | "map";
  label: string;
  value: string;
}) {
  const Icon = { access: StickyNote, gate: KeyRound, pet: Dog, parking: Car, map: MapPin }[kind];
  return (
    <div className="flex gap-3 border-b border-[hsl(var(--pro-line))] py-3 last:border-0">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--pro-sky))]" aria-hidden />
      <div>
        <p className="text-[12px] font-bold uppercase tracking-wide text-[hsl(var(--pro-ink-soft))]">{label}</p>
        <p className="text-[15px] text-[hsl(var(--pro-ink))]">{value}</p>
      </div>
    </div>
  );
}

/** Static, informational map image. No live tracking, no Pro dot, no geofence. */
export function MapPreview({ street, zip }: { street?: string | null; zip?: string | null }) {
  const query = encodeURIComponent(`${street ?? ""} ${zip ?? ""} FL`.trim());
  return (
    <div className="relative h-40 w-full overflow-hidden bg-[hsl(var(--pro-blue-soft))]">
      <div
        aria-hidden
        className="absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            "linear-gradient(hsl(var(--pro-sky)/0.25) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--pro-sky)/0.25) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />
      <div className="absolute inset-0 grid place-items-center">
        <MapPin className="h-8 w-8 text-[hsl(var(--pro-blue))]" aria-hidden />
      </div>
      <a
        href={`https://maps.google.com/?q=${query}`}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute bottom-3 right-3 min-h-[44px] rounded-xl bg-white px-4 py-2 text-[14px] font-bold text-[hsl(var(--pro-blue))] shadow-sm"
      >
        Open in Maps
      </a>
    </div>
  );
}

/* ---------------- checklist, photos, progress ---------------- */

export function ChecklistItemRow({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={checked}
      className="flex min-h-[56px] w-full items-center gap-3 border-b border-[hsl(var(--pro-line))] bg-white px-4 text-left last:border-0 active:bg-[hsl(var(--pro-ground))]"
    >
      <span
        className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border-2 ${
          checked
            ? "border-[hsl(var(--pro-green))] bg-[hsl(var(--pro-green))]"
            : "border-[hsl(var(--pro-line))] bg-white"
        }`}
      >
        {checked && <Check className="h-4 w-4 text-white" aria-hidden />}
      </span>
      <span className="text-[15px] font-medium text-[hsl(var(--pro-ink))]">{label}</span>
    </button>
  );
}

export function UploadTile({
  label,
  onPick,
  disabled,
}: {
  label: string;
  onPick: (files: FileList) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex min-h-[112px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[hsl(var(--pro-sky)/0.7)] bg-[hsl(var(--pro-blue-soft))] px-4 text-center ${
        disabled ? "opacity-50" : ""
      }`}
    >
      <Upload className="h-6 w-6 text-[hsl(var(--pro-blue))]" aria-hidden />
      <span className="text-[14px] font-bold text-[hsl(var(--pro-blue))]">{label}</span>
      <input
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        disabled={disabled}
        onChange={(e) => e.target.files && onPick(e.target.files)}
      />
    </label>
  );
}

export function PhotoThumb({ url, onRemove }: { url: string | null; onRemove: () => void }) {
  return (
    <div className="relative h-20 w-20 overflow-hidden rounded-xl bg-[hsl(var(--pro-ground))]">
      {url && <img src={url} alt="Visit photo" className="h-full w-full object-cover" />}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove photo"
        className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-white/95 text-[hsl(var(--pro-red))]"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}

export function ProgressRow({
  label,
  current,
  target,
  display,
  animate = true,
}: {
  label: string;
  current: number;
  target: number;
  display: string;
  animate?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, (current / target) * 100));
  const done = current >= target;
  return (
    <div className="py-3">
      <div className="flex items-baseline justify-between">
        <p className="text-[14px] font-semibold text-[hsl(var(--pro-ink))]">{label}</p>
        <p className="text-[14px] font-bold text-[hsl(var(--pro-ink-soft))]">{display}</p>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[hsl(var(--pro-line))]">
        <div
          className={`h-full rounded-full ${done ? "bg-[hsl(var(--pro-green))]" : "bg-[hsl(var(--pro-blue))]"}`}
          style={{
            width: `${pct}%`,
            transition: animate ? "width 900ms cubic-bezier(0.4,0,0.2,1)" : undefined,
          }}
        />
      </div>
    </div>
  );
}

export function CopyLink({ value, label }: { value: string; label: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(value);
        const el = document.getElementById("copy-morph");
        if (el) {
          el.dataset.copied = "1";
          setTimeout(() => delete el.dataset.copied, 1600);
        }
      }}
      className="flex min-h-[48px] w-full items-center justify-between gap-3 rounded-xl border border-[hsl(var(--pro-line))] bg-white px-4"
    >
      <span className="truncate text-[14px] text-[hsl(var(--pro-ink))]">{value}</span>
      <span id="copy-morph" className="group flex items-center gap-1 text-[14px] font-bold text-[hsl(var(--pro-blue))] data-[copied]:text-[hsl(var(--pro-green))]">
        <Copy className="h-4 w-4 group-data-[copied]:hidden" aria-hidden />
        <Check className="hidden h-4 w-4 group-data-[copied]:block" aria-hidden />
        {label}
      </span>
    </button>
  );
}

export function SettingRow({
  to,
  label,
  onClick,
}: {
  to?: string;
  label: string;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <span className="text-[15px] font-semibold text-[hsl(var(--pro-ink))]">{label}</span>
      <ChevronRight className="h-5 w-5 text-[hsl(var(--pro-ink-soft))]" aria-hidden />
    </>
  );
  const cls =
    "flex min-h-[52px] w-full items-center justify-between border-b border-[hsl(var(--pro-line))] bg-white px-4 last:border-0 active:bg-[hsl(var(--pro-ground))]";
  if (to) return <Link to={to} className={cls}>{inner}</Link>;
  return (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}
