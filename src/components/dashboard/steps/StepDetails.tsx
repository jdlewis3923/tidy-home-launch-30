import { ConfigState, VALID_ZIPS } from '@/lib/dashboard-pricing';

interface Props {
  state: ConfigState;
  onChange: (s: ConfigState) => void;
}

function Field({ label, value, onChange, placeholder, type = 'text', required = false, helpText, error }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; required?: boolean; helpText?: string; error?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border-[1.5px] border-border bg-card px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />
      {helpText && <p className="text-xs text-muted-foreground">{helpText}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export default function StepDetails({ state, onChange }: Props) {
  const setField = (field: keyof ConfigState, value: string) => {
    const next = { ...state, [field]: value };
    if (field === 'zip') {
      next.outOfCoverage = value.length === 5 && !VALID_ZIPS.includes(value);
    }
    onChange(next);
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="First Name" value={state.firstName} onChange={v => setField('firstName', v)} required />
        <Field label="Last Name" value={state.lastName} onChange={v => setField('lastName', v)} required />
      </div>
      <Field label="Email Address" value={state.email} onChange={v => setField('email', v)} type="email" required />
      <Field label="Phone Number" value={state.phone} onChange={v => setField('phone', v)} type="tel" required />

      <hr className="border-border" />

      <Field label="Street Address" value={state.address} onChange={v => setField('address', v)} required />
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="City" value={state.city} onChange={v => setField('city', v)} required />
        <Field
          label="ZIP Code"
          value={state.zip}
          onChange={v => setField('zip', v)}
          required
          error={state.outOfCoverage ? "Heads up — we're currently only serving Kendall (33183), West Kendall (33186), and Pinecrest (33156). If you're just outside these areas, we'll still create your account and contact you the moment we expand near you." : undefined}
        />
      </div>

      <hr className="border-border" />

      <div className="space-y-1.5">
        <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">How will your pro access your property?</label>
        <textarea
          value={state.accessNotes}
          onChange={e => onChange({ ...state, accessNotes: e.target.value })}
          placeholder="Gate code #1234, lockbox on back door, ring doorbell first..."
          rows={3}
          className="w-full rounded-lg border-[1.5px] border-border bg-card px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <p className="text-xs text-muted-foreground">You don't need to be home — just let us know how to get in.</p>
      </div>

      <p className="text-xs text-muted-foreground/70">If we're unable to access the property, service will be automatically rescheduled.</p>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Preferred service day</label>
          <select
            value={state.preferredDay}
            onChange={e => onChange({ ...state, preferredDay: e.target.value })}
            className="w-full rounded-lg border-[1.5px] border-border bg-card px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">No preference</option>
            {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Preferred time window</label>
          <select
            value={state.preferredTime}
            onChange={e => onChange({ ...state, preferredTime: e.target.value })}
            className="w-full rounded-lg border-[1.5px] border-border bg-card px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">No preference</option>
            <option value="morning">Morning (8am–12pm)</option>
            <option value="afternoon">Afternoon (12pm–5pm)</option>
          </select>
        </div>
      </div>
      <p className="text-xs text-muted-foreground/70">If anything affects your scheduled service, we'll automatically reschedule to the next available time.</p>

      <Field
        label="Referral code (optional)"
        value={state.referralCode}
        onChange={v => onChange({ ...state, referralCode: v })}
        placeholder="Enter code if a friend referred you"
        helpText="Both of you get $50 off when you enter a valid code."
      />
    </div>
  );
}
