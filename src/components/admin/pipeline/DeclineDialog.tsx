import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { DECLINE_REASONS } from "@/lib/pipeline";

export type DeclineInput = {
  reason: string;
  note: string;
  preAdverse?: string;
  rightsProvided?: boolean;
  adverse?: string;
};

/**
 * Decline (or bulk decline). When `fcraEligible` is true and the reason is
 * "Background check", the two adverse-action dates are collected first; the
 * server re-checks them and refuses to archive without them.
 */
export default function DeclineDialog({
  open, onOpenChange, names, fcraEligible, onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  names: string[];
  fcraEligible: boolean;
  onConfirm: (input: DeclineInput) => Promise<void> | void;
}) {
  const [reason, setReason] = useState<string>("");
  const [note, setNote] = useState("");
  const [preAdverse, setPreAdverse] = useState("");
  const [rights, setRights] = useState(false);
  const [adverse, setAdverse] = useState("");
  const [busy, setBusy] = useState(false);
  const needsFcra = fcraEligible && reason === "Background check";
  const ready = !!reason && (reason !== "Other" || note.trim().length > 0)
    && (!needsFcra || (!!preAdverse && rights && !!adverse));

  const submit = async () => {
    setBusy(true);
    try {
      await onConfirm({ reason, note: note.trim(), preAdverse: needsFcra ? preAdverse : undefined, rightsProvided: needsFcra ? rights : undefined, adverse: needsFcra ? adverse : undefined });
      setReason(""); setNote(""); setPreAdverse(""); setRights(false); setAdverse("");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Decline {names.length === 1 ? names[0] : `${names.length} candidates`}</DialogTitle>
          <DialogDescription>They leave the board right away. The record stays in the archive.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="decline-reason">Reason</Label>
            <select id="decline-reason" value={reason} onChange={(e) => setReason(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">Pick a reason…</option>
              {DECLINE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="decline-note">{reason === "Other" ? "Reason (required)" : "Note (optional)"}</Label>
            <Textarea id="decline-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
          {needsFcra && (
            <div className="space-y-3 rounded-md border border-border bg-muted/50 p-3">
              <p className="text-xs font-semibold text-foreground">Background-check decline: adverse-action notices are required first.</p>
              <div className="space-y-1.5">
                <Label htmlFor="pre-adverse">Pre-adverse notice sent</Label>
                <Input id="pre-adverse" type="date" value={preAdverse} onChange={(e) => setPreAdverse(e.target.value)} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={rights} onCheckedChange={(v) => setRights(v === true)} />
                Copy of the report and summary of rights provided
              </label>
              <div className="space-y-1.5">
                <Label htmlFor="adverse">Adverse action notice sent (5+ business days later)</Label>
                <Input id="adverse" type="date" value={adverse} onChange={(e) => setAdverse(e.target.value)} />
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" disabled={!ready || busy} onClick={submit}>Decline</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
