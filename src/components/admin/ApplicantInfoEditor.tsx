/** Edit an applicant's contact details in place (name, email, phone, ZIP, service). */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Pencil } from "lucide-react";

type Info = { first_name: string; last_name: string; email: string; phone: string; zip: string; service: string };

export default function ApplicantInfoEditor({
  applicant,
  onSaved,
}: {
  applicant: { id: string; first_name: string; last_name: string; email: string; phone: string | null; zip: string | null; service: string | null };
  onSaved?: () => void;
}) {
  const initial = (): Info => ({
    first_name: applicant.first_name ?? "",
    last_name: applicant.last_name ?? "",
    email: applicant.email ?? "",
    phone: applicant.phone ?? "",
    zip: applicant.zip ?? "",
    service: applicant.service ?? "",
  });
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Info>(initial);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    setForm(initial());
    setEditing(false);
    setSavedAt(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicant.id]);

  const save = async () => {
    const email = form.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast.error("That email doesn't look right");
    if (!form.first_name.trim()) return toast.error("First name is required");
    setSaving(true);
    const { error } = await supabase
      .from("applicants")
      .update({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email,
        phone: form.phone.trim() || null,
        zip: form.zip.trim() || null,
        service: form.service.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", applicant.id);
    setSaving(false);
    if (error) return toast.error("Could not save", { description: error.message });
    setSavedAt(new Date().toISOString());
    setEditing(false);
    toast.success("Applicant details saved");
    onSaved?.();
  };

  const field = (k: keyof Info, label: string) => (
    <label className="block text-[11px] font-semibold text-muted-foreground">
      {label}
      <Input
        value={form[k]}
        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
        className="mt-1 h-8 text-sm"
      />
    </label>
  );

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-foreground">Contact details</h4>
        {!editing && (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
          </Button>
        )}
      </div>
      {editing ? (
        <div className="mt-2 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {field("first_name", "First name")}
            {field("last_name", "Last name")}
          </div>
          {field("email", "Email")}
          <div className="grid grid-cols-3 gap-2">
            {field("phone", "Phone")}
            {field("zip", "ZIP")}
            {field("service", "Service")}
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => { setForm(initial()); setEditing(false); }}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} Save
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-1 text-xs text-muted-foreground">
          {form.email} {form.phone && `· ${form.phone}`}
          {savedAt && (
            <span className="ml-2 inline-flex items-center gap-1 font-semibold text-primary">
              <CheckCircle2 className="h-3.5 w-3.5" /> Saved
            </span>
          )}
        </div>
      )}
    </div>
  );
}
