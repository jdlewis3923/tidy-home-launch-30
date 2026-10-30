import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {afterEach,describe,it,expect,vi} from 'vitest';
import SigningDayPanel from '@/components/admin/SigningDayPanel';
const mocks=vi.hoisted(()=>({pipeline:vi.fn(),rpc:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:mocks.rpc,from:()=>({select:()=>({eq:()=>({single:mocks.pipeline})})})}}));
vi.mock('@/contexts/LanguageContext',()=>({useLanguage:()=>({language:'en'})}));
vi.mock('@/components/admin/OnboardingPackControls',()=>({default:()=>null}));
vi.mock('@/components/admin/pipeline/ProofPanel',()=>({default:({onChange}:{onChange:()=>void})=><button onClick={onChange}>Review complete</button>}));
vi.mock('react-router-dom',()=>({Link:({children}:{children:React.ReactNode})=><span>{children}</span>}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
describe('Signing day approval readback',()=>{
 it('reads the guarded pipeline approval again after equipment review',async()=>{
  mocks.rpc.mockResolvedValue({data:{equipment:false},error:null});
  mocks.pipeline.mockResolvedValue({data:{proof_approved_at:null},error:null});
  render(<SigningDayPanel applicantId="susan"/>);
  fireEvent.click(screen.getByRole('button',{name:'Approve equipment'}));
  await screen.findByRole('button',{name:'Review complete'});
  expect(mocks.pipeline).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button',{name:'Review complete'}));
  await waitFor(()=>expect(mocks.pipeline).toHaveBeenCalledTimes(2));
 });
});