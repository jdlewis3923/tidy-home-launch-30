import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ShieldCheck, ExternalLink, Loader2, Check, X } from "lucide-react";

interface Row {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  coi_review_status: string;
  coi_pdf_url: string | null;
  coi_carrier_name: string | null;
  coi_policy_number: string | null;
  coi_effective_date: string | null;
  coi_expires_at: string | null;
  coi_uploaded_at: string | null;
  coi_review_notes: string | null;
}

export default function AdminCoiReview() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [signed, setSigned] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("applicants")
      .select(
        "id, first_name, last_name, email, coi_review_status, coi_pdf_url, coi_carrier_name, coi_policy_number, coi_effective_date, coi_expires_at, coi_uploaded_at, coi_review_notes",
      )
      .not("coi_pdf_url", "is", null)
      .order("coi_uploaded_at", { ascending: false });
    setRows((data ?? []) as Row[]);
    // Sign URLs
    const signedMap: Record<string, string> = {};
    for (const r of data ?? []) {
      if (r.coi_pdf_url) {
        const { data: s } = await supabase.storage
          .from("contractor-coi-pdfs")
          .createSignedUrl(r.coi_pdf_url, 60 * 30);
        if (s?.signedUrl) signedMap[r.id] = s.signedUrl;
      }
    }
    setSigned(signedMap);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const decide = async (id: string, status: "approved" | "rejected") => {
    const { error } = await supabase
      .from("applicants")
      .update({
        coi_review_status: status,
        coi_review_notes: notes[id] ?? null,
      })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`COI ${status}`);
    load();
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-blue-600 to-blue-800 grid place-items-center">
            <ShieldCheck className="h-5 w-5 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">COI Review Queue</h1>
          <Badge variant="secondary" className="ml-auto">{rows.length}</Badge>
        </div>

        {loading ? (
          <div className="grid place-items-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : rows.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-slate-500">No COI submissions.</CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {rows.map((r, i) => (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <Card className="border-slate-200">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-base">
                      {r.first_name} {r.last_name}{" "}
                      <span className="text-sm text-slate-500 font-normal">· {r.email}</span>
                    </CardTitle>
                    <Badge
                      variant={
                        r.coi_review_status === "approved"
                          ? "default"
                          : r.coi_review_status === "rejected"
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {r.coi_review_status.replace(/_/g, " ")}
                    </Badge>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div><div className="text-slate-500">Carrier</div><div className="font-medium">{r.coi_carrier_name ?? "—"}</div></div>
                      <div><div className="text-slate-500">Policy</div><div className="font-medium">{r.coi_policy_number ?? "—"}</div></div>
                      <div><div className="text-slate-500">Effective</div><div className="font-medium">{r.coi_effective_date ?? "—"}</div></div>
                      <div><div className="text-slate-500">Expires</div><div className="font-medium">{r.coi_expires_at ?? "—"}</div></div>
                    </div>
                    {signed[r.id] && (
                      <a
                        href={signed[r.id]}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-blue-700 hover:underline text-sm"
                      >
                        <ExternalLink className="h-4 w-4" /> Open PDF
                      </a>
                    )}
                    <Textarea
                      placeholder="Review notes (optional)"
                      defaultValue={r.coi_review_notes ?? ""}
                      onChange={(e) => setNotes((p) => ({ ...p, [r.id]: e.target.value }))}
                    />
                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        onClick={() => decide(r.id, "approved")}
                        className="bg-emerald-600 hover:bg-emerald-700"
                      >
                        <Check className="h-4 w-4 mr-1" /> Approve
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => decide(r.id, "rejected")}>
                        <X className="h-4 w-4 mr-1" /> Reject
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
