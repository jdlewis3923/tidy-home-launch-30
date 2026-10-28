/** A successful HTTP response alone does not establish an accepted SMS. */
export function proSmsAccepted(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const result = payload as Record<string, unknown>;
  return result.ok === true && result.sent === true && typeof result.message_sid === 'string' && result.message_sid.length > 0;
}