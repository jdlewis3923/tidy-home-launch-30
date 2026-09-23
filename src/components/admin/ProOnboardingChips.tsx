/**
 * Tidy — Pro onboarding status, three chips.
 *
 * Background check · Insurance · Intake, each as not sent / sent / received /
 * verified, with "Resend onboarding email" and a Copy link button per item. The
 * status logic mirrors supabase/functions/_shared/pro-onboarding.ts so the admin
 * view and the emails can never disagree.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Copy, Loader2, Mail, RefreshCw } from "lucide-react";

export type StepStatus = "not_sent" | "sent" | "received" | "verified";

export interface ProOnboardingApplicant {
  id: string;
  bg_check_status?: string | null;
  checkr_invitation_id?: string | null;
  checkr_report_status?: string | null;
  coi_token?: string | null;
  coi_pdf_url?: string | null;
  coi_review_status?: string | null;
  onboarding_email_sent_at?: string | null;
  onboarding_reminder_count?: number | null;
}

const STATUS_STYLE: Record<StepStatus, string> = {
  not_sent: "bg-muted text-muted-foreground ring-border",
  sent: "bg-amber-50 text-amber-800 ring-amber-200",
  received: "bg-blue-50 text-blue-800 ring-blue-200",
  verified: "bg-emerald-50 text-emerald-800 ring-emerald-200",
};

const STATUS_LABEL: Record<StepStatus, string> = {
  not_sent: "not sent",
  sent: "sent",
  received: "received",
  verified: "verified",
};

export function backgroundCheckStatus(a: ProOnboardingApplicant): StepStatus {
  if (a.bg_check_status === "clear") return "verified";
  if (a.checkr_report_status && a.checkr_report_status !== "invitation_pending") return "received";
  return a.checkr_invitation_id ? "sent" : "not_sent";
}

export function insuranceStatus(a: ProOnboardingApplicant): StepStatus {
  if (a.coi_review_status === "approved" || a.coi_review_status === "verified") return "verified";
  if (a.coi_pdf_url) return "received";
  return a.coi_token ? "sent" : "not_sent";
}

export function intakeStatus(kitStatus: string | null | undefined, kitToken: string | null | undefined): StepStatus {
  if (kitStatus === "kit_issued" || kitStatus === "kit_ordered") return "verified";
  if (kitStatus === "submitted") return "received";
  return kitToken ? "sent" : "not_sent";
}

function Chip({ label, status }: { label: string; status: StepStatus }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold ring-1 ${STATUS_STYLE[status]}`}>
      {label}
      <span className="font-normal opacity-80">· {STATUS_LABEL[status]}</span>
    </span>
  );
}

export default function ProOnboardingChips({
  applicant,
  kitStatus,
  kitToken,
  onRefresh,
}: {
  applicant: ProOnboardingApplicant;
  kitStatus?: string | null;
  kitToken?: string | null;
  onRefresh?: () => void;
}) {
  const [busy, setBusy] = useState<null | "email" | "links">(null);
  const [tokens, setTokens] = useState<{ coi: string | null; intake: string | null }>({
    coi: applicant.coi_token ?? null,
    intake: kitToken ?? null,
  });
  const [kit, setKit] = useState<string | null>(kitStatus ?? null);

  // The caller usually doesn't already hold the kit row, so load it here.
  useEffect(() => {
    if (kitStatus !== undefined && kitToken !== undefined) return;
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("pro_kit")
        .select("token, status")
        .eq("applicant_id", applicant.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!alive || !data) return;
      setKit(data.status ?? null);
      setTokens((t) => ({ ...t, intake: t.intake ?? data.token ?? null }));
    })();
    return () => {
      alive = false;
    };
  }, [applicant.id, kitStatus, kitToken]);


  const origin = typeof window !== "undefined" ? window.location.origin : "https://jointidy.co";
  const coiUrl = tokens.coi ? `${origin}/coi/${tokens.coi}` : null;
  const intakeUrl = tokens.intake ? `${origin}/intake/${tokens.intake}` : null;

  const copy = async (url: string | null, what: string) => {
    if (!url) {
      toast.error(`No ${what} link yet — send the onboarding email or make new links.`);
      return;
    }
    await navigator.clipboard.writeText(url);
    toast.success(`${what} link copied`);
  };

  const resendEmail = async () => {
    // Confirm every repeat send so the same email can't be fired at a Pro
    // over and over by an accidental double click.
    if (
      applicant.onboarding_email_sent_at &&
      !window.confirm(
        `This Pro was already emailed ${new Date(applicant.onboarding_email_sent_at).toLocaleString()}. Send it again?`,
      )
    ) {
      return;
    }
    setBusy("email");
    const { data, error } = await supabase.functions.invoke("pro-onboarding-email", {
      body: { applicant_id: applicant.id },
    });
    setBusy(null);
    if (error || !(data as { ok?: boolean })?.ok) {
      toast.error("Onboarding email failed", {
        description: (data as { details?: string })?.details ?? error?.message ?? "unknown",
      });
      return;
    }
    const d = data as { coi_url?: string; intake_url?: string; checkr_link_included?: boolean };
    toast.success("Onboarding email sent", {
      description: d.checkr_link_included
        ? "All three buttons included."
        : "Background check button left out — no Checkr invitation yet.",
    });
    onRefresh?.();
  };

  const newLinks = async () => {
    setBusy("links");
    const { data, error } = await supabase.rpc("admin_onboarding_tokens", {
      _applicant_id: applicant.id,
      _regenerate: true,
    });
    setBusy(null);
    if (error) {
      toast.error("Could not make new links", { description: error.message });
      return;
    }
    const row = (data ?? {}) as { coi_token?: string; intake_token?: string };
    setTokens({ coi: row.coi_token ?? null, intake: row.intake_token ?? null });
    toast.success("New links made — the old ones no longer work");
    onRefresh?.();
  };

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Chip label="Background check" status={backgroundCheckStatus(applicant)} />
        <Chip label="Insurance" status={insuranceStatus(applicant)} />
        <Chip label="Intake" status={intakeStatus(kitStatus, tokens.intake)} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={resendEmail}>
          {busy === "email" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Mail className="mr-1 h-3.5 w-3.5" />}
          {applicant.onboarding_email_sent_at ? "Resend onboarding email" : "Send onboarding email"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => copy(coiUrl, "Insurance")}>
          <Copy className="mr-1 h-3.5 w-3.5" /> Copy insurance link
        </Button>
        <Button size="sm" variant="outline" onClick={() => copy(intakeUrl, "Intake")}>
          <Copy className="mr-1 h-3.5 w-3.5" /> Copy intake link
        </Button>
        <Button size="sm" variant="ghost" disabled={busy !== null} onClick={newLinks}>
          {busy === "links" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
          New links
        </Button>
      </div>
      {applicant.onboarding_email_sent_at && (
        <p className="text-[11px] text-muted-foreground">
          Onboarding email sent {new Date(applicant.onboarding_email_sent_at).toLocaleString()} ·{" "}
          {applicant.onboarding_reminder_count ?? 0} reminder(s). Links last 30 days.
        </p>
      )}
    </div>
  );
}
