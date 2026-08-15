/**
 * Insurance — step 2 of the existing /apply flow.
 *
 * Uses the same white card / cream header / navy CTA styling as the details step.
 * Two paths:
 *   1. "I already have insurance" → inline verification form + private COI upload
 *   2. "I need insurance"         → Tidy's preferred provider (Thimble), then
 *                                    return to /apply and upload proof of coverage
 *
 * An upload only ever produces `pending_verification` — verification is a Tidy
 * admin action.
 */
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  ShieldCheck, Loader2, CheckCircle2, Upload, ExternalLink,
  ArrowLeft, FileText, Clock,
} from "lucide-react";
import {
  COI_ACCEPT, COI_MAX_BYTES, FALLBACK_CONFIG, fetchInsuranceConfig,
  fileToBase64, trackInsurance, usd,
  type AdditionalInsuredStatus, type InsuranceConfig,
} from "@/lib/insurance";

export type InsuranceApplicant = { id: string; email: string; first_name?: string };

type Choice = "" | "has" | "needs";

export default function InsuranceStep({
  applicant,
  onDone,
}: {
  applicant: InsuranceApplicant;
  onDone: () => void;
}) {
  const [config, setConfig] = useState<InsuranceConfig>(FALLBACK_CONFIG);
  const [choice, setChoice] = useState<Choice>("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [carrier, setCarrier] = useState("");
  const [policy, setPolicy] = useState("");
  const [perOcc, setPerOcc] = useState("");
  const [aggregate, setAggregate] = useState("");
  const [effective, setEffective] = useState("");
  const [expiration, setExpiration] = useState("");
  const [addlInsured, setAddlInsured] = useState<AdditionalInsuredStatus>("unknown");
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    trackInsurance("insurance_step_viewed");
    fetchInsuranceConfig().then(setConfig);
  }, []);

  const req = config.requirements;
  const limits = useMemo(
    () => ({ occ: usd(req.per_occurrence_cents), agg: usd(req.aggregate_cents) }),
    [req.per_occurrence_cents, req.aggregate_cents],
  );

  const pickFile = (f: File | null) => {
    if (f && f.size > COI_MAX_BYTES) {
      toast({ title: "File too large", description: "Please upload a file under 8 MB.", variant: "destructive" });
      return;
    }
    setFile(f);
    if (f) trackInsurance("insurance_coi_uploaded", { file_type: f.type });
  };

  const submitCoverage = async () => {
    if (!carrier.trim()) { toast({ title: "Insurance company is required", variant: "destructive" }); return; }
    if (!policy.trim()) { toast({ title: "Policy number is required", variant: "destructive" }); return; }
    if (!effective || !expiration) { toast({ title: "Policy dates are required", variant: "destructive" }); return; }
    if (!file) { toast({ title: "Please attach your Certificate of Insurance", variant: "destructive" }); return; }

    setSubmitting(true);
    try {
      const data_base64 = await fileToBase64(file);
      const toCents = (v: string) => {
        const n = Number(String(v).replace(/[^0-9.]/g, ""));
        return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : undefined;
      };
      const { error } = await supabase.functions.invoke("submit-insurance", {
        body: {
          applicant_id: applicant.id,
          email: applicant.email,
          intent: "has_insurance",
          provider: "other",
          carrier_name: carrier.trim(),
          policy_number: policy.trim(),
          per_occurrence_limit_cents: toCents(perOcc),
          aggregate_limit_cents: toCents(aggregate),
          effective_date: effective,
          expiration_date: expiration,
          additional_insured_status: addlInsured,
          certificate: { filename: file.name, mime_type: file.type || "application/pdf", data_base64 },
        },
      });
      if (error) throw error;
      trackInsurance("insurance_submitted", { provider: "other" });
      setSubmitted(true);
    } catch (err: any) {
      console.error(err);
      toast({ title: "Could not submit coverage", description: err?.message ?? "Please try again", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const chooseThimble = async () => {
    trackInsurance("insurance_thimble_selected");
    try {
      await supabase.functions.invoke("submit-insurance", {
        body: { applicant_id: applicant.id, email: applicant.email, intent: "needs_insurance", provider: "thimble" },
      });
    } catch (e) { console.error(e); }
    if (config.thimble.enabled && config.thimble.partner_url) {
      window.open(config.thimble.partner_url, "_blank", "noopener,noreferrer");
    }
    setChoice("needs");
  };

  if (submitted) {
    return (
      <Shell title="Coverage submitted" subtitle="Nothing else needed right now.">
        <div className="text-center py-4">
          <div className="mx-auto h-14 w-14 rounded-full bg-primary/10 ring-1 ring-primary/25 flex items-center justify-center">
            <Clock className="h-7 w-7 text-primary" />
          </div>
          <h3 className="mt-5 font-display text-xl font-black text-ink">Coverage submitted</h3>
          <p className="mt-2 text-sm text-ink-faint leading-relaxed">
            We're verifying that your insurance meets Tidy's requirements.
          </p>
          <Button onClick={onDone} size="lg" className="mt-7 w-full bg-gradient-to-b from-navy-deep to-[#0b1226] text-white font-bold h-12">
            Finish
          </Button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell title="Insurance" subtitle="Last step — about 1 minute.">
      <div>
        <h3 className="font-display text-xl font-black text-ink tracking-tight">Protect your business.</h3>
        <p className="mt-2 text-sm text-ink-faint leading-relaxed">
          Active Tidy Pros maintain liability coverage while performing services through Tidy.
        </p>
      </div>

      {choice === "" && (
        <div className="mt-6 space-y-3">
          <OptionCard
            icon={<FileText className="h-5 w-5 text-primary" />}
            title="I already have insurance"
            body="Upload your existing coverage for quick verification."
            cta="Verify My Coverage"
            onClick={() => { trackInsurance("insurance_already_covered_selected"); setChoice("has"); }}
          />
          <OptionCard
            icon={<ShieldCheck className="h-5 w-5 text-primary" />}
            title="I need insurance"
            badge="Recommended"
            body="Get qualifying business insurance through Tidy's preferred insurance provider."
            cta={config.thimble.enabled ? "Get Covered with Thimble" : "Thimble — coming soon"}
            disabled={!config.thimble.enabled}
            note="Pricing and eligibility are determined by the insurance provider."
            onClick={chooseThimble}
          />
          <button type="button" onClick={onDone} className="w-full text-center text-xs font-semibold text-ink-faint hover:text-ink underline underline-offset-4 pt-1">
            I'll handle insurance later
          </button>
        </div>
      )}

      {choice === "needs" && (
        <div className="mt-6 space-y-4">
          <div className="rounded-xl border border-hairline bg-cream/60 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-ink-faint">Tidy Preferred Insurance</p>
            <p className="text-sm font-semibold text-ink">Powered by Thimble</p>
            <p className="mt-2 text-xs text-ink-faint leading-relaxed">
              Insurance is provided by third-party licensed insurance providers. Tidy is not an
              insurer and does not determine eligibility, premiums, coverage decisions, or claims.
            </p>
          </div>

          {config.thimble.enabled ? (
            <Button variant="outline" className="w-full h-11" onClick={() => window.open(config.thimble.partner_url, "_blank", "noopener,noreferrer")}>
              Open Thimble <ExternalLink className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <div className="rounded-xl border border-hairline bg-white p-4 text-sm text-ink leading-relaxed">
              Our Thimble link isn't live yet. You can get qualifying coverage from any insurer and
              upload your certificate below — or call us at{" "}
              <a href="tel:+17868291141" className="font-semibold text-primary">(786) 829-1141</a>.
            </div>
          )}

          <div className="rounded-xl border border-hairline bg-white p-4">
            <p className="text-sm font-semibold text-ink">Already have your new policy?</p>
            <p className="mt-1 text-xs text-ink-faint">Upload proof of coverage to finish this step.</p>
            <Button className="mt-3 w-full h-11 bg-gradient-to-b from-navy-deep to-[#0b1226] text-white font-bold" onClick={() => setChoice("has")}>
              <Upload className="mr-2 h-4 w-4" /> Upload Proof of Coverage
            </Button>
          </div>

          <div className="flex items-center justify-between">
            <button type="button" onClick={() => setChoice("")} className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-faint hover:text-ink">
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
            <button type="button" onClick={onDone} className="text-xs font-semibold text-ink-faint hover:text-ink underline underline-offset-4">
              I'll upload it later
            </button>
          </div>
        </div>
      )}

      {choice === "has" && (
        <div className="mt-6 space-y-4">
          <div className="rounded-xl border border-hairline bg-cream/60 p-4 text-xs text-ink leading-relaxed">
            <p className="font-bold uppercase tracking-wide text-ink-faint">Tidy's requirement</p>
            <p className="mt-1">
              General Liability of at least <span className="font-semibold">{limits.occ} per occurrence</span> and{" "}
              <span className="font-semibold">{limits.agg} aggregate</span>.
            </p>
            {config.additional_insured?.required && (
              <p className="mt-2">
                {config.additional_insured.entity_name
                  ? <>Tidy may require <span className="font-semibold">{config.additional_insured.entity_name}</span> to be listed as <span className="font-semibold">Additional Insured</span> (not Certificate Holder).</>
                  : <>Tidy may require its legal entity to be listed as <span className="font-semibold">Additional Insured</span> (not Certificate Holder).</>}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="ins_carrier" className="text-ink">Insurance company / carrier *</Label>
            <Input id="ins_carrier" value={carrier} onChange={(e) => setCarrier(e.target.value)} className="mt-1.5" placeholder="e.g. Thimble, Hiscox, Next" />
          </div>
          <div>
            <Label htmlFor="ins_policy" className="text-ink">Policy number *</Label>
            <Input id="ins_policy" value={policy} onChange={(e) => setPolicy(e.target.value)} className="mt-1.5" autoComplete="off" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="ins_occ" className="text-ink">Per-occurrence limit</Label>
              <Input id="ins_occ" inputMode="numeric" value={perOcc} onChange={(e) => setPerOcc(e.target.value)} className="mt-1.5" placeholder="1000000" />
            </div>
            <div>
              <Label htmlFor="ins_agg" className="text-ink">Aggregate limit</Label>
              <Input id="ins_agg" inputMode="numeric" value={aggregate} onChange={(e) => setAggregate(e.target.value)} className="mt-1.5" placeholder="2000000" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="ins_eff" className="text-ink">Effective date *</Label>
              <Input id="ins_eff" type="date" value={effective} onChange={(e) => setEffective(e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="ins_exp" className="text-ink">Expiration date *</Label>
              <Input id="ins_exp" type="date" value={expiration} onChange={(e) => setExpiration(e.target.value)} className="mt-1.5" />
            </div>
          </div>

          <div>
            <Label className="text-ink">Is Tidy listed as Additional Insured?</Label>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {([
                ["listed", "Yes, listed"],
                ["requested", "Requested from carrier"],
                ["not_listed", "Not listed yet"],
                ["unknown", "Not sure"],
              ] as [AdditionalInsuredStatus, string][]).map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setAddlInsured(v)}
                  className={`rounded-lg border px-3.5 py-2.5 text-sm text-left transition ${addlInsured === v ? "border-primary bg-primary/5 text-ink" : "border-hairline text-ink hover:bg-cream/60"}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="ins_file" className="text-ink">Certificate of Insurance *</Label>
            <input
              id="ins_file"
              type="file"
              accept={COI_ACCEPT}
              capture={undefined}
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              className="mt-1.5 block w-full text-sm text-ink file:mr-3 file:rounded-lg file:border-0 file:bg-navy-deep file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-white"
            />
            <p className="mt-1.5 text-xs text-ink-faint">
              PDF or a photo from your phone. Max 8 MB. Stored privately — only Tidy admins can view it.
            </p>
            {file && (
              <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
                <CheckCircle2 className="h-3.5 w-3.5" /> {file.name}
              </p>
            )}
          </div>

          <Button
            onClick={submitCoverage}
            disabled={submitting}
            size="lg"
            className="w-full bg-gradient-to-b from-navy-deep to-[#0b1226] text-white hover:brightness-110 font-bold text-base h-12 shadow-lg disabled:opacity-50"
          >
            {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting…</> : "Submit coverage"}
          </Button>

          <div className="flex items-center justify-between">
            <button type="button" onClick={() => setChoice("")} className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-faint hover:text-ink">
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
            <button type="button" onClick={onDone} className="text-xs font-semibold text-ink-faint hover:text-ink underline underline-offset-4">
              I'll do this later
            </button>
          </div>
        </div>
      )}
    </Shell>
  );
}

function Shell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="relative rounded-2xl bg-white shadow-2xl border border-white/40 overflow-hidden animate-calm-rise">
      <div className="px-6 sm:px-8 pt-7 pb-5 border-b border-hairline bg-cream">
        <p className="text-[11px] font-bold uppercase tracking-wider text-ink-faint">Step 2 of 2</p>
        <h2 className="mt-1 font-display text-2xl font-black text-ink tracking-tight">{title}</h2>
        <p className="mt-1 text-sm text-ink-faint">{subtitle}</p>
      </div>
      <div className="px-6 sm:px-8 py-7">{children}</div>
    </div>
  );
}

function OptionCard({ icon, title, body, cta, onClick, badge, note, disabled }: {
  icon: React.ReactNode; title: string; body: string; cta: string;
  onClick: () => void; badge?: string; note?: string; disabled?: boolean;
}) {
  return (
    <div className="rounded-xl border border-hairline bg-white p-4 sm:p-5 hover:border-primary/40 transition">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 shrink-0 rounded-lg bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center">{icon}</div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-display text-base font-bold text-ink">{title}</h4>
            {badge && (
              <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink ring-1 ring-gold/40">
                {badge}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-ink-faint leading-relaxed">{body}</p>
        </div>
      </div>
      <Button onClick={onClick} disabled={disabled} variant="outline" className="mt-4 w-full h-11 font-bold disabled:opacity-60">
        {cta}
      </Button>
      {note && <p className="mt-2 text-[11px] text-ink-faint">{note}</p>}
    </div>
  );
}
