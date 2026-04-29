/**
 * Public Application Form — /apply
 *
 * Anonymous visitors submit. Calls the public submit-application edge function
 * which inserts the applicant row and notifies Justin. No external background
 * check provider is wired — Justin manually advances each applicant from
 * /admin/applicants.
 */
import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2 } from "lucide-react";

type Form = {
  first_name: string; last_name: string; email: string; phone: string;
  service: "cleaning" | "lawn" | "detail" | "";
  zip: "33156" | "33183" | "33186" | "";
  experience_years: string;
  has_vehicle: boolean;
  has_supplies: boolean;
  notes_for_admin: string;
};

const EMPTY: Form = {
  first_name: "", last_name: "", email: "", phone: "",
  service: "", zip: "", experience_years: "",
  has_vehicle: false, has_supplies: false, notes_for_admin: "",
};

export default function Apply() {
  const [form, setForm] = useState<Form>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.service) { toast({ title: "Please pick a role", variant: "destructive" }); return; }
    if (!form.zip)     { toast({ title: "Please pick your ZIP code", variant: "destructive" }); return; }
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        service: form.service,
        zip: form.zip,
        has_vehicle: form.has_vehicle,
        has_supplies: form.has_supplies,
      };
      if (form.phone) payload.phone = form.phone.trim();
      if (form.experience_years) payload.experience_years = parseInt(form.experience_years, 10);
      if (form.notes_for_admin) payload.notes_for_admin = form.notes_for_admin.trim();

      const { error } = await supabase.functions.invoke("submit-application", { body: payload });
      if (error) throw error;
      setDone(true);
    } catch (err: any) {
      console.error(err);
      toast({ title: "Could not submit", description: err?.message ?? "Please try again", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Helmet><title>Application received | Tidy</title></Helmet>
        <Card className="max-w-lg w-full">
          <CardContent className="p-8 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
            <h1 className="mt-4 text-2xl font-bold text-slate-900">Application received</h1>
            <p className="mt-3 text-slate-600">
              Thanks for applying to Tidy. We'll review and be in touch within 5 business days.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 py-10 px-4">
      <Helmet>
        <title>Apply to be a Tidy contractor</title>
        <meta name="description" content="Join Tidy's contractor network in Miami. Cleaning, lawn, and car detailing." />
      </Helmet>
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Apply to be a Tidy contractor</CardTitle>
            <CardDescription>Miami-based home-service pros only.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="first_name">First name *</Label>
                  <Input id="first_name" required value={form.first_name} onChange={(e) => set("first_name", e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="last_name">Last name *</Label>
                  <Input id="last_name" required value={form.last_name} onChange={(e) => set("last_name", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="email">Email *</Label>
                  <Input id="email" type="email" required value={form.email} onChange={(e) => set("email", e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(786) 555-1234" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Role *</Label>
                  <Select value={form.service} onValueChange={(v) => set("service", v as Form["service"])}>
                    <SelectTrigger><SelectValue placeholder="Pick one" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cleaning">House cleaning</SelectItem>
                      <SelectItem value="lawn">Lawn care</SelectItem>
                      <SelectItem value="detail">Car detailing</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>ZIP code *</Label>
                  <Select value={form.zip} onValueChange={(v) => set("zip", v as Form["zip"])}>
                    <SelectTrigger><SelectValue placeholder="Pick one" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="33156">33156</SelectItem>
                      <SelectItem value="33183">33183</SelectItem>
                      <SelectItem value="33186">33186</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="experience_years">Years of experience</Label>
                <Input id="experience_years" type="number" min={0} max={60}
                  value={form.experience_years}
                  onChange={(e) => set("experience_years", e.target.value)} />
              </div>
              <div className="flex flex-col gap-3 rounded-md border border-slate-200 p-4 bg-white">
                <label className="flex items-center gap-3 text-sm">
                  <Checkbox checked={form.has_vehicle} onCheckedChange={(v) => set("has_vehicle", !!v)} />
                  I have my own vehicle
                </label>
                <label className="flex items-center gap-3 text-sm">
                  <Checkbox checked={form.has_supplies} onCheckedChange={(v) => set("has_supplies", !!v)} />
                  I have my own supplies / equipment
                </label>
              </div>
              <div>
                <Label htmlFor="notes">Anything we should know? (optional)</Label>
                <Textarea id="notes" rows={3} value={form.notes_for_admin} onChange={(e) => set("notes_for_admin", e.target.value)} />
              </div>

              <Button type="submit" size="lg" disabled={submitting} className="w-full bg-[#f5c518] text-[#0f172a] hover:bg-[#f5c518]/90 font-bold">
                {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting…</> : "Submit application"}
              </Button>
              <p className="text-xs text-slate-500 text-center">
                By submitting, you authorize Tidy to run a standard background check.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
