/**
 * ProKitEditor — editable admin view of a pro_kit row.
 *
 * Shows the Pro's submitted answers, the exact kit for their service with the
 * sizes filled in, the magnet choice, a paste-ready vendor order, plus the
 * admin-only fields (COI checks, Checkr dates, ICA date, Pro number, issued
 * checklist) that are deliberately absent from the public intake form.
 */
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Copy, Loader2 } from "lucide-react";
import {
  KIT_SERVICE_LABEL,
  kitItemsFor,
  kitOrderSummary,
  kitServiceKey,
  magnetTestHolds,
  MAGNET_CREDIT_MONTHLY_USD,
} from "@/lib/proKit";

export type ProKitRow = {
  id: string;
  token: string;
  applicant_id: string | null;
  status: string;
  submitted_at: string | null;
  created_at: string;
  legal_name?: string | null;
  badge_name?: string | null;
  email?: string | null;
  service_line?: string | null;
  [key: string]: unknown;
};

export const KIT_STATUS_LABEL: Record<string, string> = {
  sent: "Sent",
  submitted: "Submitted",
  kit_ordered: "Kit ordered",
  kit_issued: "Kit issued",
};

const COI_CHECKS = [
  "General liability $1M / $2M",
  "Tidy Home Concierge LLC named Additional Insured",
  "Policy active on the first visit date",
  "Certificate filed in company documents",
];

type KitFieldType = "text" | "date" | "number" | "textarea" | "tel" | "email" | "zip";

const SECTIONS: { title: string; fields: [string, string, KitFieldType][] }[] = [
  {
    title: "Identity and contact",
    fields: [
      ["legal_name", "Full legal name", "text"],
      ["badge_name", "Badge name", "text"],
      ["mobile", "Mobile", "tel"],
      ["email", "Email", "email"],
      ["home_zip", "Home ZIP", "zip"],
      ["mail_address", "Mailing address", "textarea"],
      ["badge_back", "Badge back language", "text"],
    ],
  },
  {
    title: "Apparel",
    fields: [
      ["shirt_size", "Shirt size", "text"],
      ["shirt_cut", "Shirt cut", "text"],
      ["vest_size", "Hi-vis vest (lawn only)", "text"],
      ["cap", "Cap", "text"],
    ],
  },
  {
    title: "Vehicle advertising",
    fields: [
      ["vehicle_year", "Vehicle year", "text"],
      ["vehicle_make", "Make", "text"],
      ["vehicle_model", "Model", "text"],
      ["vehicle_color", "Color", "text"],
      ["magnet_test", "Magnet sticks to driver's door", "text"],
      ["vehicle_ad_signed_name", "Agreement signed by", "text"],
    ],
  },
  {
    title: "Service and equipment",
    fields: [
      ["service_line", "Hired for", "text"],
      ["cross_which", "Second line", "text"],
      ["equip_gap", "Equipment gap", "textarea"],
    ],
  },
  {
    title: "Compliance (Pro answers)",
    fields: [
      ["ins_carrier", "Insurance carrier", "text"],
      ["ins_policy", "Policy number", "text"],
      ["ins_expiry", "Policy expiry", "date"],
      ["auto_insurance", "Auto insurance", "text"],
    ],
  },
  {
    title: "Availability",
    fields: [
      ["hours", "Earliest / latest", "text"],
      ["visits_per_week", "Visits per week", "number"],
      ["max_drive", "Maximum drive", "text"],
      ["other_work", "Other work kept", "textarea"],
      ["first_available", "First paid visit", "date"],
    ],
  },
  {
    title: "Admin only",
    fields: [
      ["pro_no", "Pro number", "text"],
      ["checkr_sent", "Checkr sent", "date"],
      ["checkr_cleared", "Checkr cleared", "date"],
      ["ica_signed", "ICA signed", "date"],
      ["issued_date", "Kit issued date", "date"],
      ["issued_by", "Completed by", "text"],
    ],
  },
];

const asArray = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

/** Fulfilment checklist: exactly the items this Pro's service includes. */
export function kitChecklistItems(service: string | null | undefined, magnets: boolean): string[] {
  const items = kitItemsFor(service).map((i) => (i.qty > 1 ? `${i.qty} × ${i.en}` : i.en));
  if (magnets) items.push("2 × Vehicle magnet");
  items.push("Welcome letter");
  return items;
}

