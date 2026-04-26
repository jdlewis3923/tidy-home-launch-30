import { ConfigState, VALID_ZIPS } from '@/lib/dashboard-pricing';

interface Props {
  state: ConfigState;
  onChange: (s: ConfigState) => void;
}

function Field({ label, value, onChange, placeholder, type = 'text', required = false, helpText, error, autoComplete }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; required?: boolean;
  helpText?: string; error?: string; autoComplete?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint">
        {label} {required && <span className="text-ink-faint">*</span>}
      </label>
      <input
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-hairline bg-white px-4 py-3 text-sm text-ink placeholder:text-ink-faint/60 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/10"
      />
      {helpText && <p className="text-[11px] text-ink-faint">{helpText}</p>}
      {error && <p className="text-[11px] text-destructive">{error}</p>}
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
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="first name" value={state.firstName} onChange={v => setField('firstName', v)} required autoComplete="given-name" />
        <Field label="last name"  value={state.lastName}  onChange={v => setField('lastName',  v)} required autoComplete="family-name" />
      </div>
      <Field label="email" value={state.email} onChange={v => setField('email', v)} type="email" required autoComplete="email" />
      <Field
        label="create password"
        value={state.password}
        onChange={v => setField('password', v)}
        type="password"
        required
        autoComplete="new-password"
        placeholder="min. 8 characters"
        helpText={state.password.length === 0
          ? "we'll create your tidy account so you can manage your plan anytime."
          : state.password.length < 8
            ? `${8 - state.password.length} more characters.`
            : 'strong enough.'}
      />
      <Field label="phone" value={state.phone} onChange={v => setField('phone', v)} type="tel"   required autoComplete="tel" />

      <div className="h-px bg-hairline" />

      <Field label="street address" value={state.address} onChange={v => setField('address', v)} required autoComplete="street-address" />
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="city" value={state.city} onChange={v => setField('city', v)} required autoComplete="address-level2" />
        <Field
          label="zip"
          value={state.zip}
          onChange={v => setField('zip', v)}
          required
          autoComplete="postal-code"
          error={state.outOfCoverage ? "we're currently serving Kendall (33183), West Kendall (33186), and Pinecrest (33156). just outside? we'll create your account and reach out the moment we expand near you." : undefined}
        />
      </div>

      <div className="h-px bg-hairline" />

      <div className="space-y-1.5">
        <label className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint">
          how should we get in?
        </label>
        <textarea
          value={state.accessNotes}
          onChange={e => onChange({ ...state, accessNotes: e.target.value })}
          placeholder="gate code, lockbox, leave by side door…"
          rows={3}
          className="w-full rounded-lg border border-hairline bg-white px-4 py-3 text-sm text-ink placeholder:text-ink-faint/60 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/10"
        />
        <p className="text-[11px] text-ink-faint">you don't need to be home. same crew, every visit.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint">preferred day</label>
          <select
            value={state.preferredDay}
            onChange={e => onChange({ ...state, preferredDay: e.target.value })}
            className="w-full rounded-lg border border-hairline bg-white px-4 py-3 text-sm text-ink focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/10"
          >
            <option value="">no preference</option>
            {['Monday','Tuesday','Wednesday','Thursday','Friday'].map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint">preferred window</label>
          <select
            value={state.preferredTime}
            onChange={e => onChange({ ...state, preferredTime: e.target.value })}
            className="w-full rounded-lg border border-hairline bg-white px-4 py-3 text-sm text-ink focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/10"
          >
            <option value="">no preference</option>
            <option value="morning">morning · 8am–12pm</option>
            <option value="afternoon">afternoon · 12pm–5pm</option>
          </select>
        </div>
      </div>

      <Field
        label="referral code (optional)"
        value={state.referralCode}
        onChange={v => onChange({ ...state, referralCode: v })}
        placeholder="enter code if a friend referred you"
        helpText="both of you get $50 off when the code is valid."
      />
    </div>
  );
}
