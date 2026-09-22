/**
 * Tidy — /coi/:token
 *
 * Insurance certificate upload from the private link in the Pro onboarding
 * email. No login: the long random token in the URL is the authorisation, and it
 * expires after 30 days. Bilingual throughout, English above Spanish.
 */
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ShieldCheck, FileCheck2, Loader2, AlertTriangle } from "lucide-react";
import TidyLogo from "@/components/TidyLogo";

type LoadState =
  | { kind: "loading" }
  | { kind: "not_found" }
  | { kind: "expired" }
  | {
      kind: "open";
      firstName: string;
      reviewStatus: string;
      hasCertificate: boolean;
      carrier: string;
      policy: string;
      effective: string;
      expires: string;
    };

const ACCEPTED = ["application/pdf", "image/jpeg", "image/png", "image/heic", "image/webp"];
const MAX_MB = 12;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = () => reject(new Error("read_failed"));
    reader.readAsDataURL(file);
  });
}

export default function CoiTokenUpload() {
  const { token = "" } = useParams();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [carrier, setCarrier] = useState("");
  const [policy, setPolicy] = useState("");
  const [effective, setEffective] = useState("");
  const [expires, setExpires] = useState("");

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc("coi_token_load", { _token: token });
      if (error || !data) {
        setState({ kind: "not_found" });
        return;
      }
      const row = data as Record<string, unknown>;
      const kind = String(row.state ?? "not_found");
      if (kind === "expired") {
        setState({ kind: "expired" });
        return;
      }
      if (kind !== "open") {
        setState({ kind: "not_found" });
        return;
      }
      setCarrier(String(row.carrier_name ?? ""));
      setPolicy(String(row.policy_number ?? ""));
      setEffective(String(row.effective_date ?? ""));
      setExpires(String(row.expires_at ?? ""));
      setState({
        kind: "open",
        firstName: String(row.first_name ?? ""),
        reviewStatus: String(row.coi_review_status ?? "pending_upload"),
        hasCertificate: Boolean(row.has_certificate),
        carrier: String(row.carrier_name ?? ""),
        policy: String(row.policy_number ?? ""),
        effective: String(row.effective_date ?? ""),
        expires: String(row.expires_at ?? ""),
      });
    })();
  }, [token]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      toast.error("Attach your certificate first / Adjunte su certificado primero");
      return;
    }
    if (!ACCEPTED.includes(file.type)) {
      toast.error("PDF or photo only / Solo PDF o foto");
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      toast.error(`File must be under ${MAX_MB} MB / El archivo debe ser menor de ${MAX_MB} MB`);
      return;
    }
    if (!carrier.trim() || !policy.trim() || !effective || !expires) {
      toast.error("Fill in every field / Complete todos los campos");
      return;
    }
    setSubmitting(true);
    try {
      const file_base64 = await fileToBase64(file);
      const { data, error } = await supabase.functions.invoke("coi-token-submit", {
        body: {
          token,
          carrier_name: carrier.trim(),
          policy_number: policy.trim(),
          effective_date: effective,
          expires_at: expires,
          file_name: file.name,
          file_mime: file.type,
          file_base64,
        },
      });
      if (error) throw error;
      if (!(data as { ok?: boolean })?.ok) throw new Error("submit_failed");
      setDone(true);
    } catch {
      toast.error("That didn't go through. Please try again. / No se envió. Intente de nuevo.");
    } finally {
      setSubmitting(false);
    }
  };

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <div className="flex justify-center">
          <TidyLogo variant="nav" />
        </div>
        {children}
      </div>
    </div>
  );

  if (state.kind === "loading") {
    return shell(
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>,
    );
  }

  if (state.kind === "not_found" || state.kind === "expired") {
    return shell(
      <Card>
        <CardContent className="space-y-3 py-8 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="font-semibold">
            {state.kind === "expired" ? "This link has expired" : "This link isn't valid"}
          </p>
          <p className="text-sm text-muted-foreground">
            {state.kind === "expired"
              ? "Links last 30 days. Email hello@jointidy.co and we'll send a fresh one."
              : "Check the link in your email, or write to hello@jointidy.co."}
          </p>
          <p className="text-sm text-muted-foreground">
            {state.kind === "expired"
              ? "Los enlaces duran 30 días. Escriba a hello@jointidy.co y le enviamos uno nuevo."
              : "Revise el enlace de su correo o escriba a hello@jointidy.co."}
          </p>
        </CardContent>
      </Card>,
    );
  }

  if (done) {
    return shell(
      <Card>
        <CardContent className="space-y-3 py-10 text-center">
          <FileCheck2 className="mx-auto h-10 w-10 text-primary" />
          <p className="text-lg font-semibold">Certificate received</p>
          <p className="text-sm text-muted-foreground">
            Justin reviews it and confirms with you. Nothing else to do here.
          </p>
          <p className="text-sm text-muted-foreground">
            Certificado recibido. Justin lo revisa y le confirma. No hay nada más que hacer aquí.
          </p>
        </CardContent>
      </Card>,
    );
  }

  return shell(
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <ShieldCheck className="h-5 w-5 text-primary" />
            {state.firstName ? `${state.firstName}, your insurance certificate` : "Your insurance certificate"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="space-y-1">
            <p className="font-medium">What we need</p>
            <p className="text-muted-foreground">
              A commercial general liability policy, $1,000,000 per occurrence and $2,000,000 aggregate,
              listing <strong>Tidy Home Concierge LLC</strong> as Additional Insured.
            </p>
            <p className="text-muted-foreground">
              Una póliza de responsabilidad civil comercial, $1,000,000 por incidente y $2,000,000 en
              agregado, con <strong>Tidy Home Concierge LLC</strong> como Asegurado Adicional.
            </p>
          </div>
          <div className="space-y-1 rounded-lg border border-border bg-muted/40 p-3">
            <p className="font-medium">Tidy helps with the cost</p>
            <p className="text-muted-foreground">
              Tidy reimburses up to $50 a month toward your premium for your first 3 months, paid with your
              Friday deposit once the certificate is verified. The certificate must be active and verified
              before your first paid visit.
            </p>
            <p className="text-muted-foreground">
              Tidy le reembolsa hasta $50 al mes de su prima durante los primeros 3 meses, con su depósito
              del viernes, una vez verificado el certificado. El certificado debe estar activo y verificado
              antes de su primera visita pagada.
            </p>
          </div>
          {state.hasCertificate && (
            <p className="rounded-lg bg-primary/10 p-3 text-muted-foreground">
              We already have a certificate on file for you ({state.reviewStatus.replace(/_/g, " ")}).
              Uploading again replaces it. / Ya tenemos un certificado suyo; subir otro lo reemplaza.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="coi-file">
                Certificate (PDF or photo) <span className="text-muted-foreground">/ Certificado (PDF o foto)</span>
              </Label>
              <Input
                id="coi-file"
                type="file"
                accept=".pdf,image/*"
                required
                className="h-12"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="coi-carrier">
                  Carrier name <span className="text-muted-foreground">/ Aseguradora</span>
                </Label>
                <Input id="coi-carrier" value={carrier} onChange={(e) => setCarrier(e.target.value)} required className="h-12" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="coi-policy">
                  Policy number <span className="text-muted-foreground">/ Número de póliza</span>
                </Label>
                <Input id="coi-policy" value={policy} onChange={(e) => setPolicy(e.target.value)} required className="h-12" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="coi-effective">
                  Effective date <span className="text-muted-foreground">/ Fecha de inicio</span>
                </Label>
                <Input id="coi-effective" type="date" value={effective} onChange={(e) => setEffective(e.target.value)} required className="h-12" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="coi-expires">
                  Expiry date <span className="text-muted-foreground">/ Fecha de vencimiento</span>
                </Label>
                <Input id="coi-expires" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} required className="h-12" />
              </div>
            </div>
            <Button type="submit" size="lg" className="h-12 w-full" disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Send my certificate / Enviar mi certificado
            </Button>
          </form>
        </CardContent>
      </Card>
    </>,
  );
}
