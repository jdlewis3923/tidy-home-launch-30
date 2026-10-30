// Size selection is owned by the validated cleaning service line, not an add-on picker.
export async function resolveDeepCleanLines(admin: any, stripe: any, addons: Array<{ addon_name: string; qty: number }>, services: Array<{ service: string; size: number }>) {
  const deep = addons.filter(a => a.addon_name === 'deep_clean');
  if (!deep.length) return [];
  const cleaning = services.find(s => s.service === 'cleaning');
  if (!cleaning || deep.length !== 1 || deep[0].qty !== 1) throw new Error('deep_clean_requires_one_cleaning_plan');
  const { data: quote, error } = await admin.rpc('deep_clean_catalog_quote', { _addon_key: 'deep_clean', _size: cleaning.size, _quarterly: false });
  if (error || !quote) throw new Error(error?.message ?? 'deep_clean_quote_unavailable');
  const prices = await stripe.prices.list({ active: true, lookup_keys: [quote.lookup_key], limit: 1 });
  const price = prices.data[0];
  if (!price || price.unit_amount !== quote.price_cents) throw new Error('deep_clean_price_not_configured_for_this_mode');
  return [{ price: price.id, quantity: 1 }];
}