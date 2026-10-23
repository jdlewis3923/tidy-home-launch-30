export type TextMessage = { id: string; at: string; direction: 'inbound' | 'outbound'; body: string | null; status: string; manual: boolean; sid?: string | null; template?: string | null };
export type TextAttention = 'reply' | 'failed' | 'reminder' | 'submitted' | 'waiting' | 'not_sent';
export function phoneKey(phone: string | null | undefined) {
  const digits = (phone ?? '').replace(/\D/g, '');
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
}
export function mergeTextMessages(messages: TextMessage[]) {
  const result = new Map<string, TextMessage>();
  for (const m of messages) {
    const key = m.sid || m.id;
    const old = result.get(key);
    result.set(key, old ? { ...old, ...m, body: m.body ?? old.body, manual: old.manual || m.manual } : m);
  }
  return [...result.values()].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}
export function textAttention(messages: TextMessage[], submitted: boolean, nudgeAt: string | null, nudgedAt: string | null, now = Date.now()): TextAttention {
  const inbound = messages.filter(m => m.direction === 'inbound').at(-1);
  const manual = messages.filter(m => m.direction === 'outbound' && m.manual && ['sent', 'delivered', 'accepted'].includes(m.status)).at(-1);
  if (inbound && (!manual || Date.parse(inbound.at) > Date.parse(manual.at))) return 'reply';
  const outbound = messages.filter(m => m.direction === 'outbound').at(-1);
  if (outbound && ['failed', 'undelivered', 'expired', 'canceled'].includes(outbound.status)) return 'failed';
  if (submitted) return 'submitted';
  if (nudgeAt && !nudgedAt && Date.parse(nudgeAt) <= now) return 'reminder';
  return outbound ? 'waiting' : 'not_sent';
}