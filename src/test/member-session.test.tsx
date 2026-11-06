import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const auth = vi.hoisted(() => ({ getSession: vi.fn(), onAuthStateChange: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth } }));
import { useMemberSession } from '@/hooks/useMemberSession';
describe('Returning member session', () => {
  let event: (name: string, session: unknown) => void;
  beforeEach(() => {
    auth.onAuthStateChange.mockImplementation(callback => { event = callback; return { data: { subscription: { unsubscribe: vi.fn() } } }; });
  });
  it('recognizes an existing signed-in session', async () => {
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'member' } } } });
    const { result } = renderHook(useMemberSession);
    await waitFor(() => expect(result.current).toBe(true));
  });
  it('recognizes signed-out visitors', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null } });
    const { result } = renderHook(useMemberSession);
    await waitFor(() => expect(result.current).toBe(false));
  });
  it('never overwrites a new sign-in with an older signed-out read', async () => {
    let resolve: (value: unknown) => void = () => {};
    auth.getSession.mockReturnValue(new Promise(r => { resolve = r; }));
    const { result } = renderHook(useMemberSession);
    act(() => event('SIGNED_IN', { user: { id: 'member' } }));
    await act(async () => resolve({ data: { session: null } }));
    expect(result.current).toBe(true);
    act(() => event('SIGNED_OUT', null));
    expect(result.current).toBe(false);
  });
});