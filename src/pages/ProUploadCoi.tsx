import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ShieldCheck, Upload, FileCheck2, Loader2 } from "lucide-react";

export default function ProUploadCoi() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [carrier, setCarrier] = useState("");
  const [policy, setPolicy] = useState("");
  const [effective, setEffective] = useState("");
  const [expires, setExpires] = useState("");
  const [currentStatus, setCurrentStatus] = useState<string>("pending_upload");
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        navigate("/login?next=/pro/upload-coi");
        return;
      }
      setUserId(data.user.id);
      const { data: app } = await supabase
        .from("applicants")
        .select("coi_review_status, coi_pdf_url, coi_carrier_name, coi_policy_number, coi_effective_date, coi_expires_at")
        .eq("contractor_id", data.user.id)
        .maybeSingle();
      if (app) {
        setCurrentStatus(app.coi_review_status ?? "pending_upload");
        setCurrentUrl(app.coi_pdf_url);
        setCarrier(app.coi_carrier_name ?? "");
        setPolicy(app.coi_policy_number ?? "");
        setEffective(app.coi_effective_date ?? "");
        setExpires(app.coi_expires_at ?? "");
      }
      setLoading(false);
    })();
  }, [navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !userId) {
      toast.error("Select a PDF first");
      return;
    }
    if (file.type !== "application/pdf") {
      toast.error("Only PDF files accepted");
      return;
    }
    setSubmitting(true);
    try {
      const path = `${userId}/coi-${Date.now()}.pdf`;
      const { error: upErr } = await supabase.storage
        .from("contractor-coi-pdfs")
        .upload(path, file, { contentType: "application/pdf", upsert: false });
      if (upErr) throw upErr;

      const { error: updErr } = await supabase
        .from("applicants")
        .update({
          coi_pdf_url: path,
          coi_uploaded_at: new Date().toISOString(),
          coi_carrier_name: carrier || null,
          coi_policy_number: policy || null,
          coi_effective_date: effective || null,
          coi_expires_at: expires || null,
          coi_review_status: "pending_review",
        })
        .eq("contractor_id", userId);
      if (updErr) throw updErr;

      toast.success("COI submitted. Admin will review within 24h.");
      setCurrentStatus("pending_review");
      setCurrentUrl(path);
      setFile(null);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-gradient-to-br from-slate-50 to-blue-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/40 to-amber-50/30 p-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-2xl mx-auto"
      >
        <div className="mb-6 flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 grid place-items-center shadow-lg">
            <ShieldCheck className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Upload Certificate of Insurance</h1>
            <p className="text-sm text-slate-600">PDF only · Reviewed within 24h</p>
          </div>
        </div>

        <Card className="border-slate-200 shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileCheck2 className="h-5 w-5 text-blue-600" />
              Status: <span className="capitalize text-blue-700">{currentStatus.replace(/_/g, " ")}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <Label>COI PDF</Label>
                <Input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  required={!currentUrl}
                />
                {currentUrl && (
                  <p className="text-xs text-slate-500 mt-1">Current file on record. Upload to replace.</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Carrier</Label>
                  <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="State Farm" />
                </div>
                <div>
                  <Label>Policy #</Label>
                  <Input value={policy} onChange={(e) => setPolicy(e.target.value)} placeholder="ABC-12345" />
                </div>
                <div>
                  <Label>Effective</Label>
                  <Input type="date" value={effective} onChange={(e) => setEffective(e.target.value)} />
                </div>
                <div>
                  <Label>Expires</Label>
                  <Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
                </div>
              </div>
              <Button
                type="submit"
                disabled={submitting}
                className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" /> Submit for Review
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
