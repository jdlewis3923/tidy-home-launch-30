import { useEffect, useId, useState, type ReactNode } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { useLanguage } from '@/contexts/LanguageContext';
import { CONSENT_VALIDATE_EVENT, validateBookingConsents } from '@/lib/booking-consent';

export function ConsentCheckbox({ checked, onCheckedChange, children, disabled = false, required = true }: {
  checked: boolean; onCheckedChange: (checked: boolean) => void; children: ReactNode;
  disabled?: boolean; required?: boolean;
}) {
  const id = useId();
  const { language } = useLanguage();
  const [attempted, setAttempted] = useState(false);
  useEffect(() => {
    const validate = () => setAttempted(true);
    window.addEventListener(CONSENT_VALIDATE_EVENT, validate);
    return () => window.removeEventListener(CONSENT_VALIDATE_EVENT, validate);
  }, []);
  const invalid = required && attempted && !checked;
  return <div className="booking-consent">
    <label htmlFor={id} className="booking-consent-label">
      <Checkbox id={id} className="booking-consent-box" checked={checked} disabled={disabled}
        required={required} aria-required={required} aria-invalid={invalid}
        aria-describedby={invalid ? `${id}-error` : undefined}
        onCheckedChange={value => onCheckedChange(value === true)} />
      <span className="min-w-0 flex-1">{children}</span>
    </label>
    {invalid && <p id={`${id}-error`} role="alert" className="booking-consent-error">
      {language === 'es' ? 'Confirma para continuar' : 'Please confirm to continue'}
    </p>}
  </div>;
}

/** A disabled CTA still explains missing agreements on pointer or keyboard attempts. */
export function ConsentContinue({ disabled, children }: { disabled: boolean; children: ReactNode }) {
  const { language } = useLanguage();
  return <div role="group" tabIndex={disabled ? 0 : undefined}
    aria-label={language === 'es' ? 'Continuar después de confirmar los acuerdos requeridos' : 'Continue after confirming required agreements'}
    onPointerDownCapture={() => { if (disabled) validateBookingConsents(); }}
    onKeyDownCapture={event => {
      if (disabled && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault(); validateBookingConsents();
      }
    }}>{children}</div>;
}