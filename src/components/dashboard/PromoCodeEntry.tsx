import { useState } from 'react';
import { setPromoCodeManual } from '@/lib/promo';
import { usePromoState } from '@/hooks/usePromoCapture';

/**
 * Collapsed "Have a promo code?" affordance shown on the cart/review screen.
 * Expands to an input + Apply button. Manual entry overwrites any URL-captured code.
 */
export default function PromoCodeEntry() {
  const { code } = usePromoState();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [justApplied, setJustApplied] = useState(false);

  const handleApply = () => {
    const applied = setPromoCodeManual(value);
    if (applied) {
      setValue('');
      setJustApplied(true);
      setOpen(false);
      setTimeout(() => setJustApplied(false), 2500);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-semibold text-primary hover:underline"
      >
        {code ? 'Have a different promo code?' : 'Have a promo code?'}
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
        Promo code
      </label>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleApply();
            }
          }}
          autoFocus
          placeholder="e.g. FOUNDING50"
          className="flex-1 rounded-lg border-[1.5px] border-border bg-background px-3 py-2 text-sm uppercase tracking-wide text-foreground focus:border-primary focus:outline-none"
        />
        <button
          type="button"
          onClick={handleApply}
          disabled={!value.trim()}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          Apply
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setValue('');
          }}
          className="rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted"
        >
          Cancel
        </button>
      </div>
      {justApplied && (
        <p className="text-xs font-semibold text-success">Code applied ✓</p>
      )}
    </div>
  );
}