export default function ProKitEditor({ kit, onSaved }: { kit: ProKitRow; onSaved: () => void }) {
  const [draft, setDraft] = useState<Record<string, unknown>>({ ...kit });
  const [saving, setSaving] = useState(false);

  const set = (k: string, v: unknown) => setDraft((d) => ({ ...d, [k]: v }));

  const toggle = (k: string, item: string) => {
    const list = asArray(draft[k]);
    set(k, list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
  };

  const serviceKey = kitServiceKey(String(draft.service_line ?? ""));
  const magnets = draft.magnets_opt_in === true;
  const checklist = useMemo(
    () => kitChecklistItems(String(draft.service_line ?? ""), magnets),
    [draft.service_line, magnets],
  );
  const summary = useMemo(() => kitOrderSummary(draft as never), [draft]);
  const magnetBlocked = magnets && !magnetTestHolds(String(draft.magnet_test ?? ""));

  const save = async () => {
    setSaving(true);
    const { id, token, created_at, badge_photo_token, ...rest } = draft as Record<string, unknown> & { id: string };
    const payload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) payload[k] = v === "" ? null : v;
    payload.kit_summary = summary;
    const { error } = await supabase.from("pro_kit").update(payload as never).eq("id", kit.id);
    setSaving(false);
    if (error) toast({ title: "Could not save", description: error.message, variant: "destructive" });
    else { toast({ title: "Kit saved" }); onSaved(); }
  };

  const input =
    "mt-1 min-h-[44px] w-full rounded-lg border border-border bg-background px-3 py-2 text-base text-foreground sm:text-sm";

  return (
    <div className="mt-5 space-y-6">
      <div>
        <label htmlFor="kit-status" className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Status</label>
        <select id="kit-status" className={input} value={String(draft.status ?? "sent")} onChange={(e) => set("status", e.target.value)}>
          {Object.entries(KIT_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <p className="mt-1 text-xs text-muted-foreground">
          Intake link: <code>jointidy.co/intake/{kit.token}</code>
        </p>
      </div>

      {/* Ready to order — exactly what to buy for this Pro. */}
      <div className="rounded-xl border border-border bg-muted/40 p-4">
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Ready to order · {KIT_SERVICE_LABEL[serviceKey].en}
        </h3>
        <ul className="mt-2 space-y-1 text-sm text-foreground">
          {checklist.map((i) => <li key={i}>· {i}</li>)}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          {magnets
            ? `Magnets opted in — $${MAGNET_CREDIT_MONTHLY_USD}/month vehicle advertising credit with the Friday deposit.`
            : "Magnets declined — nothing else changes."}
        </p>
        {magnetBlocked && (
          <p className="mt-2 rounded-lg admin-state-critical px-3 py-2 text-xs font-bold">
            Do not order magnets — the driver's door will not hold one, or it was not tested.
          </p>
        )}
        {magnets && !draft.vehicle_ad_signed_at && (
          <p className="mt-2 rounded-lg admin-state-warning px-3 py-2 text-xs font-bold">
            Vehicle advertising agreement not signed yet — magnets stay on hold.
          </p>
        )}
        <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-background p-3 text-xs text-foreground">
          {summary}
        </pre>
        <button
          type="button"
          onClick={() => { navigator.clipboard.writeText(summary); toast({ title: "Vendor order copied" }); }}
          className="mt-2 inline-flex h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-bold text-foreground"
        >
          <Copy className="h-3.5 w-3.5" /> Copy vendor order
        </button>
        {typeof draft.badge_photo_token === "string" && (
          <p className="mt-3 text-xs text-muted-foreground">
            Badge photo link: <code>jointidy.co/badge/{String(draft.badge_photo_token)}</code>
            {draft.badge_photo_uploaded_at
              ? ` · received ${new Date(String(draft.badge_photo_uploaded_at)).toLocaleDateString()}`
              : " · not received yet"}
          </p>
        )}
      </div>

      {SECTIONS.map((s) => (
        <div key={s.title}>
          <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{s.title}</h3>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {s.fields.map(([k, label, type]) => (
              <div key={k} className={type === "textarea" ? "sm:col-span-2" : ""}>
                <label htmlFor={`kit-${k}`} className="text-xs font-semibold text-foreground">{label}</label>
                {type === "textarea" ? (
                  <textarea id={`kit-${k}`} rows={2} className={input} value={String(draft[k] ?? "")} onChange={(e) => set(k, e.target.value)} />
                ) : (
                  <input
                    id={`kit-${k}`}
                    type={
                      type === "date" ? "date"
                      : type === "number" ? "number"
                      : type === "tel" ? "tel"
                      : type === "email" ? "email"
                      : "text"
                    }
                    inputMode={
                      type === "number" || type === "zip" ? "numeric"
                      : type === "tel" ? "tel"
                      : type === "email" ? "email"
                      : undefined
                    }
                    autoComplete={
                      type === "tel" ? "tel" : type === "email" ? "email" : type === "zip" ? "postal-code" : undefined
                    }
                    maxLength={type === "zip" ? 5 : undefined}
                    className={input}
                    value={String(draft[k] ?? "")}
                    onChange={(e) => set(k, type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value)}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      <div>
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Vehicle magnets</h3>
        <select
          aria-label="Vehicle magnets"
          className={input}
          value={draft.magnets_opt_in === true ? "yes" : draft.magnets_opt_in === false ? "no" : ""}
          onChange={(e) => set("magnets_opt_in", e.target.value === "yes" ? true : e.target.value === "no" ? false : null)}
        >
          <option value="">Not answered</option>
          <option value="yes">Opted in</option>
          <option value="no">Declined</option>
        </select>
      </div>

      <CheckList title="Days available" items={["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]} selected={asArray(draft.days)} onToggle={(i) => toggle("days", i)} />
      <CheckList title="COI checks" items={COI_CHECKS} selected={asArray(draft.coi_checks)} onToggle={(i) => toggle("coi_checks", i)} />
      <CheckList title="Kit ordered" items={checklist} selected={asArray(draft.kit_issued)} onToggle={(i) => toggle("kit_issued", i)} />
      <CheckList title="Kit handed over" items={checklist} selected={asArray(draft.kit_done)} onToggle={(i) => toggle("kit_done", i)} />

      <button
        onClick={save}
        disabled={saving}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-60"
      >
        {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save kit
      </button>
    </div>
  );
}

function CheckList({
  title,
  items,
  selected,
  onToggle,
}: {
  title: string;
  items: string[];
  selected: string[];
  onToggle: (item: string) => void;
}) {
  return (
    <div>
      <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.map((i) => {
          const on = selected.includes(i);
          return (
            <button
              key={i}
              type="button"
              onClick={() => onToggle(i)}
              className={`min-h-[44px] rounded-lg border px-3 py-2 text-xs font-semibold ${
                on ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground"
              }`}
            >
              {i}
            </button>
          );
        })}
      </div>
    </div>
  );
}
