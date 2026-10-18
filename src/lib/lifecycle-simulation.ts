export type SimulationMessage = { id: string; channel: string; send_at: string; template_key: string; status: string; body: string | null; subject: string | null; tokens: Record<string, unknown> };
export type SimulationStep = { event: string; prior_stage: string; stage: string; duplicate: boolean; messages: SimulationMessage[] };
export type SimulationResult = { simulation_id: string; shadow: boolean; timeline: SimulationStep[]; duplicate_protection: boolean; orphans: number; messages: number };
export function fillLifecycleCopy(copy: string | null, tokens: Record<string, unknown>): string {
 return (copy ?? '').replace(/\{(\w+)\}/g, (match, key) => tokens[key] == null ? match : String(tokens[key])).replace(/<[^>]*>/g, '').trim();
}
