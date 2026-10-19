/**
 * Invite — /admin/hiring/invite (hiring v5)
 * Paste rows (first name | phone | service | language | source); each person is
 * created (or re-sent / reopened by phone match) and texted their tokenized
 * /apply link. Sprint mode shortens the deadline to 24 h.
 */
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Send } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type Parsed = { first_name: string; phone: string; service: string; language: string; source: string };
type Result = { first: string; phone: string; service?: string; lang?: string; status: string; sms?: string; deadline?: string; error?: string };

function parse(text: string): Parsed[] {
  return text.split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
    const parts = line.split(/[|\t,]/).map((p) => p.trim());
    return {
      first_name: parts[0] ?? "",
      phone: parts[1] ?? "",
      service: parts[2] ?? "",
      language: parts[3] ?? "en",
      source: parts[4] ?? "indeed",
    };
  });
}

const fmt = (iso?: string) => iso
  ? new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
  : "—";

export default function HiringInvite() {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [meta, setMeta] = useState<{ sprint: boolean; deadline_hours: number } | null>(null);

  const rows = parse(text);

  const send = async () => {
    if (rows.length === 0) return;
    setSending(true);
    setResults(null);
    const { data, error } = await supabase.functions.invoke("hiring-invite", { body: { rows } });
    setSending(false);
    if (error) {
      toast({ title: "Invites failed", description: error.message, variant: "destructive" });
      return;
    }
    setResults((data?.results as Result[]) ?? []);
    setMeta({ sprint: !!data?.sprint, deadline_hours: data?.deadline_hours ?? 48 });
    const failed = ((data?.results as Result[]) ?? []).filter((r) => r.status === "error" || (r.sms ?? "").startsWith("failed"));
    toast({
      title: failed.length === 0 ? "All invites sent" : `${failed.length} invite(s) need attention`,
      variant: failed.length === 0 ? "default" : "destructive",
    });
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-foreground mb-2">Invite applicants</h1>
      <p className="text-sm text-muted-foreground mb-6">
        One per line: <span className="font-medium text-foreground">first name | phone | service | language | source</span>.
        Service: cleaning, lawn, or car. Language: en or es. Anyone already on file gets a resend; an archived record is reopened once.
      </p>

      <textarea
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[180px] font-mono"
        placeholder={"Andrew | (847) 602-2518 | lawn | en | indeed\nBetsy | (786) 894-7670 | cleaning | es | indeed"}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="mt-3 flex items-center gap-3">
        <Button onClick={send} disabled={sending || rows.length === 0}>
          {sending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
          Send {rows.length > 0 ? `${rows.length} invite${rows.length === 1 ? "" : "s"}` : "invites"}
        </Button>
        {meta ? (
          <span className="text-xs text-muted-foreground">
            Deadline: {meta.deadline_hours} h{meta.sprint ? " (sprint mode)" : ""}
          </span>
        ) : null}
      </div>

      {results ? (
        <div className="mt-8 rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold text-foreground mb-3">Message log</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2 pr-4">Name</th><th className="py-2 pr-4">Phone</th><th className="py-2 pr-4">Record</th><th className="py-2 pr-4">Text</th><th className="py-2">Link closes</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="py-2 pr-4 text-foreground">{r.first}</td>
                    <td className="py-2 pr-4 text-foreground">{r.phone}</td>
                    <td className="py-2 pr-4">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${r.status === "error" ? "bg-red-100 text-red-800" : r.status === "reopened" ? "bg-amber-100 text-amber-800" : r.status === "resent" ? "bg-blue-100 text-blue-800" : "bg-green-100 text-green-800"}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      {r.status === "error" ? (
                        <span className="text-xs text-red-700">{r.error}</span>
                      ) : (
                        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${(r.sms ?? "").startsWith("failed") ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"}`}>
                          {r.sms}
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-foreground">{fmt(r.deadline)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
