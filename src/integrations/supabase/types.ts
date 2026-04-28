export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      addon_attach_tokens: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          token: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          expires_at: string
          token: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          token?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      addon_attaches: {
        Row: {
          addon_key: string
          addon_name: string
          addon_price_cents: number
          attached_at: string
          completed_at: string | null
          id: string
          jobber_job_id: string | null
          jobber_line_item_id: string | null
          jobber_visit_id: string | null
          removed_at: string | null
          service_type: string | null
          status: string
          stripe_addon_price_id: string
          stripe_invoice_item_id: string | null
          user_id: string
        }
        Insert: {
          addon_key: string
          addon_name: string
          addon_price_cents: number
          attached_at?: string
          completed_at?: string | null
          id?: string
          jobber_job_id?: string | null
          jobber_line_item_id?: string | null
          jobber_visit_id?: string | null
          removed_at?: string | null
          service_type?: string | null
          status?: string
          stripe_addon_price_id: string
          stripe_invoice_item_id?: string | null
          user_id: string
        }
        Update: {
          addon_key?: string
          addon_name?: string
          addon_price_cents?: number
          attached_at?: string
          completed_at?: string | null
          id?: string
          jobber_job_id?: string | null
          jobber_line_item_id?: string | null
          jobber_visit_id?: string | null
          removed_at?: string | null
          service_type?: string | null
          status?: string
          stripe_addon_price_id?: string
          stripe_invoice_item_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      addon_catalog: {
        Row: {
          addon_key: string
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          lucide_icon: string | null
          price_cents: number
          services: string[]
          sort_order: number
          stripe_price_id: string | null
          stripe_product_id: string | null
          updated_at: string
        }
        Insert: {
          addon_key: string
          created_at?: string
          display_name: string
          id?: string
          is_active?: boolean
          lucide_icon?: string | null
          price_cents: number
          services?: string[]
          sort_order?: number
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          updated_at?: string
        }
        Update: {
          addon_key?: string
          created_at?: string
          display_name?: string
          id?: string
          is_active?: boolean
          lucide_icon?: string | null
          price_cents?: number
          services?: string[]
          sort_order?: number
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      addon_sms_log: {
        Row: {
          context: Json
          created_at: string
          id: string
          jobber_visit_id: string | null
          sent_at: string | null
          suppressed_at: string | null
          suppression_reason: string | null
          twilio_content_sid: string | null
          twilio_message_id: string | null
          user_id: string | null
          variant: string | null
        }
        Insert: {
          context?: Json
          created_at?: string
          id?: string
          jobber_visit_id?: string | null
          sent_at?: string | null
          suppressed_at?: string | null
          suppression_reason?: string | null
          twilio_content_sid?: string | null
          twilio_message_id?: string | null
          user_id?: string | null
          variant?: string | null
        }
        Update: {
          context?: Json
          created_at?: string
          id?: string
          jobber_visit_id?: string | null
          sent_at?: string | null
          suppressed_at?: string | null
          suppression_reason?: string | null
          twilio_content_sid?: string | null
          twilio_message_id?: string | null
          user_id?: string | null
          variant?: string | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      chatbot_knowledge: {
        Row: {
          content: string
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content: string
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content?: string
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      chatbot_leads: {
        Row: {
          created_at: string
          id: string
          name: string | null
          phone: string
          question: string | null
          source_page: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string | null
          phone: string
          question?: string | null
          source_page?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string | null
          phone?: string
          question?: string | null
          source_page?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      cron_runs: {
        Row: {
          context: Json
          id: string
          job_name: string
          request_id: number | null
          scheduled_at: string
        }
        Insert: {
          context?: Json
          id?: string
          job_name: string
          request_id?: number | null
          scheduled_at?: string
        }
        Update: {
          context?: Json
          id?: string
          job_name?: string
          request_id?: number | null
          scheduled_at?: string
        }
        Relationships: []
      }
      integration_logs: {
        Row: {
          created_at: string
          error_message: string | null
          event: string
          id: string
          latency_ms: number | null
          payload_hash: string | null
          source: string
          status: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event: string
          id?: string
          latency_ms?: number | null
          payload_hash?: string | null
          source: string
          status: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event?: string
          id?: string
          latency_ms?: number | null
          payload_hash?: string | null
          source?: string
          status?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          invoice_date: string
          paid_at: string | null
          receipt_url: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          stripe_invoice_id: string | null
          subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          id?: string
          invoice_date?: string
          paid_at?: string | null
          receipt_url?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          stripe_invoice_id?: string | null
          subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          invoice_date?: string
          paid_at?: string | null
          receipt_url?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          stripe_invoice_id?: string | null
          subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_action_log: {
        Row: {
          action_key: string | null
          action_label: string
          action_type: Database["public"]["Enums"]["kpi_action_type"]
          alert_id: string | null
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          kpi_code: string
          result: Json
          status: string
          triggered_by: string | null
        }
        Insert: {
          action_key?: string | null
          action_label: string
          action_type: Database["public"]["Enums"]["kpi_action_type"]
          alert_id?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          kpi_code: string
          result?: Json
          status?: string
          triggered_by?: string | null
        }
        Update: {
          action_key?: string | null
          action_label?: string
          action_type?: Database["public"]["Enums"]["kpi_action_type"]
          alert_id?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          kpi_code?: string
          result?: Json
          status?: string
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kpi_action_log_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "kpi_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_action_log_kpi_code_fkey"
            columns: ["kpi_code"]
            isOneToOne: false
            referencedRelation: "kpi_definitions"
            referencedColumns: ["code"]
          },
        ]
      }
      kpi_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          calendar_event_id: string | null
          channels_notified: string[]
          context: Json
          created_at: string
          dedup_hash: string | null
          estimated_impact_cents: number | null
          hours_to_deadline: number | null
          id: string
          kpi_code: string
          message: string
          prediction_tier: string | null
          resolved_at: string | null
          severity: Database["public"]["Enums"]["kpi_alert_severity"]
          suppressed: boolean
          suppression_reason: string | null
          top_actions: Json
          value: number | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          calendar_event_id?: string | null
          channels_notified?: string[]
          context?: Json
          created_at?: string
          dedup_hash?: string | null
          estimated_impact_cents?: number | null
          hours_to_deadline?: number | null
          id?: string
          kpi_code: string
          message: string
          prediction_tier?: string | null
          resolved_at?: string | null
          severity: Database["public"]["Enums"]["kpi_alert_severity"]
          suppressed?: boolean
          suppression_reason?: string | null
          top_actions?: Json
          value?: number | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          calendar_event_id?: string | null
          channels_notified?: string[]
          context?: Json
          created_at?: string
          dedup_hash?: string | null
          estimated_impact_cents?: number | null
          hours_to_deadline?: number | null
          id?: string
          kpi_code?: string
          message?: string
          prediction_tier?: string | null
          resolved_at?: string | null
          severity?: Database["public"]["Enums"]["kpi_alert_severity"]
          suppressed?: boolean
          suppression_reason?: string | null
          top_actions?: Json
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "kpi_alerts_kpi_code_fkey"
            columns: ["kpi_code"]
            isOneToOne: false
            referencedRelation: "kpi_definitions"
            referencedColumns: ["code"]
          },
        ]
      }
      kpi_definitions: {
        Row: {
          category: Database["public"]["Enums"]["kpi_category"]
          code: string
          created_at: string
          critical_label: string | null
          critical_threshold: number | null
          direction: string
          display_order: number
          enabled: boolean
          frequency: Database["public"]["Enums"]["kpi_frequency"]
          id: string
          name: string
          playbook: Json
          source: string | null
          target_label: string | null
          target_value: number | null
          unit: string | null
          updated_at: string
          warn_label: string | null
          warn_threshold: number | null
        }
        Insert: {
          category: Database["public"]["Enums"]["kpi_category"]
          code: string
          created_at?: string
          critical_label?: string | null
          critical_threshold?: number | null
          direction?: string
          display_order?: number
          enabled?: boolean
          frequency: Database["public"]["Enums"]["kpi_frequency"]
          id?: string
          name: string
          playbook?: Json
          source?: string | null
          target_label?: string | null
          target_value?: number | null
          unit?: string | null
          updated_at?: string
          warn_label?: string | null
          warn_threshold?: number | null
        }
        Update: {
          category?: Database["public"]["Enums"]["kpi_category"]
          code?: string
          created_at?: string
          critical_label?: string | null
          critical_threshold?: number | null
          direction?: string
          display_order?: number
          enabled?: boolean
          frequency?: Database["public"]["Enums"]["kpi_frequency"]
          id?: string
          name?: string
          playbook?: Json
          source?: string | null
          target_label?: string | null
          target_value?: number | null
          unit?: string | null
          updated_at?: string
          warn_label?: string | null
          warn_threshold?: number | null
        }
        Relationships: []
      }
      kpi_noise_rules: {
        Row: {
          applies_to_kpis: string[]
          config: Json
          created_at: string
          description: string
          enabled: boolean
          id: string
          rule_key: string
          updated_at: string
        }
        Insert: {
          applies_to_kpis?: string[]
          config?: Json
          created_at?: string
          description: string
          enabled?: boolean
          id?: string
          rule_key: string
          updated_at?: string
        }
        Update: {
          applies_to_kpis?: string[]
          config?: Json
          created_at?: string
          description?: string
          enabled?: boolean
          id?: string
          rule_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      kpi_playbook_steps: {
        Row: {
          action_key: string | null
          action_payload: Json
          action_type: string
          created_at: string
          external_url: string | null
          how_steps: Json
          id: string
          kpi_code: string
          label: string
          predicted_impact_cents: number | null
          predicted_impact_text: string | null
          step_index: number
          updated_at: string
          why_text: string
        }
        Insert: {
          action_key?: string | null
          action_payload?: Json
          action_type?: string
          created_at?: string
          external_url?: string | null
          how_steps?: Json
          id?: string
          kpi_code: string
          label: string
          predicted_impact_cents?: number | null
          predicted_impact_text?: string | null
          step_index: number
          updated_at?: string
          why_text?: string
        }
        Update: {
          action_key?: string | null
          action_payload?: Json
          action_type?: string
          created_at?: string
          external_url?: string | null
          how_steps?: Json
          id?: string
          kpi_code?: string
          label?: string
          predicted_impact_cents?: number | null
          predicted_impact_text?: string | null
          step_index?: number
          updated_at?: string
          why_text?: string
        }
        Relationships: []
      }
      kpi_snapshots: {
        Row: {
          computed_at: string
          context: Json
          id: string
          kpi_code: string
          status: Database["public"]["Enums"]["kpi_status"]
          value: number | null
          value_text: string | null
        }
        Insert: {
          computed_at?: string
          context?: Json
          id?: string
          kpi_code: string
          status?: Database["public"]["Enums"]["kpi_status"]
          value?: number | null
          value_text?: string | null
        }
        Update: {
          computed_at?: string
          context?: Json
          id?: string
          kpi_code?: string
          status?: Database["public"]["Enums"]["kpi_status"]
          value?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kpi_snapshots_kpi_code_fkey"
            columns: ["kpi_code"]
            isOneToOne: false
            referencedRelation: "kpi_definitions"
            referencedColumns: ["code"]
          },
        ]
      }
      kpi_step_completions: {
        Row: {
          completed_at: string
          id: string
          kpi_code: string
          notes: string | null
          step_index: number
          user_id: string
        }
        Insert: {
          completed_at?: string
          id?: string
          kpi_code: string
          notes?: string | null
          step_index: number
          user_id: string
        }
        Update: {
          completed_at?: string
          id?: string
          kpi_code?: string
          notes?: string | null
          step_index?: number
          user_id?: string
        }
        Relationships: []
      }
      kpi_targets: {
        Row: {
          created_at: string
          critical_threshold: number | null
          effective_from: string
          effective_to: string | null
          id: string
          kpi_code: string
          notes: string | null
          period_label: string
          target_value: number | null
          warn_threshold: number | null
        }
        Insert: {
          created_at?: string
          critical_threshold?: number | null
          effective_from: string
          effective_to?: string | null
          id?: string
          kpi_code: string
          notes?: string | null
          period_label: string
          target_value?: number | null
          warn_threshold?: number | null
        }
        Update: {
          created_at?: string
          critical_threshold?: number | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          kpi_code?: string
          notes?: string | null
          period_label?: string
          target_value?: number | null
          warn_threshold?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "kpi_targets_kpi_code_fkey"
            columns: ["kpi_code"]
            isOneToOne: false
            referencedRelation: "kpi_definitions"
            referencedColumns: ["code"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          calendar_enabled: boolean
          created_at: string
          id: string
          notes_enabled: boolean
          per_kpi_sensitivity: Json
          pwa_push_enabled: boolean
          quiet_hours_end: number
          quiet_hours_start: number
          snoozed_until: string | null
          updated_at: string
          user_id: string
          vip_kpi_codes: string[]
        }
        Insert: {
          calendar_enabled?: boolean
          created_at?: string
          id?: string
          notes_enabled?: boolean
          per_kpi_sensitivity?: Json
          pwa_push_enabled?: boolean
          quiet_hours_end?: number
          quiet_hours_start?: number
          snoozed_until?: string | null
          updated_at?: string
          user_id: string
          vip_kpi_codes?: string[]
        }
        Update: {
          calendar_enabled?: boolean
          created_at?: string
          id?: string
          notes_enabled?: boolean
          per_kpi_sensitivity?: Json
          pwa_push_enabled?: boolean
          quiet_hours_end?: number
          quiet_hours_start?: number
          snoozed_until?: string | null
          updated_at?: string
          user_id?: string
          vip_kpi_codes?: string[]
        }
        Relationships: []
      }
      profiles: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          created_at: string
          first_name: string | null
          gate_code: string | null
          id: string
          language: string
          last_addon_attached_at: string | null
          last_name: string | null
          last_pv4_review_request_at: string | null
          parking_notes: string | null
          pets: string | null
          phone: string | null
          preferred_day: string | null
          preferred_time: string | null
          referral_code: string | null
          service_tier: string | null
          signup_source: string | null
          sms_opt_in: boolean
          sms_opt_out: boolean
          sms_preference: string
          special_instructions: string | null
          updated_at: string
          user_id: string
          zip: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          created_at?: string
          first_name?: string | null
          gate_code?: string | null
          id?: string
          language?: string
          last_addon_attached_at?: string | null
          last_name?: string | null
          last_pv4_review_request_at?: string | null
          parking_notes?: string | null
          pets?: string | null
          phone?: string | null
          preferred_day?: string | null
          preferred_time?: string | null
          referral_code?: string | null
          service_tier?: string | null
          signup_source?: string | null
          sms_opt_in?: boolean
          sms_opt_out?: boolean
          sms_preference?: string
          special_instructions?: string | null
          updated_at?: string
          user_id: string
          zip?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          created_at?: string
          first_name?: string | null
          gate_code?: string | null
          id?: string
          language?: string
          last_addon_attached_at?: string | null
          last_name?: string | null
          last_pv4_review_request_at?: string | null
          parking_notes?: string | null
          pets?: string | null
          phone?: string | null
          preferred_day?: string | null
          preferred_time?: string | null
          referral_code?: string | null
          service_tier?: string | null
          signup_source?: string | null
          sms_opt_in?: boolean
          sms_opt_out?: boolean
          sms_preference?: string
          special_instructions?: string | null
          updated_at?: string
          user_id?: string
          zip?: string | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth_key: string
          created_at: string
          endpoint: string
          id: string
          last_used_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth_key: string
          created_at?: string
          endpoint: string
          id?: string
          last_used_at?: string | null
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth_key?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_used_at?: string | null
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          converted_at: string | null
          created_at: string
          credit_cents: number
          id: string
          referee_email: string | null
          referrer_user_id: string
          status: string
          stripe_credit_id: string | null
        }
        Insert: {
          converted_at?: string | null
          created_at?: string
          credit_cents?: number
          id?: string
          referee_email?: string | null
          referrer_user_id: string
          status?: string
          stripe_credit_id?: string | null
        }
        Update: {
          converted_at?: string | null
          created_at?: string
          credit_cents?: number
          id?: string
          referee_email?: string | null
          referrer_user_id?: string
          status?: string
          stripe_credit_id?: string | null
        }
        Relationships: []
      }
      sms_log: {
        Row: {
          context: Json
          created_at: string
          id: string
          sent_at: string
          sms_type: string
          suppressed: boolean
          suppression_reason: string | null
          twilio_message_id: string | null
          user_id: string | null
        }
        Insert: {
          context?: Json
          created_at?: string
          id?: string
          sent_at?: string
          sms_type: string
          suppressed?: boolean
          suppression_reason?: string | null
          twilio_message_id?: string | null
          user_id?: string | null
        }
        Update: {
          context?: Json
          created_at?: string
          id?: string
          sent_at?: string
          sms_type?: string
          suppressed?: boolean
          suppression_reason?: string | null
          twilio_message_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      social_posts: {
        Row: {
          caption: string
          created_at: string
          day_number: number
          error_message: string | null
          fb_post_id: string | null
          id: string
          ig_post_id: string | null
          image_path: string
          image_paths: string[]
          posted_at: string | null
          scheduled_at: string
          status: Database["public"]["Enums"]["social_post_status"]
          updated_at: string
        }
        Insert: {
          caption?: string
          created_at?: string
          day_number: number
          error_message?: string | null
          fb_post_id?: string | null
          id?: string
          ig_post_id?: string | null
          image_path: string
          image_paths?: string[]
          posted_at?: string | null
          scheduled_at: string
          status?: Database["public"]["Enums"]["social_post_status"]
          updated_at?: string
        }
        Update: {
          caption?: string
          created_at?: string
          day_number?: number
          error_message?: string | null
          fb_post_id?: string | null
          id?: string
          ig_post_id?: string | null
          image_path?: string
          image_paths?: string[]
          posted_at?: string | null
          scheduled_at?: string
          status?: Database["public"]["Enums"]["social_post_status"]
          updated_at?: string
        }
        Relationships: []
      }
      stripe_catalog: {
        Row: {
          active: boolean
          addon_name: string | null
          bundle_discount_pct: number
          created_at: string
          description: string | null
          frequency:
            | Database["public"]["Enums"]["subscription_frequency"]
            | null
          id: string
          is_addon: boolean
          price_cents: number
          service_type: Database["public"]["Enums"]["service_type"] | null
          sort_order: number
          stripe_price_id: string
          stripe_product_id: string | null
        }
        Insert: {
          active?: boolean
          addon_name?: string | null
          bundle_discount_pct?: number
          created_at?: string
          description?: string | null
          frequency?:
            | Database["public"]["Enums"]["subscription_frequency"]
            | null
          id?: string
          is_addon?: boolean
          price_cents: number
          service_type?: Database["public"]["Enums"]["service_type"] | null
          sort_order?: number
          stripe_price_id: string
          stripe_product_id?: string | null
        }
        Update: {
          active?: boolean
          addon_name?: string | null
          bundle_discount_pct?: number
          created_at?: string
          description?: string | null
          frequency?:
            | Database["public"]["Enums"]["subscription_frequency"]
            | null
          id?: string
          is_addon?: boolean
          price_cents?: number
          service_type?: Database["public"]["Enums"]["service_type"] | null
          sort_order?: number
          stripe_price_id?: string
          stripe_product_id?: string | null
        }
        Relationships: []
      }
      stripe_events: {
        Row: {
          duration_ms: number | null
          error_message: string | null
          event_type: string
          id: string
          livemode: boolean
          payload_summary: Json
          processed_at: string | null
          received_at: string
          status: string
          stripe_event_id: string
        }
        Insert: {
          duration_ms?: number | null
          error_message?: string | null
          event_type: string
          id?: string
          livemode?: boolean
          payload_summary?: Json
          processed_at?: string | null
          received_at?: string
          status?: string
          stripe_event_id: string
        }
        Update: {
          duration_ms?: number | null
          error_message?: string | null
          event_type?: string
          id?: string
          livemode?: boolean
          payload_summary?: Json
          processed_at?: string | null
          received_at?: string
          status?: string
          stripe_event_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          bundle_discount_pct: number
          cancel_at_period_end: boolean
          canceled_at: string | null
          card_brand: string | null
          card_last4: string | null
          created_at: string
          frequency: Database["public"]["Enums"]["subscription_frequency"]
          id: string
          jobber_client_id: string | null
          jobber_job_ids: Json
          latest_invoice_attempt_count: number | null
          monthly_total_cents: number
          next_billing_date: string | null
          pause_collection: string | null
          services: Database["public"]["Enums"]["service_type"][]
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bundle_discount_pct?: number
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          card_brand?: string | null
          card_last4?: string | null
          created_at?: string
          frequency?: Database["public"]["Enums"]["subscription_frequency"]
          id?: string
          jobber_client_id?: string | null
          jobber_job_ids?: Json
          latest_invoice_attempt_count?: number | null
          monthly_total_cents?: number
          next_billing_date?: string | null
          pause_collection?: string | null
          services?: Database["public"]["Enums"]["service_type"][]
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bundle_discount_pct?: number
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          card_brand?: string | null
          card_last4?: string | null
          created_at?: string
          frequency?: Database["public"]["Enums"]["subscription_frequency"]
          id?: string
          jobber_client_id?: string | null
          jobber_job_ids?: Json
          latest_invoice_attempt_count?: number | null
          monthly_total_cents?: number
          next_billing_date?: string | null
          pause_collection?: string | null
          services?: Database["public"]["Enums"]["service_type"][]
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      support_conversations: {
        Row: {
          ai_handled_count: number
          channel: Database["public"]["Enums"]["support_channel"]
          created_at: string
          customer_email: string | null
          customer_name: string | null
          customer_phone_e164: string | null
          id: string
          last_message_at: string
          status: Database["public"]["Enums"]["support_status"]
          updated_at: string
          visitor_id: string | null
        }
        Insert: {
          ai_handled_count?: number
          channel: Database["public"]["Enums"]["support_channel"]
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone_e164?: string | null
          id?: string
          last_message_at?: string
          status?: Database["public"]["Enums"]["support_status"]
          updated_at?: string
          visitor_id?: string | null
        }
        Update: {
          ai_handled_count?: number
          channel?: Database["public"]["Enums"]["support_channel"]
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone_e164?: string | null
          id?: string
          last_message_at?: string
          status?: Database["public"]["Enums"]["support_status"]
          updated_at?: string
          visitor_id?: string | null
        }
        Relationships: []
      }
      support_messages: {
        Row: {
          ai_confidence: number | null
          body: string
          conversation_id: string
          created_at: string
          direction: Database["public"]["Enums"]["support_direction"]
          id: string
          sender_type: Database["public"]["Enums"]["support_sender_type"]
          sender_user_id: string | null
          twilio_sid: string | null
        }
        Insert: {
          ai_confidence?: number | null
          body: string
          conversation_id: string
          created_at?: string
          direction: Database["public"]["Enums"]["support_direction"]
          id?: string
          sender_type: Database["public"]["Enums"]["support_sender_type"]
          sender_user_id?: string | null
          twilio_sid?: string | null
        }
        Update: {
          ai_confidence?: number | null
          body?: string
          conversation_id?: string
          created_at?: string
          direction?: Database["public"]["Enums"]["support_direction"]
          id?: string
          sender_type?: Database["public"]["Enums"]["support_sender_type"]
          sender_user_id?: string | null
          twilio_sid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "support_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      support_requests: {
        Row: {
          created_at: string
          id: string
          payload: Json
          status: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          payload?: Json
          status?: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json
          status?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      visit_sms_state: {
        Row: {
          created_at: string
          eta_sms_sent: boolean
          eta_sms_sent_at: string | null
          id: string
          jobber_visit_id: string
          morning_sms_sent: boolean
          morning_sms_sent_at: string | null
          morning_sms_suppressed: boolean
          morning_sms_suppression_reason: string | null
          updated_at: string
          user_id: string | null
          visit_date: string | null
        }
        Insert: {
          created_at?: string
          eta_sms_sent?: boolean
          eta_sms_sent_at?: string | null
          id?: string
          jobber_visit_id: string
          morning_sms_sent?: boolean
          morning_sms_sent_at?: string | null
          morning_sms_suppressed?: boolean
          morning_sms_suppression_reason?: string | null
          updated_at?: string
          user_id?: string | null
          visit_date?: string | null
        }
        Update: {
          created_at?: string
          eta_sms_sent?: boolean
          eta_sms_sent_at?: string | null
          id?: string
          jobber_visit_id?: string
          morning_sms_sent?: boolean
          morning_sms_sent_at?: string | null
          morning_sms_suppressed?: boolean
          morning_sms_suppression_reason?: string | null
          updated_at?: string
          user_id?: string | null
          visit_date?: string | null
        }
        Relationships: []
      }
      visits: {
        Row: {
          created_at: string
          crew_name: string | null
          id: string
          jobber_job_id: string | null
          jobber_visit_id: string | null
          notes: string | null
          service: Database["public"]["Enums"]["service_type"]
          status: Database["public"]["Enums"]["visit_status"]
          subscription_id: string | null
          time_window: string | null
          updated_at: string
          user_id: string
          visit_date: string
        }
        Insert: {
          created_at?: string
          crew_name?: string | null
          id?: string
          jobber_job_id?: string | null
          jobber_visit_id?: string | null
          notes?: string | null
          service: Database["public"]["Enums"]["service_type"]
          status?: Database["public"]["Enums"]["visit_status"]
          subscription_id?: string | null
          time_window?: string | null
          updated_at?: string
          user_id: string
          visit_date: string
        }
        Update: {
          created_at?: string
          crew_name?: string | null
          id?: string
          jobber_job_id?: string | null
          jobber_visit_id?: string | null
          notes?: string | null
          service?: Database["public"]["Enums"]["service_type"]
          status?: Database["public"]["Enums"]["visit_status"]
          subscription_id?: string | null
          time_window?: string | null
          updated_at?: string
          user_id?: string
          visit_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "visits_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_get_jobber_refresh_token: { Args: never; Returns: string }
      admin_get_meta_secret: { Args: { _name: string }; Returns: string }
      admin_get_scheduler_paused: { Args: never; Returns: boolean }
      admin_get_service_role_key: { Args: never; Returns: string }
      admin_get_vapid_public: { Args: never; Returns: string }
      admin_set_jobber_refresh_token: {
        Args: { _token: string }
        Returns: undefined
      }
      admin_set_meta_secret: {
        Args: { _name: string; _value: string }
        Returns: undefined
      }
      admin_set_scheduler_paused: {
        Args: { _paused: boolean }
        Returns: boolean
      }
      admin_set_service_role_key: { Args: { _key: string }; Returns: undefined }
      admin_set_vapid_secret: {
        Args: { _name: string; _value: string }
        Returns: undefined
      }
      current_user_admin: { Args: never; Returns: boolean }
      generate_referral_code: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_scheduler_paused: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "customer" | "crew" | "admin"
      invoice_status: "paid" | "pending" | "failed" | "refunded"
      kpi_action_type: "AUTO" | "MANUAL" | "INFO"
      kpi_alert_severity: "warn" | "critical"
      kpi_category:
        | "acquisition"
        | "conversion"
        | "operations"
        | "customer_health"
        | "reviews"
        | "financial"
        | "system_health"
      kpi_frequency:
        | "realtime"
        | "hourly"
        | "daily"
        | "weekly"
        | "biweekly"
        | "monthly"
      kpi_status: "green" | "warn" | "critical" | "unknown"
      service_type: "cleaning" | "lawn" | "detailing"
      social_post_status:
        | "scheduled"
        | "ready"
        | "posting"
        | "posted"
        | "failed"
        | "paused"
      subscription_frequency: "weekly" | "biweekly" | "monthly"
      subscription_status: "active" | "paused" | "canceled"
      support_channel: "sms" | "web"
      support_direction: "inbound" | "outbound" | "auto_reply"
      support_sender_type: "customer" | "ai" | "admin"
      support_status: "open" | "resolved" | "escalated"
      visit_status:
        | "scheduled"
        | "on_the_way"
        | "in_progress"
        | "complete"
        | "canceled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["customer", "crew", "admin"],
      invoice_status: ["paid", "pending", "failed", "refunded"],
      kpi_action_type: ["AUTO", "MANUAL", "INFO"],
      kpi_alert_severity: ["warn", "critical"],
      kpi_category: [
        "acquisition",
        "conversion",
        "operations",
        "customer_health",
        "reviews",
        "financial",
        "system_health",
      ],
      kpi_frequency: [
        "realtime",
        "hourly",
        "daily",
        "weekly",
        "biweekly",
        "monthly",
      ],
      kpi_status: ["green", "warn", "critical", "unknown"],
      service_type: ["cleaning", "lawn", "detailing"],
      social_post_status: [
        "scheduled",
        "ready",
        "posting",
        "posted",
        "failed",
        "paused",
      ],
      subscription_frequency: ["weekly", "biweekly", "monthly"],
      subscription_status: ["active", "paused", "canceled"],
      support_channel: ["sms", "web"],
      support_direction: ["inbound", "outbound", "auto_reply"],
      support_sender_type: ["customer", "ai", "admin"],
      support_status: ["open", "resolved", "escalated"],
      visit_status: [
        "scheduled",
        "on_the_way",
        "in_progress",
        "complete",
        "canceled",
      ],
    },
  },
} as const
