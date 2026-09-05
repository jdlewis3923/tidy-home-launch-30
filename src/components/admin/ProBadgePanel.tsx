/**
 * Badge panel for the admin Pro record: verify link, QR preview, Pro number,
 * and live badge status. Status changes are managed from /admin/badges so the
 * full lifecycle (issue, suspend, reinstate, revoke) is logged.
 */
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, Check, QrCode, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const STATUS_PILL: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  suspended: "bg-amber-50 text-amber-700 ring-amber-200",
  revoked: "bg-red-50 text-red-700 ring-red-200",
  not_issued: "bg-slate-100 text-slate-700 ring-slate-200",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  suspended: "Suspended",
  revoked: "Revoked",
  not_issued: "Not issued",
};

type Props = {
  applicantId: string;
  proNumber: string | null;
  verifyToken: string | null;
  badgeStatus: string | null;
};

const ProBadgePanel = ({ applicantId, proNumber, verifyToken, badgeStatus }: Props) => {
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState<string | null>(null);

  const url = verifyToken ? `${window.location.origin}/verify/${verifyToken}` : null;
  const status = badgeStatus || "not_issued";

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    QRCode.toDataURL(url, { width: 240, margin: 1, color: { dark: "#0f172a", light: "#ffffff" } })
      .then((d) => { if (!cancelled) setQr(d); })
      .catch(() => setQr(null));
    return () => { cancelled = true; };
  }, [url]);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <QrCode className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-bold text-foreground">Badge</h3>
        <span className={`ml-auto text-[11px] font-semibold px-2.5 py-1 rounded-full ring-1 ${STATUS_PILL[status] ?? STATUS_PILL.not_issued}`}>
          {STATUS_LABEL[status] ?? status}
        </span>
      </div>

      <div className="mt-4 flex flex-col sm:flex-row gap-4">
        {qr ? (
          <img src={qr} alt="Badge verification QR code" className="h-28 w-28 rounded-lg border border-border bg-white" />
        ) : (
          <div className="h-28 w-28 rounded-lg border border-border bg-muted flex items-center justify-center text-[11px] text-muted-foreground text-center px-2">
            No badge token yet
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Pro number</p>
            <p className="font-mono text-sm font-semibold text-foreground">{proNumber ?? "—"}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Verify link</p>
            {url ? (
              <div className="flex items-center gap-2">
                <code className="text-xs text-muted-foreground truncate">{url}</code>
                <button
                  onClick={() => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                  className="shrink-0 text-muted-foreground hover:text-primary"
                  aria-label="Copy verify link"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
                <a href={url} target="_blank" rel="noreferrer" className="shrink-0 text-muted-foreground hover:text-primary" aria-label="Open verify page">
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">—</p>
            )}
          </div>
        </div>
      </div>

      <Button asChild variant="outline" className="mt-4 w-full">
        <Link to={`/admin/badges?badge=${applicantId}`}>Manage badge</Link>
      </Button>
    </div>
  );
};

export default ProBadgePanel;
