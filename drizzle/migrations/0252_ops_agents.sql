-- lovable-cron-fallback-reviewed: late/no-show watcher must text within 15 minutes of window start; one consolidated tick serves all 13 agents
CREATE TABLE public.ops_agents (
  key text PRIMARY KEY,
  name text NOT NULL,
  cadence text NOT NULL,
  sort int NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT false,
  last_run_at timestamptz,
  last_status text,
  last_summary text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.ops_agents TO authenticated;
GRANT ALL ON public.ops_agents TO service_role;
ALTER TABLE public.ops_agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read agents" ON public.ops_agents FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "admin toggle agents" ON public.ops_agents FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

CREATE TABLE public.ops_agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_key text NOT NULL REFERENCES public.ops_agents(key),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  is_test boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'running',
  checked int NOT NULL DEFAULT 0,
  exceptions int NOT NULL DEFAULT 0,
  log jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text
);
CREATE INDEX ops_agent_runs_agent_idx ON public.ops_agent_runs(agent_key, started_at DESC);
GRANT SELECT ON public.ops_agent_runs TO authenticated;
GRANT ALL ON public.ops_agent_runs TO service_role;
ALTER TABLE public.ops_agent_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read runs" ON public.ops_agent_runs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role));

CREATE TABLE public.ops_agent_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_key text NOT NULL REFERENCES public.ops_agents(key),
  run_id uuid REFERENCES public.ops_agent_runs(id) ON DELETE CASCADE,
  severity text NOT NULL DEFAULT 'normal' CHECK (severity IN ('urgent','high','normal','info')),
  title text NOT NULL,
  detail text,
  action_label text,
  action_url text,
  dedupe_key text,
  is_test boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolution text
);
CREATE UNIQUE INDEX ops_agent_exceptions_open_dedupe ON public.ops_agent_exceptions(dedupe_key) WHERE resolved_at IS NULL AND dedupe_key IS NOT NULL;
GRANT SELECT, UPDATE ON public.ops_agent_exceptions TO authenticated;
GRANT ALL ON public.ops_agent_exceptions TO service_role;
ALTER TABLE public.ops_agent_exceptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read exc" ON public.ops_agent_exceptions FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "admin resolve exc" ON public.ops_agent_exceptions FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

INSERT INTO public.ops_agents(key,name,cadence,sort,enabled) VALUES
('pay_reconciler','Pay Reconciler','Thursday 6 PM',1,true),
('size_verifier','Size Verifier','Every new reservation · checked hourly',2,true),
('plan_corrector','On-the-Job Plan Corrector','When a Pro reports a different size · hourly',3,true),
('tomorrow_guard','Tomorrow Guard','Daily 6 PM',4,true),
('late_watcher','Late/No-Show Watcher','Every 15 min',5,true),
('quality_watcher','Quality Watcher','Hourly · Monday digest stats',6,true),
('billing_agent','Billing Agent','Hourly',7,true),
('pro_compliance','Pro Compliance','Daily 7 AM',8,true),
('capacity_hire','Capacity + Hire Trigger','Daily 7 AM',9,true),
('hiring_agent','Hiring Agent','Every 15 min',10,true),
('seal_first_visit','Seal + First-Visit','Daily 7 AM',11,true),
('system_health','System Health','Hourly',12,true),
('digests','Digests','9 AM + 9 PM',13,true);

SELECT cron.schedule('ops-agents-tick', '*/15 * * * *', $job$SELECT public.cron_http_post('ops-agents-tick', 'ops-agents', '{"mode":"tick"}'::jsonb);$job$);