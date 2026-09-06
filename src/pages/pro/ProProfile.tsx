/**
 * Profile — /pro/profile
 * Insurance certificate upload (the one thing that unblocks visit actions),
 * account details and sign out.
 */
import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { FileUp, LogOut } from "lucide-react";
import ProShell from "@/components/pro/portal/ProShell";
import { ProButton, ProCard, ScheduleSkeleton, SettingRow, StatusPill } from "@/components/pro/portal/kit";
import { useProSession } from "@/hooks/useProSession";
import { supabase } from "@/integrations/supabase/client";

export default function ProProfile() {
  const navigate = useNavigate();
  const { me, coi, userId, loading, reload } = useProSession();
  const [carrier, setCarrier] = useState("");
  const [policy, setPolicy] = useState("");
  const [expires, setExpires] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  if (!loading && !userId) return <Navigate to="/pro/welcome" replace />;

  const submitCoi = async () => {
    if (!file || !userId || !me?.pro_id) return;
    setBusy(true);
    setMsg(null);
    try {
      const ext = (file.name.split(".").pop() ?? "pdf").toLowerCase();
      const path = `${userId}/coi-${Date.now()}.${ext}`;
      const up = await supabase.storage.from("contractor-coi-pdfs").upload(path, file);
      if (up.error) throw up.error;
      const { error } = await supabase.from("contractor_insurance").insert({
        applicant_id: me.pro_id,
        contractor_id: userId,
        carrier_name: carrier || null,
        policy_number: policy || null,
        expiration_date: expires || null,
        certificate_path: path,
        certificate_mime: file.type || null,
      });
      if (error) throw error;
      setMsg({ tone: "ok", text: "Certificate uploaded. Tidy reviews it and your status updates here." });
      setFile(null);
      setCarrier("");
      setPolicy("");
      setExpires("");
      reload();
    } catch {
      setMsg({
        tone: "bad",
        text: "That upload didn't go through. Email hello@jointidy.co and we'll take it directly.",
      });
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate("/pro/welcome", { replace: true });
  };

  return (
    <ProShell title="Profile">
      {loading && <ScheduleSkeleton />}
      {!loading && (
        <div className="space-y-5 px-[18px] py-4">
          <ProCard>
            <p className="text-[12px] font-bold uppercase tracking-wide text-[hsl(var(--pro-ink-soft))]">
              Signed in as
            </p>
            <p className="text-[18px] font-extrabold text-[hsl(var(--pro-ink))]">
              {me?.first_name ?? "Tidy Pro"}
            </p>
            {me?.pro_number && (
              <p className="text-[14px] text-[hsl(var(--pro-ink-soft))]">{me.pro_number}</p>
            )}
          </ProCard>

          <ProCard tone={coi?.can_work ? "green" : "amber"}>
            <div className="flex items-center justify-between">
              <p className="text-[15px] font-bold text-[hsl(var(--pro-ink))]">Certificate of insurance</p>
              <StatusPill tone={coi?.can_work ? "green" : "amber"}>{coi?.status ?? "none"}</StatusPill>
            </div>
            <p className="mt-1 text-[14px] text-[hsl(var(--pro-ink-soft))]">
              {coi?.can_work
                ? "Valid certificate on file. Upload a new one before it expires."
                : "A valid certificate is required before you can start or complete a visit."}
            </p>

            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="text-[13px] font-bold text-[hsl(var(--pro-ink))]">Carrier</span>
                <input
                  value={carrier}
                  onChange={(e) => setCarrier(e.target.value)}
                  className="mt-1 min-h-[48px] w-full rounded-xl border border-[hsl(var(--pro-navy)/0.07)] bg-white px-4 text-[16px]"
                />
              </label>
              <label className="block">
                <span className="text-[13px] font-bold text-[hsl(var(--pro-ink))]">Policy number</span>
                <input
                  value={policy}
                  onChange={(e) => setPolicy(e.target.value)}
                  className="mt-1 min-h-[48px] w-full rounded-xl border border-[hsl(var(--pro-navy)/0.07)] bg-white px-4 text-[16px]"
                />
              </label>
              <label className="block">
                <span className="text-[13px] font-bold text-[hsl(var(--pro-ink))]">Expires</span>
                <input
                  type="date"
                  value={expires}
                  onChange={(e) => setExpires(e.target.value)}
                  className="mt-1 min-h-[48px] w-full rounded-xl border border-[hsl(var(--pro-navy)/0.07)] bg-white px-4 text-[16px]"
                />
              </label>
              <label className="flex min-h-[52px] cursor-pointer items-center gap-2 rounded-xl border-2 border-dashed border-[hsl(var(--pro-sky)/0.7)] bg-white px-4 text-[14px] font-bold text-[hsl(var(--pro-blue))]">
                <FileUp className="h-5 w-5" aria-hidden />
                {file ? file.name : "Choose certificate (PDF or photo)"}
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <ProButton full disabled={!file || busy} onClick={() => void submitCoi()}>
                {busy ? "Uploading…" : "Upload certificate"}
              </ProButton>
              {msg && (
                <p
                  className={`rounded-xl p-3 text-[14px] font-semibold ${
                    msg.tone === "ok"
                      ? "bg-[hsl(var(--pro-green-soft))] text-[hsl(var(--pro-green))]"
                      : "bg-[hsl(var(--pro-red-soft))] text-[hsl(var(--pro-red))]"
                  }`}
                >
                  {msg.text}
                </p>
              )}
            </div>
          </ProCard>

          <PushOptIn />

          <div className="overflow-hidden rounded-[18px] border border-[hsl(var(--pro-navy)/0.07)]">
            <SettingRow to="/pro/notifications" label="Notifications" />
            <SettingRow to="/pro/status" label="Badge and tier" />
            <SettingRow
              label="Contact support"
              onClick={() => {
                window.location.href = "mailto:hello@jointidy.co";
              }}
            />
          </div>

          <button
            type="button"
            onClick={() => void signOut()}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border-2 border-[hsl(var(--pro-red)/0.4)] bg-white text-[15px] font-bold text-[hsl(var(--pro-red))]"
          >
            <LogOut className="h-4 w-4" aria-hidden /> Sign out
          </button>
        </div>
      )}
    </ProShell>
  );
}
