/**
 * Pro Intake & Kit Order — public route /intake/:token
 *
 * A hired Pro fills this on a phone. The token is a random 22-char string on
 * the pro_kit row, never the Pro number, and the row is reached only through
 * the SECURITY DEFINER RPCs intake_load / intake_save — no table access, no
 * listing, no login.
 *
 * Seven steps, autosaved as the Pro advances, then a single submit that hands
 * off to the intake-submitted edge function for the owner email.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Loader2, CheckCircle2, AlertTriangle, ArrowLeft, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import TidyLogo from "@/components/TidyLogo";

const NAVY = "#0A2A47";
const YELLOW = "#FCCC00";
const SUPPORT_EMAIL = "hello@jointidy.co";

type FieldType = "text" | "tel" | "email" | "date" | "number" | "textarea" | "select" | "bool" | "multi";

type Field = {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  help?: string;
  options?: string[];
  placeholder?: string;
  showIf?: (v: Values) => boolean;
};

type Step = { title: string; short: string; note?: string; fields: Field[] };

type Values = Record<string, string | string[] | null | undefined>;

const SIZES = ["S", "M", "L", "XL", "2XL", "3XL"];
const CUTS = ["Men's", "Women's"];
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const STEPS: Step[] = [
  {
    title: "Identity and contact",
    short: "Identity",
    fields: [
      { name: "legal_name", label: "Full legal name", type: "text", required: true, help: "As it appears on the ICA and W-9." },
      { name: "badge_name", label: "Name for the badge", type: "text", required: true, help: "First name + last initial, exactly as it should print — confirm accents." },
      { name: "mobile", label: "Mobile", type: "tel", required: true, placeholder: "(786) 555-1234" },
      { name: "email", label: "Email", type: "email", required: true },
      { name: "home_zip", label: "Home ZIP", type: "text", required: true, placeholder: "33183" },
      { name: "mail_address", label: "Mailing address for the kit", type: "textarea", required: true },
      { name: "badge_back", label: "Badge back language", type: "select", options: ["Spanish primary", "English primary", "No preference"] },
    ],
  },
  {
    title: "Apparel sizing",
    short: "Apparel",
    note: "The vest goes over a polo or tee — size it up, not to your shirt size.",
    fields: [
      { name: "polo_size", label: "Polo size", type: "select", required: true, options: SIZES },
      { name: "polo_cut", label: "Polo cut", type: "select", required: true, options: CUTS },
      { name: "tee_size", label: "Tee size", type: "select", required: true, options: SIZES },
      { name: "tee_cut", label: "Tee cut", type: "select", required: true, options: CUTS },
      { name: "vest_size", label: "Vest", type: "select", required: true, options: ["S/M", "L/XL", "2X/3X"] },
      { name: "cap", label: "Cap", type: "select", options: ["Adjustable — standard", "Needs larger fit", "Declines cap"] },
    ],
  },
  {
    title: "Vehicle and magnets",
    short: "Vehicle",
    fields: [
      { name: "vehicle", label: "Year / make / model", type: "text", required: true, placeholder: "2019 Toyota Tacoma" },
      { name: "vehicle_color", label: "Colour", type: "text", required: true },
      { name: "vehicle_2", label: "Second vehicle (optional)", type: "text" },
      {
        name: "door_material",
        label: "Door material",
        type: "select",
        required: true,
        options: [
          "Steel — magnet holds",
          "Aluminium — will NOT hold",
          "Plastic or composite — will NOT hold",
          "Unsure",
        ],
      },
    ],
  },
  {
    title: "Service line and equipment",
    short: "Service",
    fields: [
      { name: "service_line", label: "Hired for", type: "select", required: true, options: ["House Cleaning", "Lawn Care", "Car Detail"] },
      { name: "cross_trained", label: "Willing to cover a second line", type: "bool" },
      { name: "cross_which", label: "Which second line", type: "select", options: ["House Cleaning", "Lawn Care", "Car Detail"], showIf: (v) => v.cross_trained === "yes" },
      { name: "equip_gap", label: "Anything missing from your equipment, and the date you will have it", type: "textarea" },
    ],
  },
  {
    title: "Compliance",
    short: "Compliance",
    fields: [
      { name: "ins_carrier", label: "Insurance carrier", type: "text", required: true },
      { name: "ins_policy", label: "Policy number", type: "text", required: true },
      { name: "ins_expiry", label: "Policy expiry", type: "date", required: true },
      { name: "dl_number", label: "Driver's licence number", type: "text", required: true },
      { name: "dl_expiry", label: "Licence expiry", type: "date", required: true },
      { name: "auto_insurance", label: "Auto insurance carrier and expiry", type: "text", required: true, placeholder: "GEICO — 04/2027" },
    ],
  },
  {
    title: "Availability",
    short: "Availability",
    fields: [
      { name: "days", label: "Days you can work", type: "multi", required: true, options: DAYS },
      { name: "hours", label: "Earliest start / latest finish", type: "text", required: true, placeholder: "8:00am / 6:00pm" },
      { name: "visits_per_week", label: "Visits per week you want", type: "number", required: true },
      { name: "max_drive", label: "Maximum drive you will accept", type: "text", placeholder: "30 minutes" },
      { name: "other_work", label: "Other clients or work you are keeping", type: "textarea", help: "Expected and completely fine — we record it so scheduling does not collide." },
      { name: "first_available", label: "First date you can take a paid visit", type: "date", required: true },
    ],
  },
  { title: "Review and submit", short: "Review", fields: [] },
];

const isEmpty = (v: unknown) => v === null || v === undefined || (Array.isArray(v) ? v.length === 0 : String(v).trim() === "");

const MAGNET_RISK = ["Aluminium — will NOT hold", "Plastic or composite — will NOT hold", "Unsure"];

export default function ProIntake() {
  const { token = "" } = useParams();
  const [state, setState] = useState<"loading" | "open" | "closed" | "not_found" | "done">("loading");
  const [values, setValues] = useState<Values>({});
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("intake_load", { _token: token });
      if (cancelled) return;
      const res = (data ?? {}) as { state?: string; row?: Record<string, unknown> };
      if (error || !res.state || res.state === "not_found") return setState("not_found");
      if (res.state === "closed") return setState("closed");
      const row = res.row ?? {};
      const seeded: Values = {};
      for (const [k, v] of Object.entries(row)) {
        if (v === null || v === undefined) continue;
        if (Array.isArray(v)) seeded[k] = v.map(String);
        else if (typeof v === "boolean") seeded[k] = v ? "yes" : "no";
        else seeded[k] = String(v);
      }
      setValues(seeded);
      setState("open");
    })();
    return () => { cancelled = true; };
  }, [token]);

  const set = (name: string, v: string | string[]) => {
    setValues((p) => ({ ...p, [name]: v }));
    setErrors((e) => (e[name] ? { ...e, [name]: "" } : e));
  };

  const patchFor = useCallback((fields: Field[]): Record<string, unknown> => {
    const patch: Record<string, unknown> = {};
    for (const f of fields) {
      const v = values[f.name];
      if (f.type === "multi") patch[f.name] = Array.isArray(v) ? v : [];
      else if (f.type === "bool") patch[f.name] = v === "yes" ? true : v === "no" ? false : null;
      else patch[f.name] = v ?? "";
    }
    return patch;
  }, [values]);

  const validate = (fields: Field[]) => {
    const next: Record<string, string> = {};
    for (const f of fields) {
      if (!f.required) continue;
      if (f.showIf && !f.showIf(values)) continue;
      if (isEmpty(values[f.name])) next[f.name] = "This one is required.";
    }
    setErrors(next);
    const first = Object.keys(next)[0];
    if (first) {
      document.getElementById(`field-${first}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return false;
    }
    return true;
  };

  const advance = async (to: number) => {
    const current = STEPS[step];
    if (to > step && !validate(current.fields)) return;
    if (current.fields.length) {
      setSaving(true);
      await supabase.rpc("intake_save", { _token: token, _patch: patchFor(current.fields) as never, _submit: false });
      setSaving(false);
    }
    setStep(to);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const submit = async () => {
    const allFields = STEPS.flatMap((s) => s.fields);
    for (let i = 0; i < STEPS.length - 1; i++) {
      const bad = STEPS[i].fields.some((f) => f.required && (!f.showIf || f.showIf(values)) && isEmpty(values[f.name]));
      if (bad) { setStep(i); setTimeout(() => validate(STEPS[i].fields), 50); return; }
    }
    setSaving(true);
    const { data } = await supabase.rpc("intake_save", { _token: token, _patch: patchFor(allFields) as never, _submit: true });
    const res = (data ?? {}) as { state?: string };
    if (res.state !== "submitted") { setSaving(false); setState(res.state === "closed" ? "closed" : "not_found"); return; }
    await supabase.functions.invoke("intake-submitted", { body: { token } }).catch(() => null);
    setSaving(false);
    setState("done");
  };

  const progress = useMemo(() => Math.round(((step + 1) / STEPS.length) * 100), [step]);

  if (state === "loading") {
    return (
      <Shell>
        <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading your form…
        </div>
      </Shell>
    );
  }

  if (state === "closed" || state === "not_found") {
    return (
      <Shell>
        <div className="py-6 text-center">
          <AlertTriangle className="mx-auto h-10 w-10" style={{ color: NAVY }} />
          <h1 className="mt-4 text-2xl font-black tracking-tight" style={{ color: NAVY }}>
            This form has already been completed
          </h1>
          <p className="mt-3 text-slate-600">
            Nothing more to do here. If you think this is a mistake, contact{" "}
            <a className="font-semibold underline" style={{ color: NAVY }} href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
          </p>
        </div>
      </Shell>
    );
  }

  if (state === "done") {
    return (
      <Shell>
        <div className="py-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full" style={{ background: `${YELLOW}33` }}>
            <CheckCircle2 className="h-8 w-8" style={{ color: NAVY }} />
          </div>
          <h1 className="mt-4 text-2xl font-black tracking-tight" style={{ color: NAVY }}>Intake received</h1>
          <p className="mt-3 text-slate-600">
            Thank you. We order your badge, shirts, vest and vehicle magnets from these answers.
          </p>
          <ul className="mt-5 space-y-2 text-left text-sm text-slate-700">
            <li>· We review your answers within <strong>1 business day</strong>.</li>
            <li>· Your kit is ordered and typically arrives in <strong>7 to 10 days</strong>.</li>
            <li>· We confirm your first paid visit once your badge is in hand.</li>
          </ul>
          <p className="mt-6 text-sm text-slate-500">
            Questions? <a className="font-semibold underline" style={{ color: NAVY }} href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
          </p>
        </div>
      </Shell>
    );
  }

  const current = STEPS[step];
  const isReview = step === STEPS.length - 1;

  return (
    <Shell>
      <div ref={formRef}>
        {/* Progress */}
        <div className="mb-6">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
            <span>Step {step + 1} of {STEPS.length} · {current.short}</span>
            <span>{progress}%</span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progress}%`, background: YELLOW }} />
          </div>
        </div>

        <h1 className="text-2xl font-black tracking-tight" style={{ color: NAVY }}>
          {step + 1} · {current.title}
        </h1>
        <p className="mt-1 text-xs font-semibold text-slate-500">
          <span className="text-red-600">*</span> Required
        </p>

        {current.note && (
          <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">{current.note}</p>
        )}

        {isReview ? (
          <div className="mt-6 space-y-5">
            {STEPS.slice(0, -1).map((s, i) => (
              <div key={s.title} className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold" style={{ color: NAVY }}>{i + 1} · {s.title}</h2>
                  <button type="button" onClick={() => setStep(i)} className="text-xs font-semibold underline" style={{ color: NAVY }}>
                    Edit
                  </button>
                </div>
                <dl className="mt-3 space-y-1.5">
                  {s.fields.filter((f) => !f.showIf || f.showIf(values)).map((f) => {
                    const v = values[f.name];
                    return (
                      <div key={f.name} className="flex gap-3 text-sm">
                        <dt className="w-1/2 shrink-0 text-slate-500">{f.label}</dt>
                        <dd className="w-1/2 font-medium text-slate-900">
                          {isEmpty(v) ? "—" : Array.isArray(v) ? v.join(", ") : String(v)}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-6 space-y-5">
            {current.fields.filter((f) => !f.showIf || f.showIf(values)).map((f) => (
              <FieldRow key={f.name} field={f} value={values[f.name]} error={errors[f.name]} onChange={set} />
            ))}
            {step === 2 && MAGNET_RISK.includes(String(values.door_material ?? "")) && (
              <div className="rounded-xl border-2 border-red-500 bg-red-50 p-4 text-sm text-red-800">
                <strong className="block">Magnets will not stick to aluminium or composite doors.</strong>
                Test with any household magnet on your front door before we order. We never tape or adhere anything to your vehicle.
              </div>
            )}
          </div>
        )}

        <div className="mt-8 flex items-center gap-3">
          {step > 0 && (
            <button
              type="button"
              onClick={() => advance(step - 1)}
              className="inline-flex h-12 items-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
          )}
          <button
            type="button"
            disabled={saving}
            onClick={() => (isReview ? submit() : advance(step + 1))}
            className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-black disabled:opacity-60"
            style={{ background: YELLOW, color: NAVY }}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isReview ? "Submit" : "Save and continue"}
            {!isReview && !saving ? <ArrowRight className="h-4 w-4" /> : null}
          </button>
        </div>
        <p className="mt-3 text-center text-xs text-slate-500">Your answers save as you go.</p>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen px-4 py-8" style={{ background: NAVY }}>
      <Helmet>
        <title>Pro Intake &amp; Kit Order | Tidy</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-5 flex justify-center">
          <TidyLogo size="sm" />
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-2xl sm:p-7">{children}</div>
        <p className="mt-5 text-center text-xs text-white/60">
          Tidy Home Concierge LLC · {SUPPORT_EMAIL}
        </p>
      </div>
    </main>
  );
}

function FieldRow({
  field,
  value,
  error,
  onChange,
}: {
  field: Field;
  value: string | string[] | null | undefined;
  error?: string;
  onChange: (name: string, v: string | string[]) => void;
}) {
  const id = `field-${field.name}`;
  const base = `w-full rounded-xl border px-3.5 py-3 text-base text-slate-900 outline-none focus:ring-2 ${
    error ? "border-red-500 focus:ring-red-200" : "border-slate-300 focus:ring-slate-200"
  }`;
  const selected = Array.isArray(value) ? value : [];

  return (
    <div id={id}>
      <label htmlFor={`${id}-input`} className="block text-sm font-bold" style={{ color: NAVY }}>
        {field.label} {field.required && <span className="text-red-600">*</span>}
      </label>
      {field.help && <p className="mt-0.5 text-xs text-slate-500">{field.help}</p>}

      <div className="mt-1.5">
        {field.type === "textarea" ? (
          <textarea id={`${id}-input`} rows={3} className={base} value={String(value ?? "")} onChange={(e) => onChange(field.name, e.target.value)} />
        ) : field.type === "select" ? (
          <select id={`${id}-input`} className={base} value={String(value ?? "")} onChange={(e) => onChange(field.name, e.target.value)}>
            <option value="">Select…</option>
            {(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : field.type === "bool" ? (
          <select id={`${id}-input`} className={base} value={String(value ?? "")} onChange={(e) => onChange(field.name, e.target.value)}>
            <option value="">Select…</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        ) : field.type === "multi" ? (
          <div className="flex flex-wrap gap-2">
            {(field.options ?? []).map((o) => {
              const on = selected.includes(o);
              return (
                <button
                  key={o}
                  type="button"
                  onClick={() => onChange(field.name, on ? selected.filter((x) => x !== o) : [...selected, o])}
                  className="min-h-[44px] rounded-xl border px-3.5 text-sm font-semibold"
                  style={on ? { background: NAVY, color: "#fff", borderColor: NAVY } : { borderColor: "#cbd5e1", color: NAVY }}
                >
                  {o}
                </button>
              );
            })}
          </div>
        ) : (
          <input
            id={`${id}-input`}
            type={field.type === "number" ? "number" : field.type === "date" ? "date" : field.type}
            inputMode={field.type === "number" ? "numeric" : undefined}
            className={base}
            placeholder={field.placeholder}
            value={String(value ?? "")}
            onChange={(e) => onChange(field.name, e.target.value)}
          />
        )}
      </div>

      {error && <p className="mt-1.5 text-sm font-semibold text-red-600">{error}</p>}
    </div>
  );
}
