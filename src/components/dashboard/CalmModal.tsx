/**
 * Tidy — Quick action modal for dashboard tiles (Reschedule, Add Note, etc).
 *
 * Lightweight overlay so quick actions feel like calm system controls
 * without taking the user off the dashboard. Single-purpose: title,
 * optional subtitle, body slot, primary CTA.
 */
import { X } from 'lucide-react';
import { ReactNode, useEffect } from 'react';

export default function CalmModal({
  open,
  title,
  subtitle,
  onClose,
  children,
  primaryLabel,
  onPrimary,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children?: ReactNode;
  primaryLabel?: string;
  onPrimary?: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative z-10 w-full max-w-md animate-calm-rise rounded-2xl bg-white p-6 shadow-[0_24px_64px_-16px_rgba(15,23,42,0.35)]">
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-ink-faint hover:bg-cream"
        >
          <X className="h-4 w-4" />
        </button>
        <h3 className="text-xl font-bold tracking-tight text-ink">{title}</h3>
        {subtitle && (
          <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>
        )}
        {children && <div className="mt-5">{children}</div>}
        {primaryLabel && (
          <button
            type="button"
            onClick={onPrimary ?? onClose}
            className="mt-6 w-full rounded-xl bg-ink px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_32px_-10px_hsl(var(--ink)/0.55)] transition hover:bg-ink-soft"
          >
            {primaryLabel}
          </button>
        )}
      </div>
    </div>
  );
}
