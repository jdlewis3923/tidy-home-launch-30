/**
 * ProKitEditor — editable admin view of a pro_kit row.
 *
 * Shows the Pro's submitted answers plus the admin-only fields (COI checks,
 * Checkr dates, ICA date, Pro number, kit issued checklist, issued date and
 * completed by) that are deliberately absent from the public intake form.
 */
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

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

const KIT_ITEMS = ["Badge", "Polo", "Tee", "Vest", "Cap", "Vehicle magnets", "Welcome letter"];

const SECTIONS: { title: string; fields: [string, string, "text" | "date" | "number" | "textarea"][] }[] = [
  {
    title: "Identity and contact",
    fields: [
      ["legal_name", "Full legal name", "text"],
      ["badge_name", "Badge name", "text"],
      ["mobile", "Mobile", "text"],
      ["email", "Email", "text"],
      ["home_zip", "Home ZIP", "text"],
      ["mail_address", "Mailing address", "textarea"],
      ["badge_back", "Badge back language", "text"],
    ],
  },
  {
    title: "Apparel",
    fields: [
      ["polo_size", "Polo size", "text"],
      ["polo_cut", "Polo cut", "text"],
      ["tee_size", "Tee size", "text"],
      ["tee_cut", "Tee cut", "text"],
      ["vest_size", "Vest", "text"],
      ["cap", "Cap", "text"],
    ],
  },
  {
    title: "Vehicle",
    fields: [
      ["vehicle", "Year / make / model", "text"],
      ["vehicle_color", "Colour", "text"],
      ["vehicle_2", "Second vehicle", "text"],
      ["door_material", "Door material", "text"],
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
      ["dl_number", "Licence number", "text"],
      ["dl_expiry", "Licence expiry", "date"],
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

export default function ProKitEditor({ kit, onSaved }: { kit: ProKitRow; onSaved: () => void }) {
  const [draft, setDraft] = useState<Record<string, unknown>>({ ...kit });
  const [saving, setSaving] = useState(false);

  const set = (k: string, v: unknown) => setDraft((d) => ({ ...d, [k]: v }));

  const toggle = (k: string, item: string) => {
    const list = asArray(draft[k]);
    set(k, list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
  };

  const save = async () => {
    setSaving(true);
    const { id, token, created_at, ...rest } = draft as Record<string, unknown> & { id: string };
    const payload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) payload[k] = v === "" ? null : v;
    const { error } = await supabase.from("pro_kit").update(payload as never).eq("id", kit.id);
    setSaving(false);
    if (error) toast({ title: "Could not save", description: error.message, variant: "destructive" });
    else { toast({ title: "Kit saved" }); onSaved(); }
  };

  const input = "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground";

  return (
    <div className="mt-5 space-y-6">
      <div>
        <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Status</label>
        <select className={input} value={String(draft.status ?? "sent")} onChange={(e) => set("status", e.target.value)}>
          {Object.entries(KIT_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <p className="mt-1 text-xs text-muted-foreground">
          Intake link: <code>jointidy.co/intake/{kit.token}</code>
        </p>
      </div>

      {SECTIONS.map((s) => (
        <div key={s.title}>
          <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{s.title}</h3>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {s.fields.map(([k, label, type]) => (
              <div key={k} className={type === "textarea" ? "sm:col-span-2" : ""}>
                <label className="text-xs font-semibold text-foreground">{label}</label>
                {type === "textarea" ? (
                  <textarea rows={2} className={input} value={String(draft[k] ?? "")} onChange={(e) => set(k, e.target.value)} />
                ) : (
                  <input
                    type={type === "date" ? "date" : type === "number" ? "number" : "text"}
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

      <CheckList title="Days available" items={["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]} selected={asArray(draft.days)} onToggle={(i) => toggle("days", i)} />
      <CheckList title="COI checks" items={COI_CHECKS} selected={asArray(draft.coi_checks)} onToggle={(i) => toggle("coi_checks", i)} />
      <CheckList title="Kit issued" items={KIT_ITEMS} selected={asArray(draft.kit_issued)} onToggle={(i) => toggle("kit_issued", i)} />
      <CheckList title="Kit handed over" items={KIT_ITEMS} selected={asArray(draft.kit_done)} onToggle={(i) => toggle("kit_done", i)} />

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
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
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
