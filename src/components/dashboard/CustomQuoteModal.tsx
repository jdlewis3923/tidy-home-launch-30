import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ConfigState, hasCustomQuote, serviceLabels, ServiceType } from '@/lib/dashboard-pricing';
import { fireCustomQuote } from '@/lib/webhooks';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  state: ConfigState;
  onSubmitted: () => void;
}

export default function CustomQuoteModal({ open, onOpenChange, state, onSubmitted }: Props) {
  const [name, setName] = useState(`${state.firstName} ${state.lastName}`.trim());
  const [phone, setPhone] = useState(state.phone || '');
  const [address, setAddress] = useState(
    [state.address, state.city, state.zip].filter(Boolean).join(', ')
  );
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const customServices: ServiceType[] = state.services.filter(s => {
    if (s === 'cleaning') return state.homeSize === 'custom';
    if (s === 'lawn') return state.yardSize === 'custom';
    if (s === 'detailing') return state.vehicleSize === 'custom';
    return false;
  });

  const canSubmit = name.trim() && phone.trim() && address.trim() && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    await fireCustomQuote({
      customer_name: name.trim(),
      customer_phone: phone.trim(),
      customer_email: state.email,
      address: address.trim(),
      services: state.services.map(s => serviceLabels[s]),
      custom_services: customServices.map(s => serviceLabels[s]),
      notes: notes.trim() || undefined,
    });
    setDone(true);
    setSubmitting(false);
    // Give the user a beat to read the confirmation, then close + advance.
    setTimeout(() => {
      onSubmitted();
    }, 1800);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!submitting && !done) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        {done ? (
          <div className="py-6 text-center space-y-3">
            <div className="text-4xl">✅</div>
            <DialogHeader>
              <DialogTitle className="text-center">Got it. We're building your plan now.</DialogTitle>
              <DialogDescription className="text-center">
                You'll receive your custom plan shortly.
              </DialogDescription>
            </DialogHeader>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Custom Plan Required</DialogTitle>
              <DialogDescription>
                We'll create a plan tailored to your home. Takes under a minute.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  className="w-full rounded-lg border-[1.5px] border-border bg-card px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Phone</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  required
                  className="w-full rounded-lg border-[1.5px] border-border bg-card px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Address</label>
                <input
                  type="text"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  required
                  className="w-full rounded-lg border-[1.5px] border-border bg-card px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Anything we should know? (sq ft, vehicle type, gate codes…)"
                  className="w-full rounded-lg border-[1.5px] border-border bg-card px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full rounded-lg bg-gradient-to-br from-primary-deep to-primary px-6 py-3 text-sm font-extrabold text-primary-foreground shadow-[0_4px_16px_rgba(37,99,235,0.35)] transition-all hover:shadow-xl hover:scale-[1.01] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                {submitting ? 'Sending…' : 'Get My Plan →'}
              </button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Re-export so callers can guard rendering
export { hasCustomQuote };
