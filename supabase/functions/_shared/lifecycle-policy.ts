export function lifecycleCanSend(input: { shadow: boolean; test: boolean; forceShadow: boolean; eventBacked: boolean; eventLive: boolean; stageLive: boolean }): boolean {
  if (input.test || input.forceShadow) return false;
  return input.eventBacked ? input.eventLive : !input.shadow && input.stageLive;
}
export function lifecycleTemplatePair(key: string): string {
  return key.replace(/_sms(?=\d|$)/, '_email');
}