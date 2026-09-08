-- Phase 3 (part 1 of 2): a visit that could not be worked through no fault of
-- the pro gets its own terminal state. Added alone because a new enum value
-- cannot be referenced in the transaction that creates it.
ALTER TYPE public.visit_status ADD VALUE IF NOT EXISTS 'blocked';