-- Knowledge base (single-row, admin-editable later)
CREATE TABLE public.chatbot_knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.chatbot_knowledge ENABLE ROW LEVEL SECURITY;

-- Public read so the chat edge function (and future admin UI) can fetch via anon
CREATE POLICY "Knowledge readable by all"
  ON public.chatbot_knowledge FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert knowledge"
  ON public.chatbot_knowledge FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update knowledge"
  ON public.chatbot_knowledge FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Callback request capture
CREATE TABLE public.chatbot_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  phone text NOT NULL,
  question text,
  source_page text,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chatbot_leads ENABLE ROW LEVEL SECURITY;

-- Anyone (anon or signed-in) can submit a callback request
CREATE POLICY "Anyone can submit callback"
  ON public.chatbot_leads FOR INSERT
  WITH CHECK (true);

-- Only admins can read
CREATE POLICY "Admins can read callbacks"
  ON public.chatbot_leads FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Seed empty knowledge row
INSERT INTO public.chatbot_knowledge (content)
VALUES ('Tidy Home Concierge LLC is a Miami-based subscription home service covering house cleaning, lawn care, and car detailing. Phone: (786) 829-1141. Service areas: 33183, 33186, 33156. (Replace this with the full business deck via /admin/chatbot-knowledge.)');