export const CONSENT_VALIDATE_EVENT = 'tidy:validate-booking-consents';

export function bookingTermsWording(language: string) {
  return language === 'es'
    ? 'Acepto los Términos de Servicio y la Política de Privacidad de Tidy.'
    : "I agree to Tidy's Terms of Service and Privacy Policy.";
}

export function requiredBookingConsentsComplete(values: readonly unknown[]) {
  return values.length > 0 && values.every(value => value === true);
}

export function validateBookingConsents() {
  window.dispatchEvent(new Event(CONSENT_VALIDATE_EVENT));
}