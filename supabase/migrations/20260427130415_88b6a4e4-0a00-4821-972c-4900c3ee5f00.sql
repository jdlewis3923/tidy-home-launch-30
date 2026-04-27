-- Enums
CREATE TYPE public.support_channel AS ENUM ('sms', 'web');
CREATE TYPE public.support_status AS ENUM ('open', 'resolved', 'escalated');
CREATE TYPE public.support_direction AS ENUM ('inbound', 'outbound', 'auto_reply');
CREATE TYPE public.support_sender_type AS ENUM ('customer', 'ai', 'admin');

-- Conversations
CREATE TABLE public.support_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel public.support_channel NOT NULL,
  customer_phone_e164 text,
  customer_email text,
  customer_name text,
  visitor_id text,
  status public.support_status NOT NULL DEFAULT 'open',
  last_message_at timestamptz NOT NULL DEFAULT now(),
  ai_handled_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX support_conversations_phone_uniq
  ON public.support_conversations (customer_phone_e164)
  WHERE channel = 'sms' AND customer_phone_e164 IS NOT NULL;

CREATE UNIQUE INDEX support_conversations_visitor_uniq
  ON public.support_conversations (visitor_id)
  WHERE channel = 'web' AND visitor_id IS NOT NULL;

CREATE INDEX support_conversations_last_msg_idx
  ON public.support_conversations (last_message_at DESC);

CREATE INDEX support_conversations_status_idx
  ON public.support_conversations (status);

-- Messages
CREATE TABLE public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.support_conversations(id) ON DELETE CASCADE,
  direction public.support_direction NOT NULL,
  sender_type public.support_sender_type NOT NULL,
  sender_user_id uuid,
  body text NOT NULL,
  ai_confidence numeric,
  twilio_sid text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX support_messages_conv_idx
  ON public.support_messages (conversation_id, created_at);

CREATE INDEX support_messages_body_search_idx
  ON public.support_messages USING gin (to_tsvector('english', body));

-- Trigger to bump last_message_at on the conversation
CREATE OR REPLACE FUNCTION public.bump_conversation_last_message()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.support_conversations
    SET last_message_at = NEW.created_at,
        updated_at = now()
    WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_bump_conv_last_msg
AFTER INSERT ON public.support_messages
FOR EACH ROW EXECUTE FUNCTION public.bump_conversation_last_message();

-- updated_at on conversations
CREATE TRIGGER trg_support_conv_updated
BEFORE UPDATE ON public.support_conversations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.support_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "support_conv admin read"
  ON public.support_conversations FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "support_conv admin update"
  ON public.support_conversations FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "support_msg admin read"
  ON public.support_messages FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;
ALTER TABLE public.support_conversations REPLICA IDENTITY FULL;
ALTER TABLE public.support_messages REPLICA IDENTITY FULL;