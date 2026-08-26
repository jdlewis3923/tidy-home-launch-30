/**
 * Florida sales tax — client-side view of the SERVER rule.
 *
 * The rate and the list of coating-triggering add-on ids are re-exported from
 * supabase/functions/_shared/florida-tax.ts, which is the same module
 * stripe-create-checkout uses to decide taxability and to build the Stripe
 * TaxRate. Displayed tax and charged tax therefore cannot drift apart.
 */
export {
  FLORIDA_TAX,
  cartTriggersFloridaTax,
} from '../../supabase/functions/_shared/florida-tax';
