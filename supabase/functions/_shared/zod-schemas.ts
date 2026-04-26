// Tidy — Shared Zod validators for edge function inputs.
//
// Centralized so request shapes stay aligned across:
//   - stripe-create-checkout
//   - stripe-webhook
//   - jobber-sync
//   - send-sms / send-email
//   - meta-capi-conversion

import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

// ---------- shared primitives ----------
export const ServiceTypeSchema = z.enum(['cleaning', 'lawn', 'detailing']);
export const FrequencySchema = z.enum(['monthly', 'biweekly', 'weekly']);
export const SizeTierSchema = z.enum(['standard', 'xl', 'custom']);
export const LangSchema = z.enum(['en', 'es']);

export const AttributionSchema = z
  .object({
    utm_source: z.string().max(500).optional(),
    utm_medium: z.string().max(500).optional(),
    utm_campaign: z.string().max(500).optional(),
    utm_content: z.string().max(500).optional(),
    utm_term: z.string().max(500).optional(),
    gclid: z.string().max(500).optional(),
  })
  .partial();

// ---------- checkout ----------
export const CheckoutInputSchema = z.object({
  promoCode: z.string().trim().min(1).max(64).optional(),
  config: z.object({
    services: z.array(ServiceTypeSchema).min(1),
    frequencies: z.record(ServiceTypeSchema, FrequencySchema),
    homeSize: SizeTierSchema.nullable().optional(),
    yardSize: SizeTierSchema.nullable().optional(),
    vehicleSize: SizeTierSchema.nullable().optional(),
    vehicleCount: z.number().int().min(1).max(20).default(1),
    addOns: z.array(z.string().max(64)).max(50).default([]),
    zip: z.string().max(10).optional(),
    preferred_day: z.string().max(20).optional(),
    preferred_time: z.string().max(20).optional(),
    lang: LangSchema.optional(),
  }),
  attribution: AttributionSchema.optional(),
});

export type CheckoutInput = z.infer<typeof CheckoutInputSchema>;

// ---------- generic webhook envelope (Stripe-style) ----------
export const WebhookEventSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  data: z.record(z.string(), z.unknown()),
  created: z.number().int().optional(),
  livemode: z.boolean().optional(),
});

export type WebhookEvent = z.infer<typeof WebhookEventSchema>;

// ---------- transactional SMS ----------
export const SmsTemplateSchema = z.object({
  template: z.string().min(1).max(64),
  to: z
    .string()
    .regex(/^\+?[1-9]\d{6,14}$/, 'Invalid E.164 phone number'),
  lang: LangSchema.default('en'),
  vars: z.record(z.string(), z.string()).default({}),
});

export type SmsTemplate = z.infer<typeof SmsTemplateSchema>;

// ---------- transactional email ----------
export const EmailTemplateSchema = z.object({
  template: z.string().min(1).max(64),
  to: z.string().email(),
  lang: LangSchema.default('en'),
  vars: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  reply_to: z.string().email().optional(),
});

export type EmailTemplate = z.infer<typeof EmailTemplateSchema>;
