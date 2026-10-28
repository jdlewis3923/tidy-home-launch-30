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
          completed_by: string | null
          contractor_pay_cents: number | null
          entitlement_id: string | null
          free_period: string | null
          id: string
          is_free: boolean
          jobber_job_id: string | null
          jobber_line_item_id: string | null
          jobber_visit_id: string | null
          removed_at: string | null
          service_type: string | null
          split_pay: boolean
          status: string
          stripe_addon_price_id: string
          stripe_invoice_item_id: string | null
          user_id: string
          visit_id: string | null
        }
        Insert: {
          addon_key: string
          addon_name: string
          addon_price_cents: number
          attached_at?: string
          completed_at?: string | null
          completed_by?: string | null
          contractor_pay_cents?: number | null
          entitlement_id?: string | null
          free_period?: string | null
          id?: string
          is_free?: boolean
          jobber_job_id?: string | null
          jobber_line_item_id?: string | null
          jobber_visit_id?: string | null
          removed_at?: string | null
          service_type?: string | null
          split_pay?: boolean
          status?: string
          stripe_addon_price_id: string
          stripe_invoice_item_id?: string | null
          user_id: string
          visit_id?: string | null
        }
        Update: {
          addon_key?: string
          addon_name?: string
          addon_price_cents?: number
          attached_at?: string
          completed_at?: string | null
          completed_by?: string | null
          contractor_pay_cents?: number | null
          entitlement_id?: string | null
          free_period?: string | null
          id?: string
          is_free?: boolean
          jobber_job_id?: string | null
          jobber_line_item_id?: string | null
          jobber_visit_id?: string | null
          removed_at?: string | null
          service_type?: string | null
          split_pay?: boolean
          status?: string
          stripe_addon_price_id?: string
          stripe_invoice_item_id?: string | null
          user_id?: string
          visit_id?: string | null
        }
        Relationships: []
      }
      addon_catalog: {
        Row: {
          addon_key: string
          contractor_pay_cents: number | null
          created_at: string
          display_name: string
          gift_eligible: boolean
          id: string
          is_active: boolean
          is_specialist: boolean
          lookup_key: string | null
          lucide_icon: string | null
          price_cents: number
          rate_card_version: number
          services: string[]
          sort_order: number
          stripe_price_id: string | null
          stripe_product_id: string | null
          updated_at: string
        }
        Insert: {
          addon_key: string
          contractor_pay_cents?: number | null
          created_at?: string
          display_name: string
          gift_eligible?: boolean
          id?: string
          is_active?: boolean
          is_specialist?: boolean
          lookup_key?: string | null
          lucide_icon?: string | null
          price_cents: number
          rate_card_version?: number
          services?: string[]
          sort_order?: number
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          updated_at?: string
        }
        Update: {
          addon_key?: string
          contractor_pay_cents?: number | null
          created_at?: string
          display_name?: string
          gift_eligible?: boolean
          id?: string
          is_active?: boolean
          is_specialist?: boolean
          lookup_key?: string | null
          lucide_icon?: string | null
          price_cents?: number
          rate_card_version?: number
          services?: string[]
          sort_order?: number
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      addon_entitlements: {
        Row: {
          addon_attach_id: string | null
          attached_visit_id: string | null
          chosen_addon: string | null
          chosen_at: string | null
          contractor_pay_cents: number | null
          expired_at: string | null
          grant_reason: string | null
          granted_at: string
          id: string
          member_id: string
          period: string | null
          redeemed_at: string | null
          reminded_at: string | null
          slot: number
          status: string
          subscription_id: string | null
          type: string
        }
        Insert: {
          addon_attach_id?: string | null
          attached_visit_id?: string | null
          chosen_addon?: string | null
          chosen_at?: string | null
          contractor_pay_cents?: number | null
          expired_at?: string | null
          grant_reason?: string | null
          granted_at?: string
          id?: string
          member_id: string
          period?: string | null
          redeemed_at?: string | null
          reminded_at?: string | null
          slot?: number
          status?: string
          subscription_id?: string | null
          type: string
        }
        Update: {
          addon_attach_id?: string | null
          attached_visit_id?: string | null
          chosen_addon?: string | null
          chosen_at?: string | null
          contractor_pay_cents?: number | null
          expired_at?: string | null
          grant_reason?: string | null
          granted_at?: string
          id?: string
          member_id?: string
          period?: string | null
          redeemed_at?: string | null
          reminded_at?: string | null
          slot?: number
          status?: string
          subscription_id?: string | null
          type?: string
        }
        Relationships: []
      }
      addon_requests: {
        Row: {
          addon_id: string | null
          addon_key: string | null
          addon_name: string
          amount_cents: number
          condition_note: string | null
          customer_id: string | null
          expires_at: string
          id: string
          job_id: string
          minutes_estimate: number
          photo_url: string | null
          pro_id: string
          pro_pay_cents: number | null
          pro_visit_id: string | null
          requested_at: string
          responded_at: string | null
          status: string
          stripe_invoice_item_id: string | null
          stripe_payment_intent_id: string | null
          token: string
        }
        Insert: {
          addon_id?: string | null
          addon_key?: string | null
          addon_name: string
          amount_cents?: number
          condition_note?: string | null
          customer_id?: string | null
          expires_at?: string
          id?: string
          job_id: string
          minutes_estimate?: number
          photo_url?: string | null
          pro_id: string
          pro_pay_cents?: number | null
          pro_visit_id?: string | null
          requested_at?: string
          responded_at?: string | null
          status?: string
          stripe_invoice_item_id?: string | null
          stripe_payment_intent_id?: string | null
          token?: string
        }
        Update: {
          addon_id?: string | null
          addon_key?: string | null
          addon_name?: string
          amount_cents?: number
          condition_note?: string | null
          customer_id?: string | null
          expires_at?: string
          id?: string
          job_id?: string
          minutes_estimate?: number
          photo_url?: string | null
          pro_id?: string
          pro_pay_cents?: number | null
          pro_visit_id?: string | null
          requested_at?: string
          responded_at?: string | null
          status?: string
          stripe_invoice_item_id?: string | null
          stripe_payment_intent_id?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "addon_requests_addon_id_fkey"
            columns: ["addon_id"]
            isOneToOne: false
            referencedRelation: "addon_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "addon_requests_pro_visit_id_fkey"
            columns: ["pro_visit_id"]
            isOneToOne: false
            referencedRelation: "pro_visits"
            referencedColumns: ["id"]
          },
        ]
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
      admin_alert_tier_log: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          new_night_ok: boolean | null
          new_tier: string | null
          old_night_ok: boolean | null
          old_tier: string | null
          rule_key: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_night_ok?: boolean | null
          new_tier?: string | null
          old_night_ok?: boolean | null
          old_tier?: string | null
          rule_key: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_night_ok?: boolean | null
          new_tier?: string | null
          old_night_ok?: boolean | null
          old_tier?: string | null
          rule_key?: string
        }
        Relationships: []
      }
      admin_alert_tiers: {
        Row: {
          label: string
          night_ok: boolean
          rule_key: string
          tier: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          label: string
          night_ok?: boolean
          rule_key: string
          tier: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          label?: string
          night_ok?: boolean
          rule_key?: string
          tier?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      admin_alerts: {
        Row: {
          action_label: string | null
          action_url: string | null
          alert_type: string
          body: string | null
          category: string | null
          context: Json
          created_at: string
          dedupe_key: string | null
          due_date: string | null
          id: string
          if_ignored: string | null
          level: string
          night_ok: boolean
          notified_at: string | null
          notify_result: string | null
          reminded_at: string | null
          resolved_at: string | null
          route_to: string
          snoozed_until: string | null
          tier: string | null
          title: string
          what: string | null
          why_today: string | null
        }
        Insert: {
          action_label?: string | null
          action_url?: string | null
          alert_type: string
          body?: string | null
          category?: string | null
          context?: Json
          created_at?: string
          dedupe_key?: string | null
          due_date?: string | null
          id?: string
          if_ignored?: string | null
          level?: string
          night_ok?: boolean
          notified_at?: string | null
          notify_result?: string | null
          reminded_at?: string | null
          resolved_at?: string | null
          route_to?: string
          snoozed_until?: string | null
          tier?: string | null
          title: string
          what?: string | null
          why_today?: string | null
        }
        Update: {
          action_label?: string | null
          action_url?: string | null
          alert_type?: string
          body?: string | null
          category?: string | null
          context?: Json
          created_at?: string
          dedupe_key?: string | null
          due_date?: string | null
          id?: string
          if_ignored?: string | null
          level?: string
          night_ok?: boolean
          notified_at?: string | null
          notify_result?: string | null
          reminded_at?: string | null
          resolved_at?: string | null
          route_to?: string
          snoozed_until?: string | null
          tier?: string | null
          title?: string
          what?: string | null
          why_today?: string | null
        }
        Relationships: []
      }
      admin_digest_runs: {
        Row: {
          body: Json | null
          edition: string
          email_result: string | null
          run_date: string
          sent_at: string
          sms_result: string | null
        }
        Insert: {
          body?: Json | null
          edition: string
          email_result?: string | null
          run_date: string
          sent_at?: string
          sms_result?: string | null
        }
        Update: {
          body?: Json | null
          edition?: string
          email_result?: string | null
          run_date?: string
          sent_at?: string
          sms_result?: string | null
        }
        Relationships: []
      }
      admin_workday_events: {
        Row: {
          action_label: string | null
          action_url: string | null
          actor_type: string
          actor_user_id: string | null
          applicant_id: string | null
          detail: string | null
          event_type: string
          id: string
          metadata: Json
          occurred_at: string
          status: string | null
          title: string
          waiting_on_admin: boolean
        }
        Insert: {
          action_label?: string | null
          action_url?: string | null
          actor_type?: string
          actor_user_id?: string | null
          applicant_id?: string | null
          detail?: string | null
          event_type: string
          id?: string
          metadata?: Json
          occurred_at?: string
          status?: string | null
          title: string
          waiting_on_admin?: boolean
        }
        Update: {
          action_label?: string | null
          action_url?: string | null
          actor_type?: string
          actor_user_id?: string | null
          applicant_id?: string | null
          detail?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          occurred_at?: string
          status?: string | null
          title?: string
          waiting_on_admin?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "admin_workday_events_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "applicants"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_event: {
        Row: {
          acknowledged_at: string | null
          detail: string | null
          digest: string | null
          fired_at: string
          headline: string | null
          id: string
          metric_value: number | null
          resolved_at: string | null
          rule_code: string
          severity: string | null
          status: string
          suppressed_in_digest: boolean
          threshold_value: number | null
        }
        Insert: {
          acknowledged_at?: string | null
          detail?: string | null
          digest?: string | null
          fired_at?: string
          headline?: string | null
          id?: string
          metric_value?: number | null
          resolved_at?: string | null
          rule_code: string
          severity?: string | null
          status?: string
          suppressed_in_digest?: boolean
          threshold_value?: number | null
        }
        Update: {
          acknowledged_at?: string | null
          detail?: string | null
          digest?: string | null
          fired_at?: string
          headline?: string | null
          id?: string
          metric_value?: number | null
          resolved_at?: string | null
          rule_code?: string
          severity?: string | null
          status?: string
          suppressed_in_digest?: boolean
          threshold_value?: number | null
        }
        Relationships: []
      }
      alert_rule: {
        Row: {
          action_text: string | null
          code: string
          condition_note: string | null
          cooldown_hours: number
          created_at: string
          digest: string | null
          domain: string | null
          enabled: boolean
          evaluation_window_days: number
          id: string
          min_sample: number
          priority: number
          severity: string | null
          threshold: Json
          title: string | null
          updated_at: string
        }
        Insert: {
          action_text?: string | null
          code: string
          condition_note?: string | null
          cooldown_hours?: number
          created_at?: string
          digest?: string | null
          domain?: string | null
          enabled?: boolean
          evaluation_window_days?: number
          id?: string
          min_sample?: number
          priority?: number
          severity?: string | null
          threshold?: Json
          title?: string | null
          updated_at?: string
        }
        Update: {
          action_text?: string | null
          code?: string
          condition_note?: string | null
          cooldown_hours?: number
          created_at?: string
          digest?: string | null
          domain?: string | null
          enabled?: boolean
          evaluation_window_days?: number
          id?: string
          min_sample?: number
          priority?: number
          severity?: string | null
          threshold?: Json
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      annual_refunds: {
        Row: {
          amount_cents: number
          created_at: string
          current_period_start: string | null
          id: string
          months_used: number
          paid_cents: number
          reason: string | null
          status: string
          stripe_refund_id: string | null
          subscription_id: string
          user_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          current_period_start?: string | null
          id?: string
          months_used: number
          paid_cents: number
          reason?: string | null
          status?: string
          stripe_refund_id?: string | null
          subscription_id: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          current_period_start?: string | null
          id?: string
          months_used?: number
          paid_cents?: number
          reason?: string | null
          status?: string
          stripe_refund_id?: string | null
          subscription_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "annual_refunds_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      app_crypto_keys: {
        Row: {
          created_at: string
          id: string
          secret: string
        }
        Insert: {
          created_at?: string
          id: string
          secret: string
        }
        Update: {
          created_at?: string
          id?: string
          secret?: string
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
      applicant_equipment_photos: {
        Row: {
          applicant_id: string
          created_at: string
          id: string
          notes: string | null
          photo_type: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          storage_path: string
          updated_at: string
        }
        Insert: {
          applicant_id: string
          created_at?: string
          id?: string
          notes?: string | null
          photo_type: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          storage_path: string
          updated_at?: string
        }
        Update: {
          applicant_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          photo_type?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          storage_path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "applicant_equipment_photos_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "applicants"
            referencedColumns: ["id"]
          },
        ]
      }
      applicant_field_audit: {
        Row: {
          applicant_id: string
          changed_at: string
          changed_by: string | null
          field: string
          id: string
          new_value: string | null
          old_value: string | null
        }
        Insert: {
          applicant_id: string
          changed_at?: string
          changed_by?: string | null
          field: string
          id?: string
          new_value?: string | null
          old_value?: string | null
        }
        Update: {
          applicant_id?: string
          changed_at?: string
          changed_by?: string | null
          field?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "applicant_field_audit_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "applicants"
            referencedColumns: ["id"]
          },
        ]
      }
      applicants: {
        Row: {
          all_set_sent_at: string | null
          applied_on: string | null
          available_minutes_week: number
          avg_customer_rating: number | null
          background_check_ok: string | null
          badge_photo_url: string | null
          badge_status: string
          bg_check_completed_at: string | null
          bg_check_manual_review: boolean
          bg_check_notes: string | null
          bg_check_ordered_at: string | null
          bg_check_provider: string | null
          bg_check_status: string | null
          bilingual: boolean | null
          bilingual_fluency_confirmed: boolean
          bilingual_gate: string | null
          bond_status: string | null
          business_bank_account_confirmed: boolean
          call_at: string | null
          chase_alerted_at: string | null
          chase_count: number
          chase_last_at: string | null
          checkr_candidate_id: string | null
          checkr_invitation_id: string | null
          checkr_last_webhook_at: string | null
          checkr_report_id: string | null
          checkr_report_status: string | null
          city_or_zip: string | null
          coi_auto_status: string | null
          coi_carrier_name: string | null
          coi_effective_date: string | null
          coi_expires_at: string | null
          coi_general_liability_status: string | null
          coi_pdf_url: string | null
          coi_policy_number: string | null
          coi_review_notes: string | null
          coi_review_status: string
          coi_token: string | null
          coi_token_expires_at: string | null
          coi_uploaded_at: string | null
          complaint_count: number
          complaint_rate: number | null
          completed_visits: number
          compliance_complete: boolean | null
          contract_doc_version: string | null
          contract_sent_at: string | null
          contract_signed_ip: string | null
          contract_signed_name: string | null
          contract_signed_pdf_path: string | null
          contract_signed_ua: string | null
          contract_token: string | null
          contractor_cancel_count: number
          contractor_cancel_rate: number | null
          contractor_id: string | null
          contracts_signed: boolean
          contracts_signed_at: string | null
          created_at: string
          current_stage: string | null
          documenso_document_ids: Json
          drive_minutes: number | null
          drivers_license: string | null
          ein: string | null
          email: string
          equipment_approved: boolean
          experience_matches_resume: string | null
          experience_years: number | null
          first_name: string
          first_texted_at: string | null
          fl_license: boolean | null
          flags: string[]
          followed_up_at: string | null
          gate_confirmations: Json
          google_review_match_name: string | null
          has_insurance: boolean | null
          has_supplies: boolean | null
          has_vehicle: boolean | null
          hiring_tier: string | null
          id: string
          insurance_expires_at: string | null
          insurance_status: string
          insurance_willing: boolean | null
          is_test_row: boolean
          jobber_id: string | null
          last_jobber_event_at: string | null
          last_name: string
          last_review_match_at: string | null
          last_visit_at: string | null
          license_expiry: string | null
          notes: string | null
          notes_for_admin: string | null
          onboarding_email_sent_at: string | null
          onboarding_reminder_count: number
          onboarding_reminder_last_at: string | null
          open_escalations_count: number
          opening_id: string | null
          out_of_service_area: boolean
          own_equipment: string | null
          owner_operator: boolean | null
          phone: string | null
          photo_compliance_rate: number | null
          photos_expected_count: number
          photos_uploaded_count: number
          preferred_language: string
          pro_number: string | null
          pro_number_reserved: string | null
          pro_partner_interest: string | null
          pro_since: string | null
          queue_state: string
          reads_texts: string | null
          rejected_at: string | null
          rejection_reason: string | null
          replied_at: string | null
          role: string | null
          score: number | null
          score_overridden: boolean
          sequence_stage: string | null
          sequence_stage_entered_at: string | null
          service: string | null
          source: string | null
          stage_entered_at: string | null
          start_date: string | null
          stripe_account_id: string | null
          stripe_connect_complete: boolean
          stripe_connect_status: string
          tier: string
          tier_advanced_at: string | null
          tier_hint: string | null
          tier_offer_sent_at: string | null
          tier_offered_by: string | null
          tier_readiness_status: string
          total_ratings_count: number
          trade_job_current: boolean | null
          training_no_show_count: number
          training_passed: boolean
          training_scheduled_at: string | null
          updated_at: string
          verify_token: string | null
          w9_status: string
          wash_only: boolean
          watch_for: string | null
          why: string | null
          work_authorized: string | null
          years_in_service: number | null
          zip: string | null
        }
        Insert: {
          all_set_sent_at?: string | null
          applied_on?: string | null
          available_minutes_week?: number
          avg_customer_rating?: number | null
          background_check_ok?: string | null
          badge_photo_url?: string | null
          badge_status?: string
          bg_check_completed_at?: string | null
          bg_check_manual_review?: boolean
          bg_check_notes?: string | null
          bg_check_ordered_at?: string | null
          bg_check_provider?: string | null
          bg_check_status?: string | null
          bilingual?: boolean | null
          bilingual_fluency_confirmed?: boolean
          bilingual_gate?: string | null
          bond_status?: string | null
          business_bank_account_confirmed?: boolean
          call_at?: string | null
          chase_alerted_at?: string | null
          chase_count?: number
          chase_last_at?: string | null
          checkr_candidate_id?: string | null
          checkr_invitation_id?: string | null
          checkr_last_webhook_at?: string | null
          checkr_report_id?: string | null
          checkr_report_status?: string | null
          city_or_zip?: string | null
          coi_auto_status?: string | null
          coi_carrier_name?: string | null
          coi_effective_date?: string | null
          coi_expires_at?: string | null
          coi_general_liability_status?: string | null
          coi_pdf_url?: string | null
          coi_policy_number?: string | null
          coi_review_notes?: string | null
          coi_review_status?: string
          coi_token?: string | null
          coi_token_expires_at?: string | null
          coi_uploaded_at?: string | null
          complaint_count?: number
          complaint_rate?: number | null
          completed_visits?: number
          compliance_complete?: boolean | null
          contract_doc_version?: string | null
          contract_sent_at?: string | null
          contract_signed_ip?: string | null
          contract_signed_name?: string | null
          contract_signed_pdf_path?: string | null
          contract_signed_ua?: string | null
          contract_token?: string | null
          contractor_cancel_count?: number
          contractor_cancel_rate?: number | null
          contractor_id?: string | null
          contracts_signed?: boolean
          contracts_signed_at?: string | null
          created_at?: string
          current_stage?: string | null
          documenso_document_ids?: Json
          drive_minutes?: number | null
          drivers_license?: string | null
          ein?: string | null
          email: string
          equipment_approved?: boolean
          experience_matches_resume?: string | null
          experience_years?: number | null
          first_name: string
          first_texted_at?: string | null
          fl_license?: boolean | null
          flags?: string[]
          followed_up_at?: string | null
          gate_confirmations?: Json
          google_review_match_name?: string | null
          has_insurance?: boolean | null
          has_supplies?: boolean | null
          has_vehicle?: boolean | null
          hiring_tier?: string | null
          id?: string
          insurance_expires_at?: string | null
          insurance_status?: string
          insurance_willing?: boolean | null
          is_test_row?: boolean
          jobber_id?: string | null
          last_jobber_event_at?: string | null
          last_name: string
          last_review_match_at?: string | null
          last_visit_at?: string | null
          license_expiry?: string | null
          notes?: string | null
          notes_for_admin?: string | null
          onboarding_email_sent_at?: string | null
          onboarding_reminder_count?: number
          onboarding_reminder_last_at?: string | null
          open_escalations_count?: number
          opening_id?: string | null
          out_of_service_area?: boolean
          own_equipment?: string | null
          owner_operator?: boolean | null
          phone?: string | null
          photo_compliance_rate?: number | null
          photos_expected_count?: number
          photos_uploaded_count?: number
          preferred_language?: string
          pro_number?: string | null
          pro_number_reserved?: string | null
          pro_partner_interest?: string | null
          pro_since?: string | null
          queue_state?: string
          reads_texts?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          replied_at?: string | null
          role?: string | null
          score?: number | null
          score_overridden?: boolean
          sequence_stage?: string | null
          sequence_stage_entered_at?: string | null
          service?: string | null
          source?: string | null
          stage_entered_at?: string | null
          start_date?: string | null
          stripe_account_id?: string | null
          stripe_connect_complete?: boolean
          stripe_connect_status?: string
          tier?: string
          tier_advanced_at?: string | null
          tier_hint?: string | null
          tier_offer_sent_at?: string | null
          tier_offered_by?: string | null
          tier_readiness_status?: string
          total_ratings_count?: number
          trade_job_current?: boolean | null
          training_no_show_count?: number
          training_passed?: boolean
          training_scheduled_at?: string | null
          updated_at?: string
          verify_token?: string | null
          w9_status?: string
          wash_only?: boolean
          watch_for?: string | null
          why?: string | null
          work_authorized?: string | null
          years_in_service?: number | null
          zip?: string | null
        }
        Update: {
          all_set_sent_at?: string | null
          applied_on?: string | null
          available_minutes_week?: number
          avg_customer_rating?: number | null
          background_check_ok?: string | null
          badge_photo_url?: string | null
          badge_status?: string
          bg_check_completed_at?: string | null
          bg_check_manual_review?: boolean
          bg_check_notes?: string | null
          bg_check_ordered_at?: string | null
          bg_check_provider?: string | null
          bg_check_status?: string | null
          bilingual?: boolean | null
          bilingual_fluency_confirmed?: boolean
          bilingual_gate?: string | null
          bond_status?: string | null
          business_bank_account_confirmed?: boolean
          call_at?: string | null
          chase_alerted_at?: string | null
          chase_count?: number
          chase_last_at?: string | null
          checkr_candidate_id?: string | null
          checkr_invitation_id?: string | null
          checkr_last_webhook_at?: string | null
          checkr_report_id?: string | null
          checkr_report_status?: string | null
          city_or_zip?: string | null
          coi_auto_status?: string | null
          coi_carrier_name?: string | null
          coi_effective_date?: string | null
          coi_expires_at?: string | null
          coi_general_liability_status?: string | null
          coi_pdf_url?: string | null
          coi_policy_number?: string | null
          coi_review_notes?: string | null
          coi_review_status?: string
          coi_token?: string | null
          coi_token_expires_at?: string | null
          coi_uploaded_at?: string | null
          complaint_count?: number
          complaint_rate?: number | null
          completed_visits?: number
          compliance_complete?: boolean | null
          contract_doc_version?: string | null
          contract_sent_at?: string | null
          contract_signed_ip?: string | null
          contract_signed_name?: string | null
          contract_signed_pdf_path?: string | null
          contract_signed_ua?: string | null
          contract_token?: string | null
          contractor_cancel_count?: number
          contractor_cancel_rate?: number | null
          contractor_id?: string | null
          contracts_signed?: boolean
          contracts_signed_at?: string | null
          created_at?: string
          current_stage?: string | null
          documenso_document_ids?: Json
          drive_minutes?: number | null
          drivers_license?: string | null
          ein?: string | null
          email?: string
          equipment_approved?: boolean
          experience_matches_resume?: string | null
          experience_years?: number | null
          first_name?: string
          first_texted_at?: string | null
          fl_license?: boolean | null
          flags?: string[]
          followed_up_at?: string | null
          gate_confirmations?: Json
          google_review_match_name?: string | null
          has_insurance?: boolean | null
          has_supplies?: boolean | null
          has_vehicle?: boolean | null
          hiring_tier?: string | null
          id?: string
          insurance_expires_at?: string | null
          insurance_status?: string
          insurance_willing?: boolean | null
          is_test_row?: boolean
          jobber_id?: string | null
          last_jobber_event_at?: string | null
          last_name?: string
          last_review_match_at?: string | null
          last_visit_at?: string | null
          license_expiry?: string | null
          notes?: string | null
          notes_for_admin?: string | null
          onboarding_email_sent_at?: string | null
          onboarding_reminder_count?: number
          onboarding_reminder_last_at?: string | null
          open_escalations_count?: number
          opening_id?: string | null
          out_of_service_area?: boolean
          own_equipment?: string | null
          owner_operator?: boolean | null
          phone?: string | null
          photo_compliance_rate?: number | null
          photos_expected_count?: number
          photos_uploaded_count?: number
          preferred_language?: string
          pro_number?: string | null
          pro_number_reserved?: string | null
          pro_partner_interest?: string | null
          pro_since?: string | null
          queue_state?: string
          reads_texts?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          replied_at?: string | null
          role?: string | null
          score?: number | null
          score_overridden?: boolean
          sequence_stage?: string | null
          sequence_stage_entered_at?: string | null
          service?: string | null
          source?: string | null
          stage_entered_at?: string | null
          start_date?: string | null
          stripe_account_id?: string | null
          stripe_connect_complete?: boolean
          stripe_connect_status?: string
          tier?: string
          tier_advanced_at?: string | null
          tier_hint?: string | null
          tier_offer_sent_at?: string | null
          tier_offered_by?: string | null
          tier_readiness_status?: string
          total_ratings_count?: number
          trade_job_current?: boolean | null
          training_no_show_count?: number
          training_passed?: boolean
          training_scheduled_at?: string | null
          updated_at?: string
          verify_token?: string | null
          w9_status?: string
          wash_only?: boolean
          watch_for?: string | null
          why?: string | null
          work_authorized?: string | null
          years_in_service?: number | null
          zip?: string | null
        }
        Relationships: []
      }
      application_answers: {
        Row: {
          answered_at: string
          candidate_id: string
          question_id: string
          value: Json
        }
        Insert: {
          answered_at?: string
          candidate_id: string
          question_id: string
          value: Json
        }
        Update: {
          answered_at?: string
          candidate_id?: string
          question_id?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "application_answers_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "applicants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "question_bank"
            referencedColumns: ["id"]
          },
        ]
      }
      badge_status_log: {
        Row: {
          applicant_id: string
          changed_at: string
          changed_by: string | null
          id: string
          new_status: string
          note: string | null
          old_status: string | null
        }
        Insert: {
          applicant_id: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_status: string
          note?: string | null
          old_status?: string | null
        }
        Update: {
          applicant_id?: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_status?: string
          note?: string | null
          old_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "badge_status_log_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "applicants"
            referencedColumns: ["id"]
          },
        ]
      }
      band_reviews: {
        Row: {
          address: string | null
          county_band: string | null
          county_source: string | null
          county_sq_ft: number | null
          created_at: string
          id: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_band: string | null
          resolved_by: string | null
          self_band: string
          service_type: Database["public"]["Enums"]["service_type"]
          status: string
          subscription_id: string | null
          user_id: string | null
        }
        Insert: {
          address?: string | null
          county_band?: string | null
          county_source?: string | null
          county_sq_ft?: number | null
          created_at?: string
          id?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_band?: string | null
          resolved_by?: string | null
          self_band: string
          service_type: Database["public"]["Enums"]["service_type"]
          status?: string
          subscription_id?: string | null
          user_id?: string | null
        }
        Update: {
          address?: string | null
          county_band?: string | null
          county_source?: string | null
          county_sq_ft?: number | null
          created_at?: string
          id?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_band?: string | null
          resolved_by?: string | null
          self_band?: string
          service_type?: Database["public"]["Enums"]["service_type"]
          status?: string
          subscription_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "band_reviews_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      bundle_discount_tiers: {
        Row: {
          discount_pct: number
          service_count: number
          updated_at: string
        }
        Insert: {
          discount_pct: number
          service_count: number
          updated_at?: string
        }
        Update: {
          discount_pct?: number
          service_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      calendar_tasks: {
        Row: {
          body: string | null
          created_at: string
          done_at: string | null
          fixed_rule: string | null
          heads_up_days: number
          id: string
          next_due_date: string | null
          offset_days_from_launch: number | null
          recurring: boolean
          sort_key: number
          task_key: string | null
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          done_at?: string | null
          fixed_rule?: string | null
          heads_up_days?: number
          id?: string
          next_due_date?: string | null
          offset_days_from_launch?: number | null
          recurring?: boolean
          sort_key?: number
          task_key?: string | null
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          done_at?: string | null
          fixed_rule?: string | null
          heads_up_days?: number
          id?: string
          next_due_date?: string | null
          offset_days_from_launch?: number | null
          recurring?: boolean
          sort_key?: number
          task_key?: string | null
          title?: string
        }
        Relationships: []
      }
      candidate_faq: {
        Row: {
          a_en: string
          a_es: string
          candidate_visible: boolean
          created_at: string
          id: string
          needs_justin: boolean
          q_en: string
          q_es: string
          sort: number
          updated_at: string
        }
        Insert: {
          a_en?: string
          a_es?: string
          candidate_visible?: boolean
          created_at?: string
          id?: string
          needs_justin?: boolean
          q_en: string
          q_es: string
          sort?: number
          updated_at?: string
        }
        Update: {
          a_en?: string
          a_es?: string
          candidate_visible?: boolean
          created_at?: string
          id?: string
          needs_justin?: boolean
          q_en?: string
          q_es?: string
          sort?: number
          updated_at?: string
        }
        Relationships: []
      }
      candidate_indeed_resumes: {
        Row: {
          applicant_id: string
          resume_text: string
          updated_at: string
        }
        Insert: {
          applicant_id: string
          resume_text?: string
          updated_at?: string
        }
        Update: {
          applicant_id?: string
          resume_text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_indeed_resumes_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: true
            referencedRelation: "applicants"
            referencedColumns: ["id"]
          },
        ]
      }
      capacity_crossings: {
        Row: {
          active_customers: number | null
          capacity_hours: number | null
          cleared_at: string | null
          created_at: string
          days_to_ceiling: number | null
          demand_hours: number | null
          fill_pct: number | null
          id: string
          level: string
          notified_at: string | null
          notify_channels: string[]
          service: Database["public"]["Enums"]["service_type"]
        }
        Insert: {
          active_customers?: number | null
          capacity_hours?: number | null
          cleared_at?: string | null
          created_at?: string
          days_to_ceiling?: number | null
          demand_hours?: number | null
          fill_pct?: number | null
          id?: string
          level: string
          notified_at?: string | null
          notify_channels?: string[]
          service: Database["public"]["Enums"]["service_type"]
        }
        Update: {
          active_customers?: number | null
          capacity_hours?: number | null
          cleared_at?: string | null
          created_at?: string
          days_to_ceiling?: number | null
          demand_hours?: number | null
          fill_pct?: number | null
          id?: string
          level?: string
          notified_at?: string | null
          notify_channels?: string[]
          service?: Database["public"]["Enums"]["service_type"]
        }
        Relationships: []
      }
      capacity_overrides: {
        Row: {
          admin_id: string
          created_at: string
          details: Json
          id: string
          reason: string
          visit_id: string
        }
        Insert: {
          admin_id: string
          created_at?: string
          details?: Json
          id?: string
          reason: string
          visit_id: string
        }
        Update: {
          admin_id?: string
          created_at?: string
          details?: Json
          id?: string
          reason?: string
          visit_id?: string
        }
        Relationships: []
      }
      car_wash_profiles: {
        Row: {
          access_note: string | null
          gate_code: string | null
          interior_access: string | null
          interior_included: boolean
          parking_spot: string | null
          spigot_at_parking: boolean | null
          subscription_id: string
          updated_at: string
          user_id: string
          vehicle_color: string | null
          vehicle_make: string | null
          vehicle_model: string | null
          vehicle_plate: string | null
        }
        Insert: {
          access_note?: string | null
          gate_code?: string | null
          interior_access?: string | null
          interior_included?: boolean
          parking_spot?: string | null
          spigot_at_parking?: boolean | null
          subscription_id: string
          updated_at?: string
          user_id: string
          vehicle_color?: string | null
          vehicle_make?: string | null
          vehicle_model?: string | null
          vehicle_plate?: string | null
        }
        Update: {
          access_note?: string | null
          gate_code?: string | null
          interior_access?: string | null
          interior_included?: boolean
          parking_spot?: string | null
          spigot_at_parking?: boolean | null
          subscription_id?: string
          updated_at?: string
          user_id?: string
          vehicle_color?: string | null
          vehicle_make?: string | null
          vehicle_model?: string | null
          vehicle_plate?: string | null
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
      checklist_templates: {
        Row: {
          active: boolean
          id: string
          label: string
          section: string
          service_type: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          id?: string
          label: string
          section: string
          service_type: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          id?: string
          label?: string
          section?: string
          service_type?: string
          sort_order?: number
        }
        Relationships: []
      }
      cleaning_pay_lines: {
        Row: {
          amount_cents: number
          created_at: string
          dedupe_key: string
          id: string
          kind: string
          pro_id: string
          visit_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          dedupe_key: string
          id?: string
          kind: string
          pro_id: string
          visit_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          dedupe_key?: string
          id?: string
          kind?: string
          pro_id?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_pay_lines_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaning_team_presence: {
        Row: {
          check_in_at: string | null
          check_in_lat: number | null
          check_in_lng: number | null
          check_in_location_reason: string | null
          check_out_at: string | null
          check_out_lat: number | null
          check_out_lng: number | null
          check_out_location_reason: string | null
          pro_id: string
          visit_id: string
        }
        Insert: {
          check_in_at?: string | null
          check_in_lat?: number | null
          check_in_lng?: number | null
          check_in_location_reason?: string | null
          check_out_at?: string | null
          check_out_lat?: number | null
          check_out_lng?: number | null
          check_out_location_reason?: string | null
          pro_id: string
          visit_id: string
        }
        Update: {
          check_in_at?: string | null
          check_in_lat?: number | null
          check_in_lng?: number | null
          check_in_location_reason?: string | null
          check_out_at?: string | null
          check_out_lat?: number | null
          check_out_lng?: number | null
          check_out_location_reason?: string | null
          pro_id?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_team_presence_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaning_teams: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          helper_background_checked_at: string | null
          helper_insurance_verified_at: string | null
          helper_name: string | null
          id: string
          kind: string
          lead_pro_id: string
          partner_pro_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          helper_background_checked_at?: string | null
          helper_insurance_verified_at?: string | null
          helper_name?: string | null
          id?: string
          kind: string
          lead_pro_id: string
          partner_pro_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          helper_background_checked_at?: string | null
          helper_insurance_verified_at?: string | null
          helper_name?: string | null
          id?: string
          kind?: string
          lead_pro_id?: string
          partner_pro_id?: string | null
        }
        Relationships: []
      }
      cleaning_visit_checks: {
        Row: {
          checks: Json
          pro_id: string
          updated_at: string
          visit_id: string
        }
        Insert: {
          checks?: Json
          pro_id: string
          updated_at?: string
          visit_id: string
        }
        Update: {
          checks?: Json
          pro_id?: string
          updated_at?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_visit_checks_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaning_walkthrough_slots: {
        Row: {
          created_at: string
          ends_at: string
          id: string
          reservation_id: string | null
          starts_at: string
          status: string
        }
        Insert: {
          created_at?: string
          ends_at: string
          id?: string
          reservation_id?: string | null
          starts_at: string
          status?: string
        }
        Update: {
          created_at?: string
          ends_at?: string
          id?: string
          reservation_id?: string | null
          starts_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_walkthrough_slots_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      company_documents: {
        Row: {
          admin_only: boolean
          archive_reason: string | null
          archived_at: string | null
          brevo_template_id: number | null
          category: string
          contractor_id: string | null
          current_version: boolean
          description: string | null
          doc_key: string | null
          documenso_doc_id: string | null
          file_size_bytes: number | null
          filename: string
          id: string
          mime_type: string | null
          searchable_text: string | null
          storage_path: string
          tags: string[]
          title: string | null
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          admin_only?: boolean
          archive_reason?: string | null
          archived_at?: string | null
          brevo_template_id?: number | null
          category: string
          contractor_id?: string | null
          current_version?: boolean
          description?: string | null
          doc_key?: string | null
          documenso_doc_id?: string | null
          file_size_bytes?: number | null
          filename: string
          id?: string
          mime_type?: string | null
          searchable_text?: string | null
          storage_path: string
          tags?: string[]
          title?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          admin_only?: boolean
          archive_reason?: string | null
          archived_at?: string | null
          brevo_template_id?: number | null
          category?: string
          contractor_id?: string | null
          current_version?: boolean
          description?: string | null
          doc_key?: string | null
          documenso_doc_id?: string | null
          file_size_bytes?: number | null
          filename?: string
          id?: string
          mime_type?: string | null
          searchable_text?: string | null
          storage_path?: string
          tags?: string[]
          title?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      complaints: {
        Row: {
          closed_at: string | null
          contractor_id: string | null
          id: string
          notes: string | null
          opened_at: string
          opened_by: string | null
          severity: string
          source: string
        }
        Insert: {
          closed_at?: string | null
          contractor_id?: string | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string | null
          severity: string
          source: string
        }
        Update: {
          closed_at?: string | null
          contractor_id?: string | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string | null
          severity?: string
          source?: string
        }
        Relationships: []
      }
      contacts: {
        Row: {
          created_at: string
          email: string | null
          email_marketing: boolean
          email_suppressed: boolean
          first_name: string | null
          id: string
          is_test: boolean
          lang: string
          last_marketing_sent_at: string | null
          last_name: string | null
          lifecycle_stage: string
          phone: string | null
          sms_marketing: boolean
          sms_service: boolean
          sms_stopped: boolean
          source: string | null
          src_tag: string | null
          stage_entered_at: string
          updated_at: string
          user_id: string | null
          welcome_at: string | null
          zip: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          email_marketing?: boolean
          email_suppressed?: boolean
          first_name?: string | null
          id?: string
          is_test?: boolean
          lang?: string
          last_marketing_sent_at?: string | null
          last_name?: string | null
          lifecycle_stage?: string
          phone?: string | null
          sms_marketing?: boolean
          sms_service?: boolean
          sms_stopped?: boolean
          source?: string | null
          src_tag?: string | null
          stage_entered_at?: string
          updated_at?: string
          user_id?: string | null
          welcome_at?: string | null
          zip?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          email_marketing?: boolean
          email_suppressed?: boolean
          first_name?: string | null
          id?: string
          is_test?: boolean
          lang?: string
          last_marketing_sent_at?: string | null
          last_name?: string | null
          lifecycle_stage?: string
          phone?: string | null
          sms_marketing?: boolean
          sms_service?: boolean
          sms_stopped?: boolean
          source?: string | null
          src_tag?: string | null
          stage_entered_at?: string
          updated_at?: string
          user_id?: string | null
          welcome_at?: string | null
          zip?: string | null
        }
        Relationships: []
      }
      contract_signatures: {
        Row: {
          applicant_id: string
          document_id: string | null
          document_version: string
          id: string
          ip_address: string | null
          signed_at: string
          signed_pdf_path: string | null
          typed_name: string
          user_agent: string | null
        }
        Insert: {
          applicant_id: string
          document_id?: string | null
          document_version: string
          id?: string
          ip_address?: string | null
          signed_at?: string
          signed_pdf_path?: string | null
          typed_name: string
          user_agent?: string | null
        }
        Update: {
          applicant_id?: string
          document_id?: string | null
          document_version?: string
          id?: string
          ip_address?: string | null
          signed_at?: string
          signed_pdf_path?: string | null
          typed_name?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_signatures_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "applicants"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_artifacts: {
        Row: {
          applicant_id: string
          file_name: string | null
          id: string
          kind: string
          storage_path: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          applicant_id: string
          file_name?: string | null
          id?: string
          kind: string
          storage_path: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          applicant_id?: string
          file_name?: string | null
          id?: string
          kind?: string
          storage_path?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contractor_artifacts_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "applicants"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_insurance: {
        Row: {
          additional_insured_status: string
          aggregate_limit_cents: number | null
          applicant_id: string | null
          carrier_name: string | null
          certificate_mime: string | null
          certificate_path: string | null
          contractor_id: string | null
          coverage_type: string
          created_at: string
          effective_date: string | null
          expiration_date: string | null
          id: string
          last_checked_at: string | null
          per_occurrence_limit_cents: number | null
          policy_number: string | null
          provider: string
          rejection_reason: string | null
          reminders_sent: Json
          service_category: string | null
          updated_at: string
          verification_method: string
          verification_status: string
          verified_at: string | null
          verified_by: string | null
          waived_at: string | null
          waived_by: string | null
          waived_reason: string | null
        }
        Insert: {
          additional_insured_status?: string
          aggregate_limit_cents?: number | null
          applicant_id?: string | null
          carrier_name?: string | null
          certificate_mime?: string | null
          certificate_path?: string | null
          contractor_id?: string | null
          coverage_type?: string
          created_at?: string
          effective_date?: string | null
          expiration_date?: string | null
          id?: string
          last_checked_at?: string | null
          per_occurrence_limit_cents?: number | null
          policy_number?: string | null
          provider?: string
          rejection_reason?: string | null
          reminders_sent?: Json
          service_category?: string | null
          updated_at?: string
          verification_method?: string
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
          waived_at?: string | null
          waived_by?: string | null
          waived_reason?: string | null
        }
        Update: {
          additional_insured_status?: string
          aggregate_limit_cents?: number | null
          applicant_id?: string | null
          carrier_name?: string | null
          certificate_mime?: string | null
          certificate_path?: string | null
          contractor_id?: string | null
          coverage_type?: string
          created_at?: string
          effective_date?: string | null
          expiration_date?: string | null
          id?: string
          last_checked_at?: string | null
          per_occurrence_limit_cents?: number | null
          policy_number?: string | null
          provider?: string
          rejection_reason?: string | null
          reminders_sent?: Json
          service_category?: string | null
          updated_at?: string
          verification_method?: string
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
          waived_at?: string | null
          waived_by?: string | null
          waived_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contractor_insurance_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "applicants"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_pipeline: {
        Row: {
          activated_at: string | null
          activation_notice_sent_at: string | null
          adverse_action_notice_sent_at: string | null
          agreement_docs_sent_at: string | null
          applicant_id: string
          application_disqualify_at: string | null
          application_disqualify_handled_at: string | null
          application_owner_notes: string | null
          application_report: Json | null
          application_version: number
          apply_question_ids: string[] | null
          apply_remaining_only: boolean
          apply_resume_token: string | null
          apply_started_at: string | null
          apply_submitted_at: string | null
          apply_total_seconds: number | null
          archive_reason: string | null
          archived: boolean
          archived_at: string | null
          archived_from_stage: string | null
          call_notes: string | null
          checkin_missed_count: number
          checkr_result: string | null
          cleared_notice_sent_at: string | null
          close_out_sent_at: string | null
          coi_effective_date: string | null
          coi_expiry_date: string | null
          coi_limit_aggregate: number | null
          coi_limit_occurrence: number | null
          coi_names_tidy_as_ai: boolean | null
          created_at: string
          decline_note: string | null
          decline_reason: string | null
          drive_time_minutes: number | null
          equipment_claimed: string[]
          experience_level: string | null
          hold_callback_date: string | null
          hold_reason: string | null
          ica_countersigned_at: string | null
          inperson_confirmed_at: string | null
          inperson_reschedules: number
          inperson_slot_id: string | null
          insurance_instructions_sent_at: string | null
          insurance_reimbursement_start_month: string | null
          invite_deadline_at: string | null
          invited_at: string | null
          is_test: boolean
          kit_issued_at: string | null
          last_checkin_sent_at: string | null
          legacy_application: boolean
          one_pager_sent_at: string | null
          owner_phone_invite_at: string | null
          owns_equipment: boolean | null
          phone_confirmed_at: string | null
          phone_reschedules: number
          phone_slot_id: string | null
          pre_adverse_notice_sent_at: string | null
          preferred_language: string | null
          probation_cleared_at: string | null
          probation_paused_at: string | null
          probation_redo_count: number
          probation_visits_remaining: number | null
          proof_approved_at: string | null
          proof_approved_by: string | null
          proof_link_sent_at: string | null
          proof_moved_back: boolean
          proof_reminder_sent_at: string | null
          proof_submitted_at: string | null
          proof_token: string | null
          proof_token_expires_at: string | null
          quote_carrier: string | null
          quote_limit_aggregate: number | null
          quote_limit_occurrence: number | null
          quote_names_tidy_as_ai: boolean | null
          ref_name: string | null
          ref_notes: string | null
          ref_phone: string | null
          ref_relationship: string | null
          ref_status: string
          reimbursement_m1_paid_at: string | null
          reimbursement_m2_paid_at: string | null
          reimbursement_m3_paid_at: string | null
          report_and_rights_summary_provided: boolean | null
          revived_once: boolean
          route_confirmed: boolean
          screening_call_completed_at: string | null
          screening_decision: string | null
          service: string | null
          service_days: string[]
          sign_deadline_at: string | null
          source: string | null
          spend_confirmed_at: string | null
          stage: string
          stage_entered_at: string
          state: string
          updated_at: string
          welcome_t1_sent_at: string | null
          withdrawn_note: string | null
        }
        Insert: {
          activated_at?: string | null
          activation_notice_sent_at?: string | null
          adverse_action_notice_sent_at?: string | null
          agreement_docs_sent_at?: string | null
          applicant_id: string
          application_disqualify_at?: string | null
          application_disqualify_handled_at?: string | null
          application_owner_notes?: string | null
          application_report?: Json | null
          application_version?: number
          apply_question_ids?: string[] | null
          apply_remaining_only?: boolean
          apply_resume_token?: string | null
          apply_started_at?: string | null
          apply_submitted_at?: string | null
          apply_total_seconds?: number | null
          archive_reason?: string | null
          archived?: boolean
          archived_at?: string | null
          archived_from_stage?: string | null
          call_notes?: string | null
          checkin_missed_count?: number
          checkr_result?: string | null
          cleared_notice_sent_at?: string | null
          close_out_sent_at?: string | null
          coi_effective_date?: string | null
          coi_expiry_date?: string | null
          coi_limit_aggregate?: number | null
          coi_limit_occurrence?: number | null
          coi_names_tidy_as_ai?: boolean | null
          created_at?: string
          decline_note?: string | null
          decline_reason?: string | null
          drive_time_minutes?: number | null
          equipment_claimed?: string[]
          experience_level?: string | null
          hold_callback_date?: string | null
          hold_reason?: string | null
          ica_countersigned_at?: string | null
          inperson_confirmed_at?: string | null
          inperson_reschedules?: number
          inperson_slot_id?: string | null
          insurance_instructions_sent_at?: string | null
          insurance_reimbursement_start_month?: string | null
          invite_deadline_at?: string | null
          invited_at?: string | null
          is_test?: boolean
          kit_issued_at?: string | null
          last_checkin_sent_at?: string | null
          legacy_application?: boolean
          one_pager_sent_at?: string | null
          owner_phone_invite_at?: string | null
          owns_equipment?: boolean | null
          phone_confirmed_at?: string | null
          phone_reschedules?: number
          phone_slot_id?: string | null
          pre_adverse_notice_sent_at?: string | null
          preferred_language?: string | null
          probation_cleared_at?: string | null
          probation_paused_at?: string | null
          probation_redo_count?: number
          probation_visits_remaining?: number | null
          proof_approved_at?: string | null
          proof_approved_by?: string | null
          proof_link_sent_at?: string | null
          proof_moved_back?: boolean
          proof_reminder_sent_at?: string | null
          proof_submitted_at?: string | null
          proof_token?: string | null
          proof_token_expires_at?: string | null
          quote_carrier?: string | null
          quote_limit_aggregate?: number | null
          quote_limit_occurrence?: number | null
          quote_names_tidy_as_ai?: boolean | null
          ref_name?: string | null
          ref_notes?: string | null
          ref_phone?: string | null
          ref_relationship?: string | null
          ref_status?: string
          reimbursement_m1_paid_at?: string | null
          reimbursement_m2_paid_at?: string | null
          reimbursement_m3_paid_at?: string | null
          report_and_rights_summary_provided?: boolean | null
          revived_once?: boolean
          route_confirmed?: boolean
          screening_call_completed_at?: string | null
          screening_decision?: string | null
          service?: string | null
          service_days?: string[]
          sign_deadline_at?: string | null
          source?: string | null
          spend_confirmed_at?: string | null
          stage?: string
          stage_entered_at?: string
          state?: string
          updated_at?: string
          welcome_t1_sent_at?: string | null
          withdrawn_note?: string | null
        }
        Update: {
          activated_at?: string | null
          activation_notice_sent_at?: string | null
          adverse_action_notice_sent_at?: string | null
          agreement_docs_sent_at?: string | null
          applicant_id?: string
          application_disqualify_at?: string | null
          application_disqualify_handled_at?: string | null
          application_owner_notes?: string | null
          application_report?: Json | null
          application_version?: number
          apply_question_ids?: string[] | null
          apply_remaining_only?: boolean
          apply_resume_token?: string | null
          apply_started_at?: string | null
          apply_submitted_at?: string | null
          apply_total_seconds?: number | null
          archive_reason?: string | null
          archived?: boolean
          archived_at?: string | null
          archived_from_stage?: string | null
          call_notes?: string | null
          checkin_missed_count?: number
          checkr_result?: string | null
          cleared_notice_sent_at?: string | null
          close_out_sent_at?: string | null
          coi_effective_date?: string | null
          coi_expiry_date?: string | null
          coi_limit_aggregate?: number | null
          coi_limit_occurrence?: number | null
          coi_names_tidy_as_ai?: boolean | null
          created_at?: string
          decline_note?: string | null
          decline_reason?: string | null
          drive_time_minutes?: number | null
          equipment_claimed?: string[]
          experience_level?: string | null
          hold_callback_date?: string | null
          hold_reason?: string | null
          ica_countersigned_at?: string | null
          inperson_confirmed_at?: string | null
          inperson_reschedules?: number
          inperson_slot_id?: string | null
          insurance_instructions_sent_at?: string | null
          insurance_reimbursement_start_month?: string | null
          invite_deadline_at?: string | null
          invited_at?: string | null
          is_test?: boolean
          kit_issued_at?: string | null
          last_checkin_sent_at?: string | null
          legacy_application?: boolean
          one_pager_sent_at?: string | null
          owner_phone_invite_at?: string | null
          owns_equipment?: boolean | null
          phone_confirmed_at?: string | null
          phone_reschedules?: number
          phone_slot_id?: string | null
          pre_adverse_notice_sent_at?: string | null
          preferred_language?: string | null
          probation_cleared_at?: string | null
          probation_paused_at?: string | null
          probation_redo_count?: number
          probation_visits_remaining?: number | null
          proof_approved_at?: string | null
          proof_approved_by?: string | null
          proof_link_sent_at?: string | null
          proof_moved_back?: boolean
          proof_reminder_sent_at?: string | null
          proof_submitted_at?: string | null
          proof_token?: string | null
          proof_token_expires_at?: string | null
          quote_carrier?: string | null
          quote_limit_aggregate?: number | null
          quote_limit_occurrence?: number | null
          quote_names_tidy_as_ai?: boolean | null
          ref_name?: string | null
          ref_notes?: string | null
          ref_phone?: string | null
          ref_relationship?: string | null
          ref_status?: string
          reimbursement_m1_paid_at?: string | null
          reimbursement_m2_paid_at?: string | null
          reimbursement_m3_paid_at?: string | null
          report_and_rights_summary_provided?: boolean | null
          revived_once?: boolean
          route_confirmed?: boolean
          screening_call_completed_at?: string | null
          screening_decision?: string | null
          service?: string | null
          service_days?: string[]
          sign_deadline_at?: string | null
          source?: string | null
          spend_confirmed_at?: string | null
          stage?: string
          stage_entered_at?: string
          state?: string
          updated_at?: string
          welcome_t1_sent_at?: string | null
          withdrawn_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contractor_pipeline_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: true
            referencedRelation: "applicants"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_spend: {
        Row: {
          amount_cents: number
          applicant_id: string
          category: string
          created_by: string | null
          id: string
          note: string | null
          spent_at: string
        }
        Insert: {
          amount_cents: number
          applicant_id: string
          category: string
          created_by?: string | null
          id?: string
          note?: string | null
          spent_at?: string
        }
        Update: {
          amount_cents?: number
          applicant_id?: string
          category?: string
          created_by?: string | null
          id?: string
          note?: string | null
          spent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contractor_spend_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "applicants"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_stage_events: {
        Row: {
          actor: string | null
          applicant_id: string
          created_at: string
          from_stage: string | null
          from_state: string | null
          id: string
          kind: string
          metadata: Json
          reason: string | null
          to_stage: string | null
          to_state: string | null
        }
        Insert: {
          actor?: string | null
          applicant_id: string
          created_at?: string
          from_stage?: string | null
          from_state?: string | null
          id?: string
          kind: string
          metadata?: Json
          reason?: string | null
          to_stage?: string | null
          to_state?: string | null
        }
        Update: {
          actor?: string | null
          applicant_id?: string
          created_at?: string
          from_stage?: string | null
          from_state?: string | null
          id?: string
          kind?: string
          metadata?: Json
          reason?: string | null
          to_stage?: string | null
          to_state?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contractor_stage_events_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "applicants"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_entries: {
        Row: {
          amount_cents: number
          billing_cycle: string | null
          campaign: string | null
          category: string
          channel: string | null
          contractor_name: string | null
          created_at: string
          created_by: string | null
          description: string
          external_id: string | null
          id: string
          is_bonus: boolean
          jobber_job_id: string | null
          jobber_visit_id: string | null
          notes: string | null
          service_type: string | null
          source: string
          spent_on: string
          subcategory: string | null
          updated_at: string
          vendor: string | null
        }
        Insert: {
          amount_cents: number
          billing_cycle?: string | null
          campaign?: string | null
          category: string
          channel?: string | null
          contractor_name?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          external_id?: string | null
          id?: string
          is_bonus?: boolean
          jobber_job_id?: string | null
          jobber_visit_id?: string | null
          notes?: string | null
          service_type?: string | null
          source?: string
          spent_on?: string
          subcategory?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          amount_cents?: number
          billing_cycle?: string | null
          campaign?: string | null
          category?: string
          channel?: string | null
          contractor_name?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          external_id?: string | null
          id?: string
          is_bonus?: boolean
          jobber_job_id?: string | null
          jobber_visit_id?: string | null
          notes?: string | null
          service_type?: string | null
          source?: string
          spent_on?: string
          subcategory?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Relationships: []
      }
      cron_acks: {
        Row: {
          at: string
          authorized: boolean
          fn: string
          id: number
          job_name: string | null
        }
        Insert: {
          at?: string
          authorized?: boolean
          fn: string
          id?: number
          job_name?: string | null
        }
        Update: {
          at?: string
          authorized?: boolean
          fn?: string
          id?: number
          job_name?: string | null
        }
        Relationships: []
      }
      cron_health_snapshot: {
        Row: {
          active: boolean | null
          captured_at: string
          expected_interval_minutes: number | null
          http_at: string | null
          http_error: string | null
          http_status: number | null
          jobid: number
          jobname: string
          last_message: string | null
          last_run_at: string | null
          last_status: string | null
          minutes_since: number | null
          schedule: string | null
          stale: boolean | null
        }
        Insert: {
          active?: boolean | null
          captured_at?: string
          expected_interval_minutes?: number | null
          http_at?: string | null
          http_error?: string | null
          http_status?: number | null
          jobid: number
          jobname: string
          last_message?: string | null
          last_run_at?: string | null
          last_status?: string | null
          minutes_since?: number | null
          schedule?: string | null
          stale?: boolean | null
        }
        Update: {
          active?: boolean | null
          captured_at?: string
          expected_interval_minutes?: number | null
          http_at?: string | null
          http_error?: string | null
          http_status?: number | null
          jobid?: number
          jobname?: string
          last_message?: string | null
          last_run_at?: string | null
          last_status?: string | null
          minutes_since?: number | null
          schedule?: string | null
          stale?: boolean | null
        }
        Relationships: []
      }
      cron_runs: {
        Row: {
          context: Json
          http_error: string | null
          http_status: number | null
          id: string
          job_name: string
          request_id: number | null
          responded_at: string | null
          scheduled_at: string
          timed_out: boolean | null
        }
        Insert: {
          context?: Json
          http_error?: string | null
          http_status?: number | null
          id?: string
          job_name: string
          request_id?: number | null
          responded_at?: string | null
          scheduled_at?: string
          timed_out?: boolean | null
        }
        Update: {
          context?: Json
          http_error?: string | null
          http_status?: number | null
          id?: string
          job_name?: string
          request_id?: number | null
          responded_at?: string | null
          scheduled_at?: string
          timed_out?: boolean | null
        }
        Relationships: []
      }
      customer_bookings: {
        Row: {
          access_enc: string | null
          budget_hours: number
          cadence: string
          claim_id: string
          created_at: string
          details: Json
          end_reason: string | null
          ended_at: string | null
          first_visit_date: string
          id: string
          service: Database["public"]["Enums"]["service_type"]
          status: string
          subscription_id: string
          updated_at: string
          user_id: string
          weekday: number
          window_key: string
          zip: string
        }
        Insert: {
          access_enc?: string | null
          budget_hours: number
          cadence: string
          claim_id: string
          created_at?: string
          details?: Json
          end_reason?: string | null
          ended_at?: string | null
          first_visit_date: string
          id?: string
          service: Database["public"]["Enums"]["service_type"]
          status?: string
          subscription_id: string
          updated_at?: string
          user_id: string
          weekday: number
          window_key: string
          zip: string
        }
        Update: {
          access_enc?: string | null
          budget_hours?: number
          cadence?: string
          claim_id?: string
          created_at?: string
          details?: Json
          end_reason?: string | null
          ended_at?: string | null
          first_visit_date?: string
          id?: string
          service?: Database["public"]["Enums"]["service_type"]
          status?: string
          subscription_id?: string
          updated_at?: string
          user_id?: string
          weekday?: number
          window_key?: string
          zip?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_bookings_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "pro_day_claims"
            referencedColumns: ["id"]
          },
        ]
      }
      damage_claims: {
        Row: {
          admin_notes: string | null
          closed_at: string | null
          description: string
          id: string
          photo_paths: string[]
          photos_purged_at: string | null
          reported_at: string
          status: string
          user_id: string
          visit_id: string
        }
        Insert: {
          admin_notes?: string | null
          closed_at?: string | null
          description: string
          id?: string
          photo_paths: string[]
          photos_purged_at?: string | null
          reported_at?: string
          status?: string
          user_id: string
          visit_id: string
        }
        Update: {
          admin_notes?: string | null
          closed_at?: string | null
          description?: string
          id?: string
          photo_paths?: string[]
          photos_purged_at?: string | null
          reported_at?: string
          status?: string
          user_id?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "damage_claims_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      documenso_templates: {
        Row: {
          doc_type: string
          label: string
          template_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          doc_type: string
          label: string
          template_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          doc_type?: string
          label?: string
          template_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          brevo_message_id: string | null
          channel: string
          delivered_at: string | null
          error_message: string | null
          id: string
          payload: Json
          recipient: string
          status: string
          template_name: string
          triggered_at: string
          triggered_by: string | null
          twilio_sid: string | null
        }
        Insert: {
          brevo_message_id?: string | null
          channel: string
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          payload?: Json
          recipient: string
          status: string
          template_name: string
          triggered_at?: string
          triggered_by?: string | null
          twilio_sid?: string | null
        }
        Update: {
          brevo_message_id?: string | null
          channel?: string
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          payload?: Json
          recipient?: string
          status?: string
          template_name?: string
          triggered_at?: string
          triggered_by?: string | null
          twilio_sid?: string | null
        }
        Relationships: []
      }
      entitlement_events: {
        Row: {
          created_at: string
          detail: Json | null
          entitlement_id: string | null
          event: string
          id: string
          member_id: string | null
          reason: string
        }
        Insert: {
          created_at?: string
          detail?: Json | null
          entitlement_id?: string | null
          event: string
          id?: string
          member_id?: string | null
          reason: string
        }
        Update: {
          created_at?: string
          detail?: Json | null
          entitlement_id?: string | null
          event?: string
          id?: string
          member_id?: string | null
          reason?: string
        }
        Relationships: []
      }
      escalations: {
        Row: {
          contractor_id: string | null
          id: string
          opened_at: string
          opened_by: string | null
          reason: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          source: string
        }
        Insert: {
          contractor_id?: string | null
          id?: string
          opened_at?: string
          opened_by?: string | null
          reason: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity: string
          source: string
        }
        Update: {
          contractor_id?: string | null
          id?: string
          opened_at?: string
          opened_by?: string | null
          reason?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          source?: string
        }
        Relationships: []
      }
      founding_audit: {
        Row: {
          actor: string | null
          created_at: string
          detail: Json | null
          event: string
          grant_id: string | null
          id: string
          reason: string | null
          subscription_id: string | null
        }
        Insert: {
          actor?: string | null
          created_at?: string
          detail?: Json | null
          event: string
          grant_id?: string | null
          id?: string
          reason?: string | null
          subscription_id?: string | null
        }
        Update: {
          actor?: string | null
          created_at?: string
          detail?: Json | null
          event?: string
          grant_id?: string | null
          id?: string
          reason?: string | null
          subscription_id?: string | null
        }
        Relationships: []
      }
      founding_events: {
        Row: {
          created_at: string
          event: string
          id: string
          lang: string | null
          reservation_id: string | null
          session_id: string
          src: string | null
          step: string | null
          zip: string | null
        }
        Insert: {
          created_at?: string
          event: string
          id?: string
          lang?: string | null
          reservation_id?: string | null
          session_id: string
          src?: string | null
          step?: string | null
          zip?: string | null
        }
        Update: {
          created_at?: string
          event?: string
          id?: string
          lang?: string | null
          reservation_id?: string | null
          session_id?: string
          src?: string | null
          step?: string | null
          zip?: string | null
        }
        Relationships: []
      }
      founding_grants: {
        Row: {
          address_key: string
          cancel_reason: string | null
          cancelled_at: string | null
          email: string | null
          founding_number: number
          founding_zip: string
          granted_at: string
          id: string
          rate_card_version: number
          reservation_id: string | null
          seal_status: string
          seal_updated_at: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          address_key: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          email?: string | null
          founding_number: number
          founding_zip: string
          granted_at?: string
          id?: string
          rate_card_version: number
          reservation_id?: string | null
          seal_status?: string
          seal_updated_at?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          address_key?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          email?: string | null
          founding_number?: number
          founding_zip?: string
          granted_at?: string
          id?: string
          rate_card_version?: number
          reservation_id?: string | null
          seal_status?: string
          seal_updated_at?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      google_listing_cache: {
        Row: {
          fetched_at: string
          id: string
          last_error: string | null
          last_error_at: string | null
          maps_uri: string | null
          rating: number | null
          reviews: Json
          total_count: number | null
        }
        Insert: {
          fetched_at?: string
          id?: string
          last_error?: string | null
          last_error_at?: string | null
          maps_uri?: string | null
          rating?: number | null
          reviews?: Json
          total_count?: number | null
        }
        Update: {
          fetched_at?: string
          id?: string
          last_error?: string | null
          last_error_at?: string | null
          maps_uri?: string | null
          rating?: number | null
          reviews?: Json
          total_count?: number | null
        }
        Relationships: []
      }
      google_listing_manual: {
        Row: {
          id: string
          listing_url: string
          rating: number
          total_count: number
          updated_at: string
          verified_at: string
        }
        Insert: {
          id?: string
          listing_url: string
          rating: number
          total_count: number
          updated_at?: string
          verified_at?: string
        }
        Update: {
          id?: string
          listing_url?: string
          rating?: number
          total_count?: number
          updated_at?: string
          verified_at?: string
        }
        Relationships: []
      }
      google_reviewer_neighborhoods: {
        Row: {
          author_name: string
          neighborhood: string
          updated_at: string
        }
        Insert: {
          author_name: string
          neighborhood: string
          updated_at?: string
        }
        Update: {
          author_name?: string
          neighborhood?: string
          updated_at?: string
        }
        Relationships: []
      }
      google_reviews: {
        Row: {
          bonus_paid_at: string | null
          contractor_id: string | null
          contractor_name_matched: string | null
          created_at: string
          id: string
          is_seed: boolean
          posted_at: string | null
          rating: number
          raw_payload: Json
          review_id: string
          review_text: string | null
          reviewer_name: string | null
        }
        Insert: {
          bonus_paid_at?: string | null
          contractor_id?: string | null
          contractor_name_matched?: string | null
          created_at?: string
          id?: string
          is_seed?: boolean
          posted_at?: string | null
          rating: number
          raw_payload?: Json
          review_id: string
          review_text?: string | null
          reviewer_name?: string | null
        }
        Update: {
          bonus_paid_at?: string | null
          contractor_id?: string | null
          contractor_name_matched?: string | null
          created_at?: string
          id?: string
          is_seed?: boolean
          posted_at?: string | null
          rating?: number
          raw_payload?: Json
          review_id?: string
          review_text?: string | null
          reviewer_name?: string | null
        }
        Relationships: []
      }
      hanger_drop: {
        Row: {
          cost: number
          created_at: string
          distributor: string | null
          dropped_on: string
          id: string
          notes: string | null
          quantity: number
          verified_spotcheck: boolean
          zip: string | null
        }
        Insert: {
          cost?: number
          created_at?: string
          distributor?: string | null
          dropped_on?: string
          id?: string
          notes?: string | null
          quantity?: number
          verified_spotcheck?: boolean
          zip?: string | null
        }
        Update: {
          cost?: number
          created_at?: string
          distributor?: string | null
          dropped_on?: string
          id?: string
          notes?: string | null
          quantity?: number
          verified_spotcheck?: boolean
          zip?: string | null
        }
        Relationships: []
      }
      hire_ready_invite_jobs: {
        Row: {
          applicant_id: string
          archive_at: string
          campaign: string
          completed_at: string | null
          due_at: string
          email_status: string
          error: string | null
          finish_at: string
          id: string
          kind: string
          language: string
          requested_at: string | null
          service: string
          sms_status: string
          status: string
          twilio_sid: string | null
        }
        Insert: {
          applicant_id: string
          archive_at: string
          campaign: string
          completed_at?: string | null
          due_at: string
          email_status?: string
          error?: string | null
          finish_at: string
          id?: string
          kind: string
          language: string
          requested_at?: string | null
          service: string
          sms_status?: string
          status?: string
          twilio_sid?: string | null
        }
        Update: {
          applicant_id?: string
          archive_at?: string
          campaign?: string
          completed_at?: string | null
          due_at?: string
          email_status?: string
          error?: string | null
          finish_at?: string
          id?: string
          kind?: string
          language?: string
          requested_at?: string | null
          service?: string
          sms_status?: string
          status?: string
          twilio_sid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hire_ready_invite_jobs_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "applicants"
            referencedColumns: ["id"]
          },
        ]
      }
      hire_specs: {
        Row: {
          created_at: string
          id: string
          service: Database["public"]["Enums"]["service_type"]
          spec: string
          status: string
          weekday: number
          zip: string
        }
        Insert: {
          created_at?: string
          id?: string
          service: Database["public"]["Enums"]["service_type"]
          spec: string
          status?: string
          weekday: number
          zip: string
        }
        Update: {
          created_at?: string
          id?: string
          service?: Database["public"]["Enums"]["service_type"]
          spec?: string
          status?: string
          weekday?: number
          zip?: string
        }
        Relationships: []
      }
      hiring_deadlines: {
        Row: {
          applicant_id: string
          created_at: string
          daily_new_app_reminder: boolean
          due_at: string
          id: string
          kind: string
          nudge_at: string | null
          nudged_at: string | null
          resolved_at: string | null
        }
        Insert: {
          applicant_id: string
          created_at?: string
          daily_new_app_reminder?: boolean
          due_at: string
          id?: string
          kind: string
          nudge_at?: string | null
          nudged_at?: string | null
          resolved_at?: string | null
        }
        Update: {
          applicant_id?: string
          created_at?: string
          daily_new_app_reminder?: boolean
          due_at?: string
          id?: string
          kind?: string
          nudge_at?: string | null
          nudged_at?: string | null
          resolved_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hiring_deadlines_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "applicants"
            referencedColumns: ["id"]
          },
        ]
      }
      hiring_openings: {
        Row: {
          created_at: string
          filled_at: string | null
          filled_by_applicant_id: string | null
          forecast_trigger_date: string | null
          id: string
          indeed_sponsorship_paused: boolean
          post_by_date: string | null
          posted_at: string | null
          service: string
          slot_number: number
          status: string
          trigger_reason: string | null
        }
        Insert: {
          created_at?: string
          filled_at?: string | null
          filled_by_applicant_id?: string | null
          forecast_trigger_date?: string | null
          id?: string
          indeed_sponsorship_paused?: boolean
          post_by_date?: string | null
          posted_at?: string | null
          service: string
          slot_number?: number
          status?: string
          trigger_reason?: string | null
        }
        Update: {
          created_at?: string
          filled_at?: string | null
          filled_by_applicant_id?: string | null
          forecast_trigger_date?: string | null
          id?: string
          indeed_sponsorship_paused?: boolean
          post_by_date?: string | null
          posted_at?: string | null
          service?: string
          slot_number?: number
          status?: string
          trigger_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hiring_openings_filled_by_applicant_id_fkey"
            columns: ["filled_by_applicant_id"]
            isOneToOne: false
            referencedRelation: "applicants"
            referencedColumns: ["id"]
          },
        ]
      }
      hiring_scorecards: {
        Row: {
          applicant_id: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          data: Json
          id: string
          kind: string
          passed: boolean | null
        }
        Insert: {
          applicant_id: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          data?: Json
          id?: string
          kind: string
          passed?: boolean | null
        }
        Update: {
          applicant_id?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          data?: Json
          id?: string
          kind?: string
          passed?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "hiring_scorecards_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "applicants"
            referencedColumns: ["id"]
          },
        ]
      }
      hiring_slots: {
        Row: {
          applicant_id: string | null
          booked_at: string | null
          confirmed_at: string | null
          created_at: string
          duration_min: number
          id: string
          kind: string
          staff: string | null
          starts_at: string
          status: string
        }
        Insert: {
          applicant_id?: string | null
          booked_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          duration_min?: number
          id?: string
          kind: string
          staff?: string | null
          starts_at: string
          status?: string
        }
        Update: {
          applicant_id?: string | null
          booked_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          duration_min?: number
          id?: string
          kind?: string
          staff?: string | null
          starts_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "hiring_slots_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "applicants"
            referencedColumns: ["id"]
          },
        ]
      }
      home_notes: {
        Row: {
          body: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      insurance_audit_log: {
        Row: {
          action: string
          applicant_id: string | null
          contractor_id: string | null
          created_at: string
          from_status: string | null
          id: string
          insurance_id: string | null
          metadata: Json
          performed_by: string | null
          reason: string | null
          to_status: string | null
        }
        Insert: {
          action: string
          applicant_id?: string | null
          contractor_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          insurance_id?: string | null
          metadata?: Json
          performed_by?: string | null
          reason?: string | null
          to_status?: string | null
        }
        Update: {
          action?: string
          applicant_id?: string | null
          contractor_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          insurance_id?: string | null
          metadata?: Json
          performed_by?: string | null
          reason?: string | null
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "insurance_audit_log_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "applicants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insurance_audit_log_insurance_id_fkey"
            columns: ["insurance_id"]
            isOneToOne: false
            referencedRelation: "contractor_insurance"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_providers: {
        Row: {
          created_at: string
          disclosure_text: string | null
          display_name: string
          display_order: number
          embed_supported: boolean
          embed_url: string | null
          enabled: boolean
          id: string
          integration_type: string
          is_preferred: boolean
          provider_key: string
          provider_type: string
          referral_url: string | null
          supported_service_categories: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          disclosure_text?: string | null
          display_name: string
          display_order?: number
          embed_supported?: boolean
          embed_url?: string | null
          enabled?: boolean
          id?: string
          integration_type?: string
          is_preferred?: boolean
          provider_key: string
          provider_type?: string
          referral_url?: string | null
          supported_service_categories?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          disclosure_text?: string | null
          display_name?: string
          display_order?: number
          embed_supported?: boolean
          embed_url?: string | null
          enabled?: boolean
          id?: string
          integration_type?: string
          is_preferred?: boolean
          provider_key?: string
          provider_type?: string
          referral_url?: string | null
          supported_service_categories?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      insurance_requirements: {
        Row: {
          accepted_policy_types: string[]
          additional_insured_required: boolean
          aggregate_limit_cents: number
          created_at: string
          enabled: boolean
          id: string
          manual_verification_required: boolean
          per_occurrence_limit_cents: number
          reminder_days: number[]
          service_category: string
          updated_at: string
        }
        Insert: {
          accepted_policy_types?: string[]
          additional_insured_required?: boolean
          aggregate_limit_cents?: number
          created_at?: string
          enabled?: boolean
          id?: string
          manual_verification_required?: boolean
          per_occurrence_limit_cents?: number
          reminder_days?: number[]
          service_category: string
          updated_at?: string
        }
        Update: {
          accepted_policy_types?: string[]
          additional_insured_required?: boolean
          aggregate_limit_cents?: number
          created_at?: string
          enabled?: boolean
          id?: string
          manual_verification_required?: boolean
          per_occurrence_limit_cents?: number
          reminder_days?: number[]
          service_category?: string
          updated_at?: string
        }
        Relationships: []
      }
      integration_logs: {
        Row: {
          created_at: string
          detail: Json | null
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
          detail?: Json | null
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
          detail?: Json | null
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
      intent_adjustments: {
        Row: {
          applicant_id: string
          created_at: string
          created_by: string | null
          delta: number
          id: string
          reason: string
        }
        Insert: {
          applicant_id: string
          created_at?: string
          created_by?: string | null
          delta: number
          id?: string
          reason: string
        }
        Update: {
          applicant_id?: string
          created_at?: string
          created_by?: string | null
          delta?: number
          id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "intent_adjustments_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "applicants"
            referencedColumns: ["id"]
          },
        ]
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
      job_listing_templates: {
        Row: {
          body: string
          service: string
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          service: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          service?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      jobber_webhook_log: {
        Row: {
          contractor_id: string | null
          created_at: string
          error_message: string | null
          event_type: string
          id: string
          jobber_visit_id: string | null
          payload: Json
          processed_at: string | null
          signature_valid: boolean | null
        }
        Insert: {
          contractor_id?: string | null
          created_at?: string
          error_message?: string | null
          event_type: string
          id?: string
          jobber_visit_id?: string | null
          payload: Json
          processed_at?: string | null
          signature_valid?: boolean | null
        }
        Update: {
          contractor_id?: string | null
          created_at?: string
          error_message?: string | null
          event_type?: string
          id?: string
          jobber_visit_id?: string | null
          payload?: Json
          processed_at?: string | null
          signature_valid?: boolean | null
        }
        Relationships: []
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
      kpi_constant: {
        Row: {
          churn_target: number
          cost_per_hanger: number
          cust_per_5k: number
          doors_33156: number
          doors_33183: number
          doors_33186: number
          gp_sub: number
          hire_buffer_days: number
          hire_lead_days_detail: number
          hire_lead_days_house: number
          id: string
          max_hires_mo: number
          overhead_mo: number
          pay_sub: number
          rev_sub: number
          subs_per_pro: number
          target_y1_profit: number
          updated_at: string
        }
        Insert: {
          churn_target?: number
          cost_per_hanger?: number
          cust_per_5k?: number
          doors_33156?: number
          doors_33183?: number
          doors_33186?: number
          gp_sub?: number
          hire_buffer_days?: number
          hire_lead_days_detail?: number
          hire_lead_days_house?: number
          id?: string
          max_hires_mo?: number
          overhead_mo?: number
          pay_sub?: number
          rev_sub?: number
          subs_per_pro?: number
          target_y1_profit?: number
          updated_at?: string
        }
        Update: {
          churn_target?: number
          cost_per_hanger?: number
          cust_per_5k?: number
          doors_33156?: number
          doors_33183?: number
          doors_33186?: number
          gp_sub?: number
          hire_buffer_days?: number
          hire_lead_days_detail?: number
          hire_lead_days_house?: number
          id?: string
          max_hires_mo?: number
          overhead_mo?: number
          pay_sub?: number
          rev_sub?: number
          subs_per_pro?: number
          target_y1_profit?: number
          updated_at?: string
        }
        Relationships: []
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
      kpi_plan: {
        Row: {
          created_at: string
          cum_profit_planned: number
          gp_planned: number
          hangers_planned: number
          id: string
          marketing_spend_planned: number
          month_label: string
          plan_month: number
          pros_required: number
          subs_planned: number
        }
        Insert: {
          created_at?: string
          cum_profit_planned?: number
          gp_planned?: number
          hangers_planned?: number
          id?: string
          marketing_spend_planned?: number
          month_label: string
          plan_month: number
          pros_required?: number
          subs_planned?: number
        }
        Update: {
          created_at?: string
          cum_profit_planned?: number
          gp_planned?: number
          hangers_planned?: number
          id?: string
          marketing_spend_planned?: number
          month_label?: string
          plan_month?: number
          pros_required?: number
          subs_planned?: number
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
      kpi_snapshot: {
        Row: {
          captured_at: string
          computed_by: string
          id: string
          metrics: Json
          window: string | null
        }
        Insert: {
          captured_at?: string
          computed_by?: string
          id?: string
          metrics?: Json
          window?: string | null
        }
        Update: {
          captured_at?: string
          computed_by?: string
          id?: string
          metrics?: Json
          window?: string | null
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
      landing_touches: {
        Row: {
          created_at: string
          id: string
          landing_source: string
          lang: string | null
          path: string | null
          placement: string | null
          referrer: string | null
          route: string | null
          user_agent: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          zip: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          landing_source: string
          lang?: string | null
          path?: string | null
          placement?: string | null
          referrer?: string | null
          route?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          zip?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          landing_source?: string
          lang?: string | null
          path?: string | null
          placement?: string | null
          referrer?: string | null
          route?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          zip?: string | null
        }
        Relationships: []
      }
      launch_config: {
        Row: {
          car_launch_threshold: number | null
          car_proposed_at: string | null
          car_proposed_conversion: string | null
          car_proposed_first_visit: string | null
          car_proposed_for: string | null
          car_threshold_reached_at: string | null
          conversion_date: string | null
          est_full_day_pay: number | null
          first_visit_date: string | null
          hanger_drops: Json
          late_first_visit_week: string | null
          pro_callback_date: string | null
          pro_ready_by: string | null
          scope: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          car_launch_threshold?: number | null
          car_proposed_at?: string | null
          car_proposed_conversion?: string | null
          car_proposed_first_visit?: string | null
          car_proposed_for?: string | null
          car_threshold_reached_at?: string | null
          conversion_date?: string | null
          est_full_day_pay?: number | null
          first_visit_date?: string | null
          hanger_drops?: Json
          late_first_visit_week?: string | null
          pro_callback_date?: string | null
          pro_ready_by?: string | null
          scope: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          car_launch_threshold?: number | null
          car_proposed_at?: string | null
          car_proposed_conversion?: string | null
          car_proposed_first_visit?: string | null
          car_proposed_for?: string | null
          car_threshold_reached_at?: string | null
          conversion_date?: string | null
          est_full_day_pay?: number | null
          first_visit_date?: string | null
          hanger_drops?: Json
          late_first_visit_week?: string | null
          pro_callback_date?: string | null
          pro_ready_by?: string | null
          scope?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      launch_config_log: {
        Row: {
          changed_at: string
          changed_by: string | null
          field: string
          id: string
          new_value: string | null
          old_value: string | null
          scope: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          field: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          scope: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          field?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          scope?: string
        }
        Relationships: []
      }
      lawn_plan_changes: {
        Row: {
          applied_at: string | null
          apply_error: string | null
          cadence: string
          confirm_token: string | null
          confirmed_at: string | null
          created_at: string
          id: string
          kind: string
          lookup_key: string | null
          measured_sqft: number | null
          new_monthly_cents: number | null
          note: string | null
          old_monthly_cents: number | null
          rate_card_version: number | null
          selected_size: string
          source: string
          status: string
          subscription_id: string
          user_id: string
          verified_at: string | null
          verified_by: string | null
          verified_size: string | null
          visit_id: string | null
        }
        Insert: {
          applied_at?: string | null
          apply_error?: string | null
          cadence: string
          confirm_token?: string | null
          confirmed_at?: string | null
          created_at?: string
          id?: string
          kind: string
          lookup_key?: string | null
          measured_sqft?: number | null
          new_monthly_cents?: number | null
          note?: string | null
          old_monthly_cents?: number | null
          rate_card_version?: number | null
          selected_size: string
          source?: string
          status?: string
          subscription_id: string
          user_id: string
          verified_at?: string | null
          verified_by?: string | null
          verified_size?: string | null
          visit_id?: string | null
        }
        Update: {
          applied_at?: string | null
          apply_error?: string | null
          cadence?: string
          confirm_token?: string | null
          confirmed_at?: string | null
          created_at?: string
          id?: string
          kind?: string
          lookup_key?: string | null
          measured_sqft?: number | null
          new_monthly_cents?: number | null
          note?: string | null
          old_monthly_cents?: number | null
          rate_card_version?: number | null
          selected_size?: string
          source?: string
          status?: string
          subscription_id?: string
          user_id?: string
          verified_at?: string | null
          verified_by?: string | null
          verified_size?: string | null
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lawn_plan_changes_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      lawn_plan_notices: {
        Row: {
          body: string
          change_id: string
          created_at: string
          email: string
          email_error: string | null
          email_status: string
          id: string
          kind: string
          sent_at: string | null
          subject: string
        }
        Insert: {
          body: string
          change_id: string
          created_at?: string
          email: string
          email_error?: string | null
          email_status?: string
          id?: string
          kind: string
          sent_at?: string | null
          subject: string
        }
        Update: {
          body?: string
          change_id?: string
          created_at?: string
          email?: string
          email_error?: string | null
          email_status?: string
          id?: string
          kind?: string
          sent_at?: string | null
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "lawn_plan_notices_change_id_fkey"
            columns: ["change_id"]
            isOneToOne: false
            referencedRelation: "lawn_plan_changes"
            referencedColumns: ["id"]
          },
        ]
      }
      lawn_size_notices: {
        Row: {
          body: string
          created_at: string
          email: string
          email_error: string | null
          email_status: string
          id: string
          kind: string
          reservation_id: string
          sent_at: string | null
          subject: string
        }
        Insert: {
          body: string
          created_at?: string
          email: string
          email_error?: string | null
          email_status?: string
          id?: string
          kind: string
          reservation_id: string
          sent_at?: string | null
          subject: string
        }
        Update: {
          body?: string
          created_at?: string
          email?: string
          email_error?: string | null
          email_status?: string
          id?: string
          kind?: string
          reservation_id?: string
          sent_at?: string | null
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "lawn_size_notices_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          created_at: string
          email: string
          first_name: string
          id: string
          last_name: string | null
          page_url: string | null
          phone: string
          sms_consent: boolean
          source: string
          user_agent: string | null
          zip: string
        }
        Insert: {
          created_at?: string
          email: string
          first_name: string
          id?: string
          last_name?: string | null
          page_url?: string | null
          phone: string
          sms_consent?: boolean
          source?: string
          user_agent?: string | null
          zip: string
        }
        Update: {
          created_at?: string
          email?: string
          first_name?: string
          id?: string
          last_name?: string | null
          page_url?: string | null
          phone?: string
          sms_consent?: boolean
          source?: string
          user_agent?: string | null
          zip?: string
        }
        Relationships: []
      }
      legal_review_items: {
        Row: {
          created_at: string
          detail: string | null
          document_ref: string | null
          id: string
          resolved_at: string | null
          resolved_note: string | null
          status: string
          title: string
          trigger_note: string | null
        }
        Insert: {
          created_at?: string
          detail?: string | null
          document_ref?: string | null
          id?: string
          resolved_at?: string | null
          resolved_note?: string | null
          status?: string
          title: string
          trigger_note?: string | null
        }
        Update: {
          created_at?: string
          detail?: string | null
          document_ref?: string | null
          id?: string
          resolved_at?: string | null
          resolved_note?: string | null
          status?: string
          title?: string
          trigger_note?: string | null
        }
        Relationships: []
      }
      lifecycle_event_rules: {
        Row: {
          event: string
          label_en: string
          label_es: string
          live: boolean
          marketing: boolean
          stage: string | null
          templates: string[]
          urgent: boolean
        }
        Insert: {
          event: string
          label_en: string
          label_es: string
          live?: boolean
          marketing?: boolean
          stage?: string | null
          templates?: string[]
          urgent?: boolean
        }
        Update: {
          event?: string
          label_en?: string
          label_es?: string
          live?: boolean
          marketing?: boolean
          stage?: string | null
          templates?: string[]
          urgent?: boolean
        }
        Relationships: []
      }
      lifecycle_events: {
        Row: {
          contact_id: string
          created_at: string
          dedupe_key: string
          event: string
          id: string
          next_stage: string | null
          occurred_at: string
          prior_stage: string | null
          simulation_id: string | null
          tokens: Json
        }
        Insert: {
          contact_id: string
          created_at?: string
          dedupe_key: string
          event: string
          id?: string
          next_stage?: string | null
          occurred_at?: string
          prior_stage?: string | null
          simulation_id?: string | null
          tokens?: Json
        }
        Update: {
          contact_id?: string
          created_at?: string
          dedupe_key?: string
          event?: string
          id?: string
          next_stage?: string | null
          occurred_at?: string
          prior_stage?: string | null
          simulation_id?: string | null
          tokens?: Json
        }
        Relationships: [
          {
            foreignKeyName: "lifecycle_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lifecycle_events_event_fkey"
            columns: ["event"]
            isOneToOne: false
            referencedRelation: "lifecycle_event_rules"
            referencedColumns: ["event"]
          },
        ]
      }
      lifecycle_sequences: {
        Row: {
          active: boolean
          channel: string
          condition: Json | null
          created_at: string
          delay_minutes: number
          id: string
          marketing: boolean
          stage: string
          step_order: number
          template_key: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          channel: string
          condition?: Json | null
          created_at?: string
          delay_minutes?: number
          id?: string
          marketing?: boolean
          stage: string
          step_order: number
          template_key?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          channel?: string
          condition?: Json | null
          created_at?: string
          delay_minutes?: number
          id?: string
          marketing?: boolean
          stage?: string
          step_order?: number
          template_key?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      lifecycle_templates: {
        Row: {
          active: boolean
          body_en: string
          body_es: string | null
          channel: string
          created_at: string
          es_reviewed: boolean
          id: string
          key: string
          subject_en: string | null
          subject_es: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          body_en: string
          body_es?: string | null
          channel: string
          created_at?: string
          es_reviewed?: boolean
          id?: string
          key: string
          subject_en?: string | null
          subject_es?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          body_en?: string
          body_es?: string | null
          channel?: string
          created_at?: string
          es_reviewed?: boolean
          id?: string
          key?: string
          subject_en?: string | null
          subject_es?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      linkedin_publishing_control: {
        Row: {
          enabled: boolean
          id: boolean
          photo_test_id: string | null
          text_test_id: string | null
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          id?: boolean
          photo_test_id?: string | null
          text_test_id?: string | null
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          id?: boolean
          photo_test_id?: string | null
          text_test_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      member_asks: {
        Row: {
          acted_at: string | null
          created_at: string
          id: string
          is_test_row: boolean
          kind: string
          release_after: string
          seq: number
          status: string
          user_id: string
          visit_id: string | null
        }
        Insert: {
          acted_at?: string | null
          created_at?: string
          id?: string
          is_test_row?: boolean
          kind: string
          release_after: string
          seq?: number
          status?: string
          user_id: string
          visit_id?: string | null
        }
        Update: {
          acted_at?: string | null
          created_at?: string
          id?: string
          is_test_row?: boolean
          kind?: string
          release_after?: string
          seq?: number
          status?: string
          user_id?: string
          visit_id?: string | null
        }
        Relationships: []
      }
      member_credits: {
        Row: {
          amount_cents: number
          applied_at: string | null
          created_at: string
          id: string
          kind: string
          note: string | null
          status: string
          stripe_balance_transaction_id: string | null
          subscription_id: string | null
          user_id: string
          visit_id: string | null
        }
        Insert: {
          amount_cents: number
          applied_at?: string | null
          created_at?: string
          id?: string
          kind: string
          note?: string | null
          status?: string
          stripe_balance_transaction_id?: string | null
          subscription_id?: string | null
          user_id: string
          visit_id?: string | null
        }
        Update: {
          amount_cents?: number
          applied_at?: string | null
          created_at?: string
          id?: string
          kind?: string
          note?: string | null
          status?: string
          stripe_balance_transaction_id?: string | null
          subscription_id?: string | null
          user_id?: string
          visit_id?: string | null
        }
        Relationships: []
      }
      member_guide_acceptances: {
        Row: {
          accepted_at: string
          id: string
          ip: string | null
          language: string
          user_agent: string | null
          user_id: string
          version: string
          wording: string
        }
        Insert: {
          accepted_at?: string
          id?: string
          ip?: string | null
          language: string
          user_agent?: string | null
          user_id: string
          version: string
          wording: string
        }
        Update: {
          accepted_at?: string
          id?: string
          ip?: string | null
          language?: string
          user_agent?: string | null
          user_id?: string
          version?: string
          wording?: string
        }
        Relationships: []
      }
      member_notifications: {
        Row: {
          body: string
          created_at: string
          dedupe_key: string | null
          email_attempts: number
          email_error: string | null
          email_status: string
          id: string
          kind: string
          read_at: string | null
          related_entitlement_id: string | null
          related_visit_id: string | null
          title: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          dedupe_key?: string | null
          email_attempts?: number
          email_error?: string | null
          email_status?: string
          id?: string
          kind: string
          read_at?: string | null
          related_entitlement_id?: string | null
          related_visit_id?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          dedupe_key?: string | null
          email_attempts?: number
          email_error?: string | null
          email_status?: string
          id?: string
          kind?: string
          read_at?: string | null
          related_entitlement_id?: string | null
          related_visit_id?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      message_queue: {
        Row: {
          attempts: number
          channel: string
          contact_id: string
          created_at: string
          error: string | null
          event_id: string | null
          force_shadow: boolean
          id: string
          marketing: boolean
          provider_id: string | null
          queue_scope: string
          send_at: string
          sent_at: string | null
          simulation_id: string | null
          stage: string
          status: string
          step_order: number | null
          template_key: string | null
          tokens: Json
        }
        Insert: {
          attempts?: number
          channel: string
          contact_id: string
          created_at?: string
          error?: string | null
          event_id?: string | null
          force_shadow?: boolean
          id?: string
          marketing?: boolean
          provider_id?: string | null
          queue_scope?: string
          send_at: string
          sent_at?: string | null
          simulation_id?: string | null
          stage: string
          status?: string
          step_order?: number | null
          template_key?: string | null
          tokens?: Json
        }
        Update: {
          attempts?: number
          channel?: string
          contact_id?: string
          created_at?: string
          error?: string | null
          event_id?: string | null
          force_shadow?: boolean
          id?: string
          marketing?: boolean
          provider_id?: string | null
          queue_scope?: string
          send_at?: string
          sent_at?: string | null
          simulation_id?: string | null
          stage?: string
          status?: string
          step_order?: number | null
          template_key?: string | null
          tokens?: Json
        }
        Relationships: [
          {
            foreignKeyName: "message_queue_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_queue_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "lifecycle_events"
            referencedColumns: ["id"]
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
      notified_pro_preference: {
        Row: {
          customer_id: string
          id: string
          notified_at: string
          pro_id: string
          service: string | null
        }
        Insert: {
          customer_id: string
          id?: string
          notified_at?: string
          pro_id: string
          service?: string | null
        }
        Update: {
          customer_id?: string
          id?: string
          notified_at?: string
          pro_id?: string
          service?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notified_pro_preference_pro_id_fkey"
            columns: ["pro_id"]
            isOneToOne: false
            referencedRelation: "applicants"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_events: {
        Row: {
          applicant_id: string | null
          created_at: string
          event: string
          id: string
          metadata: Json
        }
        Insert: {
          applicant_id?: string | null
          created_at?: string
          event: string
          id?: string
          metadata?: Json
        }
        Update: {
          applicant_id?: string | null
          created_at?: string
          event?: string
          id?: string
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_events_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "applicants"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_module: {
        Row: {
          body_md: string
          id: string
          required: boolean
          section_number: number
          service_scope: string
          slug: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          body_md?: string
          id?: string
          required?: boolean
          section_number?: number
          service_scope?: string
          slug: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          body_md?: string
          id?: string
          required?: boolean
          section_number?: number
          service_scope?: string
          slug?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      onboarding_progress: {
        Row: {
          completed_at: string
          id: string
          module_slug: string
          pro_id: string
        }
        Insert: {
          completed_at?: string
          id?: string
          module_slug: string
          pro_id: string
        }
        Update: {
          completed_at?: string
          id?: string
          module_slug?: string
          pro_id?: string
        }
        Relationships: []
      }
      ops_agent_exceptions: {
        Row: {
          action_label: string | null
          action_url: string | null
          agent_key: string
          created_at: string
          dedupe_key: string | null
          detail: string | null
          id: string
          is_test: boolean
          resolution: string | null
          resolved_at: string | null
          run_id: string | null
          severity: string
          title: string
        }
        Insert: {
          action_label?: string | null
          action_url?: string | null
          agent_key: string
          created_at?: string
          dedupe_key?: string | null
          detail?: string | null
          id?: string
          is_test?: boolean
          resolution?: string | null
          resolved_at?: string | null
          run_id?: string | null
          severity?: string
          title: string
        }
        Update: {
          action_label?: string | null
          action_url?: string | null
          agent_key?: string
          created_at?: string
          dedupe_key?: string | null
          detail?: string | null
          id?: string
          is_test?: boolean
          resolution?: string | null
          resolved_at?: string | null
          run_id?: string | null
          severity?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "ops_agent_exceptions_agent_key_fkey"
            columns: ["agent_key"]
            isOneToOne: false
            referencedRelation: "ops_agents"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "ops_agent_exceptions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ops_agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      ops_agent_runs: {
        Row: {
          agent_key: string
          checked: number
          error: string | null
          exceptions: number
          finished_at: string | null
          id: string
          is_test: boolean
          log: Json
          started_at: string
          status: string
        }
        Insert: {
          agent_key: string
          checked?: number
          error?: string | null
          exceptions?: number
          finished_at?: string | null
          id?: string
          is_test?: boolean
          log?: Json
          started_at?: string
          status?: string
        }
        Update: {
          agent_key?: string
          checked?: number
          error?: string | null
          exceptions?: number
          finished_at?: string | null
          id?: string
          is_test?: boolean
          log?: Json
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ops_agent_runs_agent_key_fkey"
            columns: ["agent_key"]
            isOneToOne: false
            referencedRelation: "ops_agents"
            referencedColumns: ["key"]
          },
        ]
      }
      ops_agents: {
        Row: {
          cadence: string
          enabled: boolean
          key: string
          last_run_at: string | null
          last_status: string | null
          last_summary: string | null
          name: string
          sort: number
          updated_at: string
        }
        Insert: {
          cadence: string
          enabled?: boolean
          key: string
          last_run_at?: string | null
          last_status?: string | null
          last_summary?: string | null
          name: string
          sort?: number
          updated_at?: string
        }
        Update: {
          cadence?: string
          enabled?: boolean
          key?: string
          last_run_at?: string | null
          last_status?: string | null
          last_summary?: string | null
          name?: string
          sort?: number
          updated_at?: string
        }
        Relationships: []
      }
      orientation_attendees: {
        Row: {
          applicant_id: string
          attended: boolean
          id: string
          orientation_id: string
          registered_at: string
        }
        Insert: {
          applicant_id: string
          attended?: boolean
          id?: string
          orientation_id: string
          registered_at?: string
        }
        Update: {
          applicant_id?: string
          attended?: boolean
          id?: string
          orientation_id?: string
          registered_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orientation_attendees_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "applicants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orientation_attendees_orientation_id_fkey"
            columns: ["orientation_id"]
            isOneToOne: false
            referencedRelation: "orientations"
            referencedColumns: ["id"]
          },
        ]
      }
      orientations: {
        Row: {
          capacity: number
          created_at: string
          id: string
          location: string | null
          notes: string | null
          scheduled_at: string
          updated_at: string
        }
        Insert: {
          capacity?: number
          created_at?: string
          id?: string
          location?: string | null
          notes?: string | null
          scheduled_at: string
          updated_at?: string
        }
        Update: {
          capacity?: number
          created_at?: string
          id?: string
          location?: string | null
          notes?: string | null
          scheduled_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      page_visibility: {
        Row: {
          is_on: boolean
          path: string
          updated_at: string
          updated_by: string | null
          updated_by_email: string | null
        }
        Insert: {
          is_on?: boolean
          path: string
          updated_at?: string
          updated_by?: string | null
          updated_by_email?: string | null
        }
        Update: {
          is_on?: boolean
          path?: string
          updated_at?: string
          updated_by?: string | null
          updated_by_email?: string | null
        }
        Relationships: []
      }
      payout_weeks: {
        Row: {
          bonus_cents: number
          created_at: string
          id: string
          paid_at: string | null
          payout_date: string
          pro_id: string
          status: string
          visit_pay_cents: number
          week_end: string
          week_start: string
        }
        Insert: {
          bonus_cents?: number
          created_at?: string
          id?: string
          paid_at?: string | null
          payout_date: string
          pro_id: string
          status?: string
          visit_pay_cents?: number
          week_end: string
          week_start: string
        }
        Update: {
          bonus_cents?: number
          created_at?: string
          id?: string
          paid_at?: string | null
          payout_date?: string
          pro_id?: string
          status?: string
          visit_pay_cents?: number
          week_end?: string
          week_start?: string
        }
        Relationships: []
      }
      pipeline_equipment_items: {
        Row: {
          active: boolean
          id: string
          is_vehicle: boolean
          label_en: string
          label_es: string
          needs_video: boolean
          service: string
          sort: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          id?: string
          is_vehicle?: boolean
          label_en: string
          label_es: string
          needs_video?: boolean
          service: string
          sort?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          id?: string
          is_vehicle?: boolean
          label_en?: string
          label_es?: string
          needs_video?: boolean
          service?: string
          sort?: number
          updated_at?: string
        }
        Relationships: []
      }
      pipeline_probation_visits: {
        Row: {
          applicant_id: string
          completed_at: string
          n: number
          redo_at: string | null
          visit_id: string
        }
        Insert: {
          applicant_id: string
          completed_at?: string
          n: number
          redo_at?: string | null
          visit_id: string
        }
        Update: {
          applicant_id?: string
          completed_at?: string
          n?: number
          redo_at?: string | null
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_probation_visits_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "contractor_pipeline"
            referencedColumns: ["applicant_id"]
          },
        ]
      }
      pipeline_proof_items: {
        Row: {
          applicant_id: string
          mime: string | null
          reject_note: string | null
          reject_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          size_bytes: number | null
          slot: string
          status: string
          storage_path: string
          uploaded_at: string
        }
        Insert: {
          applicant_id: string
          mime?: string | null
          reject_note?: string | null
          reject_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          size_bytes?: number | null
          slot: string
          status?: string
          storage_path: string
          uploaded_at?: string
        }
        Update: {
          applicant_id?: string
          mime?: string | null
          reject_note?: string | null
          reject_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          size_bytes?: number | null
          slot?: string
          status?: string
          storage_path?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_proof_items_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "contractor_pipeline"
            referencedColumns: ["applicant_id"]
          },
        ]
      }
      plan_line_sets: {
        Row: {
          created_at: string
          id: string
          lines: Json
          source: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lines: Json
          source?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lines?: Json
          source?: string | null
          user_id?: string
        }
        Relationships: []
      }
      preferred_pro_changes: {
        Row: {
          changed_at: string
          customer_id: string
          from_pro_id: string | null
          id: string
          subscription_id: string | null
          to_pro_id: string | null
        }
        Insert: {
          changed_at?: string
          customer_id: string
          from_pro_id?: string | null
          id?: string
          subscription_id?: string | null
          to_pro_id?: string | null
        }
        Update: {
          changed_at?: string
          customer_id?: string
          from_pro_id?: string | null
          id?: string
          subscription_id?: string | null
          to_pro_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "preferred_pro_changes_from_pro_id_fkey"
            columns: ["from_pro_id"]
            isOneToOne: false
            referencedRelation: "applicants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preferred_pro_changes_to_pro_id_fkey"
            columns: ["to_pro_id"]
            isOneToOne: false
            referencedRelation: "applicants"
            referencedColumns: ["id"]
          },
        ]
      }
      price_migration_overrides: {
        Row: {
          consumed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          reason: string
          subscription_id: string
          target_version: number
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          reason: string
          subscription_id: string
          target_version: number
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          reason?: string
          subscription_id?: string
          target_version?: number
        }
        Relationships: []
      }
      pro_bonuses: {
        Row: {
          amount_cents: number
          blocked_reason: string | null
          bonus_type: string | null
          created_at: string
          created_by: string | null
          currency: string
          earned_at: string | null
          id: string
          member_display: string | null
          member_user_id: string | null
          month_key: string | null
          paid_at: string | null
          payout_week_id: string | null
          period: string
          pro_id: string
          reason: string
          related_visit_id: string | null
          review_id: string | null
          status: string
          stripe_transfer_id: string | null
        }
        Insert: {
          amount_cents: number
          blocked_reason?: string | null
          bonus_type?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          earned_at?: string | null
          id?: string
          member_display?: string | null
          member_user_id?: string | null
          month_key?: string | null
          paid_at?: string | null
          payout_week_id?: string | null
          period: string
          pro_id: string
          reason?: string
          related_visit_id?: string | null
          review_id?: string | null
          status?: string
          stripe_transfer_id?: string | null
        }
        Update: {
          amount_cents?: number
          blocked_reason?: string | null
          bonus_type?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          earned_at?: string | null
          id?: string
          member_display?: string | null
          member_user_id?: string | null
          month_key?: string | null
          paid_at?: string | null
          payout_week_id?: string | null
          period?: string
          pro_id?: string
          reason?: string
          related_visit_id?: string | null
          review_id?: string | null
          status?: string
          stripe_transfer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pro_bonuses_payout_week_id_fkey"
            columns: ["payout_week_id"]
            isOneToOne: false
            referencedRelation: "payout_weeks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pro_bonuses_pro_id_fkey"
            columns: ["pro_id"]
            isOneToOne: false
            referencedRelation: "applicants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pro_bonuses_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      pro_catchup_days: {
        Row: {
          pro_user_id: string
          updated_at: string
          weekday: number
        }
        Insert: {
          pro_user_id: string
          updated_at?: string
          weekday: number
        }
        Update: {
          pro_user_id?: string
          updated_at?: string
          weekday?: number
        }
        Relationships: []
      }
      pro_date_exceptions: {
        Row: {
          created_at: string
          id: string
          kind: string
          note: string | null
          off_date: string
          pro_user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          note?: string | null
          off_date: string
          pro_user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          note?: string | null
          off_date?: string
          pro_user_id?: string
        }
        Relationships: []
      }
      pro_day_claims: {
        Row: {
          activated_at: string | null
          created_at: string
          drop_effective: string | null
          drop_reason: string | null
          end_time: string
          ended_at: string | null
          hours_effective: string | null
          id: string
          pending_end: string | null
          pending_start: string | null
          pro_user_id: string
          service: Database["public"]["Enums"]["service_type"]
          start_time: string
          status: string
          weekday: number
          zip: string
        }
        Insert: {
          activated_at?: string | null
          created_at?: string
          drop_effective?: string | null
          drop_reason?: string | null
          end_time: string
          ended_at?: string | null
          hours_effective?: string | null
          id?: string
          pending_end?: string | null
          pending_start?: string | null
          pro_user_id: string
          service: Database["public"]["Enums"]["service_type"]
          start_time: string
          status?: string
          weekday: number
          zip: string
        }
        Update: {
          activated_at?: string | null
          created_at?: string
          drop_effective?: string | null
          drop_reason?: string | null
          end_time?: string
          ended_at?: string | null
          hours_effective?: string | null
          id?: string
          pending_end?: string | null
          pending_start?: string | null
          pro_user_id?: string
          service?: Database["public"]["Enums"]["service_type"]
          start_time?: string
          status?: string
          weekday?: number
          zip?: string
        }
        Relationships: []
      }
      pro_demand_crossings: {
        Row: {
          applicant_id: string
          booked_pct: number | null
          created_at: string
          id: string
          period: string
          preferred_by_count: number
        }
        Insert: {
          applicant_id: string
          booked_pct?: number | null
          created_at?: string
          id?: string
          period: string
          preferred_by_count?: number
        }
        Update: {
          applicant_id?: string
          booked_pct?: number | null
          created_at?: string
          id?: string
          period?: string
          preferred_by_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "pro_demand_crossings_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "applicants"
            referencedColumns: ["id"]
          },
        ]
      }
      pro_gps_tests: {
        Row: {
          accuracy_m: number | null
          created_at: string
          distance_m: number | null
          id: string
          lat: number
          lng: number
          pro_user_id: string
          result: string
          target_address: string | null
          target_lat: number | null
          target_lng: number | null
          user_agent: string | null
        }
        Insert: {
          accuracy_m?: number | null
          created_at?: string
          distance_m?: number | null
          id?: string
          lat: number
          lng: number
          pro_user_id: string
          result?: string
          target_address?: string | null
          target_lat?: number | null
          target_lng?: number | null
          user_agent?: string | null
        }
        Update: {
          accuracy_m?: number | null
          created_at?: string
          distance_m?: number | null
          id?: string
          lat?: number
          lng?: number
          pro_user_id?: string
          result?: string
          target_address?: string | null
          target_lat?: number | null
          target_lng?: number | null
          user_agent?: string | null
        }
        Relationships: []
      }
      pro_kit: {
        Row: {
          applicant_id: string | null
          auto_insurance: string | null
          badge_back: string | null
          badge_name: string | null
          badge_photo_path: string | null
          badge_photo_retake_reason: string | null
          badge_photo_reviewed_at: string | null
          badge_photo_status: string | null
          badge_photo_token: string | null
          badge_photo_uploaded_at: string | null
          cap: string | null
          checkr_cleared: string | null
          checkr_sent: string | null
          coi_checks: Json
          created_at: string
          cross_trained: boolean | null
          cross_which: string | null
          days: Json
          dl_expiry: string | null
          dl_number: string | null
          door_material: string | null
          email: string | null
          equip_confirmed: boolean | null
          equip_gap: string | null
          expected_delivery_date: string | null
          first_available: string | null
          home_zip: string | null
          hours: string | null
          ica_signed: string | null
          id: string
          ins_carrier: string | null
          ins_expiry: string | null
          ins_policy: string | null
          issued_by: string | null
          issued_date: string | null
          kit_done: Json
          kit_issued: Json
          kit_summary: string | null
          legal_name: string | null
          magnet_test: string | null
          magnets_opt_in: boolean | null
          mail_address: string | null
          max_drive: string | null
          mobile: string | null
          other_work: string | null
          polo_cut: string | null
          polo_size: string | null
          pro_confirm_email_sent_at: string | null
          pro_no: string | null
          service_line: string | null
          shirt_cut: string | null
          shirt_size: string | null
          status: string
          submitted_at: string | null
          tee_cut: string | null
          tee_size: string | null
          token: string
          token_expires_at: string | null
          vehicle: string | null
          vehicle_2: string | null
          vehicle_ad_signed_at: string | null
          vehicle_ad_signed_name: string | null
          vehicle_color: string | null
          vehicle_make: string | null
          vehicle_model: string | null
          vehicle_year: string | null
          vest_size: string | null
          visits_per_week: number | null
        }
        Insert: {
          applicant_id?: string | null
          auto_insurance?: string | null
          badge_back?: string | null
          badge_name?: string | null
          badge_photo_path?: string | null
          badge_photo_retake_reason?: string | null
          badge_photo_reviewed_at?: string | null
          badge_photo_status?: string | null
          badge_photo_token?: string | null
          badge_photo_uploaded_at?: string | null
          cap?: string | null
          checkr_cleared?: string | null
          checkr_sent?: string | null
          coi_checks?: Json
          created_at?: string
          cross_trained?: boolean | null
          cross_which?: string | null
          days?: Json
          dl_expiry?: string | null
          dl_number?: string | null
          door_material?: string | null
          email?: string | null
          equip_confirmed?: boolean | null
          equip_gap?: string | null
          expected_delivery_date?: string | null
          first_available?: string | null
          home_zip?: string | null
          hours?: string | null
          ica_signed?: string | null
          id?: string
          ins_carrier?: string | null
          ins_expiry?: string | null
          ins_policy?: string | null
          issued_by?: string | null
          issued_date?: string | null
          kit_done?: Json
          kit_issued?: Json
          kit_summary?: string | null
          legal_name?: string | null
          magnet_test?: string | null
          magnets_opt_in?: boolean | null
          mail_address?: string | null
          max_drive?: string | null
          mobile?: string | null
          other_work?: string | null
          polo_cut?: string | null
          polo_size?: string | null
          pro_confirm_email_sent_at?: string | null
          pro_no?: string | null
          service_line?: string | null
          shirt_cut?: string | null
          shirt_size?: string | null
          status?: string
          submitted_at?: string | null
          tee_cut?: string | null
          tee_size?: string | null
          token?: string
          token_expires_at?: string | null
          vehicle?: string | null
          vehicle_2?: string | null
          vehicle_ad_signed_at?: string | null
          vehicle_ad_signed_name?: string | null
          vehicle_color?: string | null
          vehicle_make?: string | null
          vehicle_model?: string | null
          vehicle_year?: string | null
          vest_size?: string | null
          visits_per_week?: number | null
        }
        Update: {
          applicant_id?: string | null
          auto_insurance?: string | null
          badge_back?: string | null
          badge_name?: string | null
          badge_photo_path?: string | null
          badge_photo_retake_reason?: string | null
          badge_photo_reviewed_at?: string | null
          badge_photo_status?: string | null
          badge_photo_token?: string | null
          badge_photo_uploaded_at?: string | null
          cap?: string | null
          checkr_cleared?: string | null
          checkr_sent?: string | null
          coi_checks?: Json
          created_at?: string
          cross_trained?: boolean | null
          cross_which?: string | null
          days?: Json
          dl_expiry?: string | null
          dl_number?: string | null
          door_material?: string | null
          email?: string | null
          equip_confirmed?: boolean | null
          equip_gap?: string | null
          expected_delivery_date?: string | null
          first_available?: string | null
          home_zip?: string | null
          hours?: string | null
          ica_signed?: string | null
          id?: string
          ins_carrier?: string | null
          ins_expiry?: string | null
          ins_policy?: string | null
          issued_by?: string | null
          issued_date?: string | null
          kit_done?: Json
          kit_issued?: Json
          kit_summary?: string | null
          legal_name?: string | null
          magnet_test?: string | null
          magnets_opt_in?: boolean | null
          mail_address?: string | null
          max_drive?: string | null
          mobile?: string | null
          other_work?: string | null
          polo_cut?: string | null
          polo_size?: string | null
          pro_confirm_email_sent_at?: string | null
          pro_no?: string | null
          service_line?: string | null
          shirt_cut?: string | null
          shirt_size?: string | null
          status?: string
          submitted_at?: string | null
          tee_cut?: string | null
          tee_size?: string | null
          token?: string
          token_expires_at?: string | null
          vehicle?: string | null
          vehicle_2?: string | null
          vehicle_ad_signed_at?: string | null
          vehicle_ad_signed_name?: string | null
          vehicle_color?: string | null
          vehicle_make?: string | null
          vehicle_model?: string | null
          vehicle_year?: string | null
          vest_size?: string | null
          visits_per_week?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pro_kit_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "applicants"
            referencedColumns: ["id"]
          },
        ]
      }
      pro_location_pings: {
        Row: {
          accuracy_m: number | null
          created_at: string
          distance_m: number | null
          id: string
          lat: number
          lng: number
          pro_user_id: string
          visit_id: string
        }
        Insert: {
          accuracy_m?: number | null
          created_at?: string
          distance_m?: number | null
          id?: string
          lat: number
          lng: number
          pro_user_id: string
          visit_id: string
        }
        Update: {
          accuracy_m?: number | null
          created_at?: string
          distance_m?: number | null
          id?: string
          lat?: number
          lng?: number
          pro_user_id?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pro_location_pings_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      pro_notification_claims: {
        Row: {
          contractor_id: string
          created_at: string
          id: string
          kind: string
          scope: string
        }
        Insert: {
          contractor_id: string
          created_at?: string
          id?: string
          kind: string
          scope: string
        }
        Update: {
          contractor_id?: string
          created_at?: string
          id?: string
          kind?: string
          scope?: string
        }
        Relationships: []
      }
      pro_notifications: {
        Row: {
          body: string | null
          context: Json
          contractor_id: string
          created_at: string
          id: string
          kind: string
          read_at: string | null
          title: string
          url: string | null
        }
        Insert: {
          body?: string | null
          context?: Json
          contractor_id: string
          created_at?: string
          id?: string
          kind: string
          read_at?: string | null
          title: string
          url?: string | null
        }
        Update: {
          body?: string | null
          context?: Json
          contractor_id?: string
          created_at?: string
          id?: string
          kind?: string
          read_at?: string | null
          title?: string
          url?: string | null
        }
        Relationships: []
      }
      pro_orientation_progress: {
        Row: {
          applicant_id: string
          completed_at: string | null
          id: string
          section_id: string
          started_at: string
        }
        Insert: {
          applicant_id: string
          completed_at?: string | null
          id?: string
          section_id: string
          started_at?: string
        }
        Update: {
          applicant_id?: string
          completed_at?: string | null
          id?: string
          section_id?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pro_orientation_progress_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "applicants"
            referencedColumns: ["id"]
          },
        ]
      }
      pro_praise: {
        Row: {
          applicant_id: string | null
          contractor_id: string | null
          created_at: string
          id: string
          is_test_row: boolean
          member_first_name: string | null
          message: string
          quote: string | null
          rating_id: string | null
          sms_status: string
          stars: number | null
          visit_id: string | null
        }
        Insert: {
          applicant_id?: string | null
          contractor_id?: string | null
          created_at?: string
          id?: string
          is_test_row?: boolean
          member_first_name?: string | null
          message: string
          quote?: string | null
          rating_id?: string | null
          sms_status?: string
          stars?: number | null
          visit_id?: string | null
        }
        Update: {
          applicant_id?: string | null
          contractor_id?: string | null
          created_at?: string
          id?: string
          is_test_row?: boolean
          member_first_name?: string | null
          message?: string
          quote?: string | null
          rating_id?: string | null
          sms_status?: string
          stars?: number | null
          visit_id?: string | null
        }
        Relationships: []
      }
      pro_push_outbox: {
        Row: {
          attempts: number
          body: string | null
          context: Json
          contractor_id: string
          created_at: string
          id: string
          idempotency_key: string
          kind: string
          last_error: string | null
          queued_reason: string
          release_after: string
          sent_at: string | null
          status: string
          title: string
          url: string | null
        }
        Insert: {
          attempts?: number
          body?: string | null
          context?: Json
          contractor_id: string
          created_at?: string
          id?: string
          idempotency_key: string
          kind: string
          last_error?: string | null
          queued_reason?: string
          release_after: string
          sent_at?: string | null
          status?: string
          title: string
          url?: string | null
        }
        Update: {
          attempts?: number
          body?: string | null
          context?: Json
          contractor_id?: string
          created_at?: string
          id?: string
          idempotency_key?: string
          kind?: string
          last_error?: string | null
          queued_reason?: string
          release_after?: string
          sent_at?: string | null
          status?: string
          title?: string
          url?: string | null
        }
        Relationships: []
      }
      pro_referrals: {
        Row: {
          blocked_reason: string | null
          bonus_cents: number
          bonus_paid_at: string | null
          completed_at: string | null
          created_at: string
          id: string
          referee_contractor_id: string | null
          referee_email: string | null
          referral_code: string
          referrer_contractor_id: string
          status: string
          stripe_transfer_id: string | null
        }
        Insert: {
          blocked_reason?: string | null
          bonus_cents?: number
          bonus_paid_at?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          referee_contractor_id?: string | null
          referee_email?: string | null
          referral_code: string
          referrer_contractor_id: string
          status?: string
          stripe_transfer_id?: string | null
        }
        Update: {
          blocked_reason?: string | null
          bonus_cents?: number
          bonus_paid_at?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          referee_contractor_id?: string | null
          referee_email?: string | null
          referral_code?: string
          referrer_contractor_id?: string
          status?: string
          stripe_transfer_id?: string | null
        }
        Relationships: []
      }
      pro_service_assignments: {
        Row: {
          active: boolean
          applicant_id: string | null
          contractor_id: string | null
          created_at: string
          id: string
          pro_name: string | null
          service: Database["public"]["Enums"]["service_type"]
          time_share: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          applicant_id?: string | null
          contractor_id?: string | null
          created_at?: string
          id?: string
          pro_name?: string | null
          service: Database["public"]["Enums"]["service_type"]
          time_share?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          applicant_id?: string | null
          contractor_id?: string | null
          created_at?: string
          id?: string
          pro_name?: string | null
          service?: Database["public"]["Enums"]["service_type"]
          time_share?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pro_service_assignments_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "applicants"
            referencedColumns: ["id"]
          },
        ]
      }
      pro_visit_checks: {
        Row: {
          checks: Json
          pro_id: string
          updated_at: string
          visit_id: string
        }
        Insert: {
          checks?: Json
          pro_id: string
          updated_at?: string
          visit_id: string
        }
        Update: {
          checks?: Json
          pro_id?: string
          updated_at?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pro_visit_checks_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      pro_visits: {
        Row: {
          addon_pay_cents: number
          amount_cents: number | null
          before_photos_count: number
          before_photos_uploaded_at: string | null
          cancellation_reason: string | null
          completed_at: string | null
          condition_flagged: boolean
          condition_note: string | null
          condition_photo_url: string | null
          contractor_id: string | null
          created_at: string
          customer_name: string | null
          customer_rating: number | null
          declined_addon_name: string | null
          id: string
          jobber_visit_id: string | null
          photos_count: number
          photos_expected: number
          scheduled_at: string | null
          service_type: string | null
          started_at: string | null
          status: string
        }
        Insert: {
          addon_pay_cents?: number
          amount_cents?: number | null
          before_photos_count?: number
          before_photos_uploaded_at?: string | null
          cancellation_reason?: string | null
          completed_at?: string | null
          condition_flagged?: boolean
          condition_note?: string | null
          condition_photo_url?: string | null
          contractor_id?: string | null
          created_at?: string
          customer_name?: string | null
          customer_rating?: number | null
          declined_addon_name?: string | null
          id?: string
          jobber_visit_id?: string | null
          photos_count?: number
          photos_expected?: number
          scheduled_at?: string | null
          service_type?: string | null
          started_at?: string | null
          status?: string
        }
        Update: {
          addon_pay_cents?: number
          amount_cents?: number | null
          before_photos_count?: number
          before_photos_uploaded_at?: string | null
          cancellation_reason?: string | null
          completed_at?: string | null
          condition_flagged?: boolean
          condition_note?: string | null
          condition_photo_url?: string | null
          contractor_id?: string | null
          created_at?: string
          customer_name?: string | null
          customer_rating?: number | null
          declined_addon_name?: string | null
          id?: string
          jobber_visit_id?: string | null
          photos_count?: number
          photos_expected?: number
          scheduled_at?: string | null
          service_type?: string | null
          started_at?: string | null
          status?: string
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
          gate_code_enc: string | null
          id: string
          language: string
          last_addon_attached_at: string | null
          last_name: string | null
          last_pv4_review_request_at: string | null
          parking_notes: string | null
          pets: string | null
          phone: string | null
          photo_reports_opt_in: boolean
          preferred_day: string | null
          preferred_time: string | null
          referral_code: string | null
          service_tier: string | null
          signup_source: string | null
          sms_opt_in: boolean
          sms_opt_out: boolean
          sms_preference: string
          special_instructions: string | null
          stripe_customer_id: string | null
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
          gate_code_enc?: string | null
          id?: string
          language?: string
          last_addon_attached_at?: string | null
          last_name?: string | null
          last_pv4_review_request_at?: string | null
          parking_notes?: string | null
          pets?: string | null
          phone?: string | null
          photo_reports_opt_in?: boolean
          preferred_day?: string | null
          preferred_time?: string | null
          referral_code?: string | null
          service_tier?: string | null
          signup_source?: string | null
          sms_opt_in?: boolean
          sms_opt_out?: boolean
          sms_preference?: string
          special_instructions?: string | null
          stripe_customer_id?: string | null
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
          gate_code_enc?: string | null
          id?: string
          language?: string
          last_addon_attached_at?: string | null
          last_name?: string | null
          last_pv4_review_request_at?: string | null
          parking_notes?: string | null
          pets?: string | null
          phone?: string | null
          photo_reports_opt_in?: boolean
          preferred_day?: string | null
          preferred_time?: string | null
          referral_code?: string | null
          service_tier?: string | null
          signup_source?: string | null
          sms_opt_in?: boolean
          sms_opt_out?: boolean
          sms_preference?: string
          special_instructions?: string | null
          stripe_customer_id?: string | null
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
      qr_scan: {
        Row: {
          campaign: string | null
          converted_paid: boolean
          converted_quote: boolean
          customer_id: string | null
          id: string
          placement: string | null
          scanned_at: string
          session_id: string | null
          user_agent: string | null
          variant: string | null
          zip: string | null
        }
        Insert: {
          campaign?: string | null
          converted_paid?: boolean
          converted_quote?: boolean
          customer_id?: string | null
          id?: string
          placement?: string | null
          scanned_at?: string
          session_id?: string | null
          user_agent?: string | null
          variant?: string | null
          zip?: string | null
        }
        Update: {
          campaign?: string | null
          converted_paid?: boolean
          converted_quote?: boolean
          customer_id?: string | null
          id?: string
          placement?: string | null
          scanned_at?: string
          session_id?: string | null
          user_agent?: string | null
          variant?: string | null
          zip?: string | null
        }
        Relationships: []
      }
      qr_scans: {
        Row: {
          created_at: string
          id: string
          lang: string | null
          parsed: boolean
          placement: string | null
          raw_code: string
          referrer: string | null
          route: string | null
          user_agent: string | null
          zip: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          lang?: string | null
          parsed?: boolean
          placement?: string | null
          raw_code: string
          referrer?: string | null
          route?: string | null
          user_agent?: string | null
          zip?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          lang?: string | null
          parsed?: boolean
          placement?: string | null
          raw_code?: string
          referrer?: string | null
          route?: string | null
          user_agent?: string | null
          zip?: string | null
        }
        Relationships: []
      }
      question_bank: {
        Row: {
          active: boolean
          anchors_key: string | null
          application_version: number
          core: boolean
          correct_answer: string | null
          created_at: string
          demo_able: boolean
          id: string
          key: string
          knockout: boolean
          label_en: string
          label_es: string
          options: Json | null
          required: boolean
          section: number
          service: string
          sort: number
          type: string
          updated_at: string
          weight: number
        }
        Insert: {
          active?: boolean
          anchors_key?: string | null
          application_version?: number
          core?: boolean
          correct_answer?: string | null
          created_at?: string
          demo_able?: boolean
          id?: string
          key: string
          knockout?: boolean
          label_en: string
          label_es: string
          options?: Json | null
          required?: boolean
          section: number
          service?: string
          sort?: number
          type: string
          updated_at?: string
          weight?: number
        }
        Update: {
          active?: boolean
          anchors_key?: string | null
          application_version?: number
          core?: boolean
          correct_answer?: string | null
          created_at?: string
          demo_able?: boolean
          id?: string
          key?: string
          knockout?: boolean
          label_en?: string
          label_es?: string
          options?: Json | null
          required?: boolean
          section?: number
          service?: string
          sort?: number
          type?: string
          updated_at?: string
          weight?: number
        }
        Relationships: []
      }
      rate_cards: {
        Row: {
          is_current: boolean
          label: string
          notes: string | null
          published_at: string
          version: number
        }
        Insert: {
          is_current?: boolean
          label: string
          notes?: string | null
          published_at?: string
          version: number
        }
        Update: {
          is_current?: boolean
          label?: string
          notes?: string | null
          published_at?: string
          version?: number
        }
        Relationships: []
      }
      rate_limit_hits: {
        Row: {
          bucket: string
          created_at: string
          id: number
          identifier: string
        }
        Insert: {
          bucket: string
          created_at?: string
          id?: number
          identifier: string
        }
        Update: {
          bucket?: string
          created_at?: string
          id?: number
          identifier?: string
        }
        Relationships: []
      }
      redo_requests: {
        Row: {
          admin_notes: string | null
          applicant_id: string | null
          created_at: string
          due_at: string
          id: string
          is_test_row: boolean
          missed_items: string[] | null
          note: string | null
          photo_path: string | null
          pro_id: string | null
          redo_visit_id: string | null
          requested_at: string
          resolved_at: string | null
          responsible_pro_id: string | null
          scheduled_at: string | null
          scheduled_for: string | null
          source: string
          status: string
          support_message_id: string | null
          user_id: string | null
          visit_id: string
        }
        Insert: {
          admin_notes?: string | null
          applicant_id?: string | null
          created_at?: string
          due_at?: string
          id?: string
          is_test_row?: boolean
          missed_items?: string[] | null
          note?: string | null
          photo_path?: string | null
          pro_id?: string | null
          redo_visit_id?: string | null
          requested_at?: string
          resolved_at?: string | null
          responsible_pro_id?: string | null
          scheduled_at?: string | null
          scheduled_for?: string | null
          source?: string
          status?: string
          support_message_id?: string | null
          user_id?: string | null
          visit_id: string
        }
        Update: {
          admin_notes?: string | null
          applicant_id?: string | null
          created_at?: string
          due_at?: string
          id?: string
          is_test_row?: boolean
          missed_items?: string[] | null
          note?: string | null
          photo_path?: string | null
          pro_id?: string | null
          redo_visit_id?: string | null
          requested_at?: string
          resolved_at?: string | null
          responsible_pro_id?: string | null
          scheduled_at?: string | null
          scheduled_for?: string | null
          source?: string
          status?: string
          support_message_id?: string | null
          user_id?: string | null
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "redo_requests_redo_visit_id_fkey"
            columns: ["redo_visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "redo_requests_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          converted_at: string | null
          created_at: string
          credit_cents: number
          credited_at: string | null
          error_message: string | null
          id: string
          referee_email: string | null
          referral_code: string | null
          referred_stripe_customer_id: string | null
          referred_user_id: string | null
          referrer_stripe_customer_id: string | null
          referrer_user_id: string
          status: string
          stripe_credit_id: string | null
        }
        Insert: {
          converted_at?: string | null
          created_at?: string
          credit_cents?: number
          credited_at?: string | null
          error_message?: string | null
          id?: string
          referee_email?: string | null
          referral_code?: string | null
          referred_stripe_customer_id?: string | null
          referred_user_id?: string | null
          referrer_stripe_customer_id?: string | null
          referrer_user_id: string
          status?: string
          stripe_credit_id?: string | null
        }
        Update: {
          converted_at?: string | null
          created_at?: string
          credit_cents?: number
          credited_at?: string | null
          error_message?: string | null
          id?: string
          referee_email?: string | null
          referral_code?: string | null
          referred_stripe_customer_id?: string | null
          referred_user_id?: string | null
          referrer_stripe_customer_id?: string | null
          referrer_user_id?: string
          status?: string
          stripe_credit_id?: string | null
        }
        Relationships: []
      }
      reschedule_items: {
        Row: {
          booking_id: string | null
          claim_id: string | null
          created_at: string
          dedupe_key: string | null
          details: Json
          id: string
          kind: string
          reason: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          visit_id: string | null
        }
        Insert: {
          booking_id?: string | null
          claim_id?: string | null
          created_at?: string
          dedupe_key?: string | null
          details?: Json
          id?: string
          kind: string
          reason: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          visit_id?: string | null
        }
        Update: {
          booking_id?: string | null
          claim_id?: string | null
          created_at?: string
          dedupe_key?: string | null
          details?: Json
          id?: string
          kind?: string
          reason?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          visit_id?: string | null
        }
        Relationships: []
      }
      reservations: {
        Row: {
          assigned_day: string | null
          assigned_pro_first_name: string | null
          assigned_window: string | null
          car_waiting: boolean
          city: string
          cleaning_bathrooms: number | null
          cleaning_confirm_token: string | null
          cleaning_confirmed_at: string | null
          cleaning_measured_sqft: number | null
          cleaning_new_monthly_cents: number | null
          cleaning_old_monthly_cents: number | null
          cleaning_selected_range: string | null
          cleaning_selected_size: string | null
          cleaning_size_confirmation: string | null
          cleaning_team_id: string | null
          cleaning_team_ready: boolean
          cleaning_verified_at: string | null
          cleaning_verified_bathrooms: number | null
          cleaning_verified_by: string | null
          cleaning_verified_size: string | null
          cleaning_walkthrough_slot_id: string | null
          converted_at: string | null
          created_at: string
          custom_quote: boolean
          email: string
          first_name: string
          founding: boolean
          founding_date: string | null
          founding_number: number | null
          founding_zip: string | null
          gift_addons: string[]
          heard_from: string
          heard_other: string | null
          id: string
          invite_token: string | null
          invited_at: string | null
          is_test_row: boolean
          lang: string
          last_name: string
          lawn_confirm_token: string | null
          lawn_confirmed_at: string | null
          lawn_measured_sqft: number | null
          lawn_new_monthly_cents: number | null
          lawn_old_monthly_cents: number | null
          lawn_selected_size: string | null
          lawn_size_confirmation: string | null
          lawn_size_variance: number | null
          lawn_verified_at: string | null
          lawn_verified_by: string | null
          lawn_verified_size: string | null
          lines: Json
          monthly_cents: number
          phone: string
          preferred_day: string
          preferred_time: string
          quote: Json
          rate_card_version: number | null
          scope_acceptance_ref: string | null
          services: string[]
          session_id: string | null
          sms_consent: boolean
          spigot_at_parking: boolean | null
          src: string | null
          status: string
          street: string
          subscription_id: string | null
          update_count: number
          updated_at: string
          user_id: string | null
          waitlist_services: string[]
          zip: string
        }
        Insert: {
          assigned_day?: string | null
          assigned_pro_first_name?: string | null
          assigned_window?: string | null
          car_waiting?: boolean
          city?: string
          cleaning_bathrooms?: number | null
          cleaning_confirm_token?: string | null
          cleaning_confirmed_at?: string | null
          cleaning_measured_sqft?: number | null
          cleaning_new_monthly_cents?: number | null
          cleaning_old_monthly_cents?: number | null
          cleaning_selected_range?: string | null
          cleaning_selected_size?: string | null
          cleaning_size_confirmation?: string | null
          cleaning_team_id?: string | null
          cleaning_team_ready?: boolean
          cleaning_verified_at?: string | null
          cleaning_verified_bathrooms?: number | null
          cleaning_verified_by?: string | null
          cleaning_verified_size?: string | null
          cleaning_walkthrough_slot_id?: string | null
          converted_at?: string | null
          created_at?: string
          custom_quote?: boolean
          email: string
          first_name: string
          founding?: boolean
          founding_date?: string | null
          founding_number?: number | null
          founding_zip?: string | null
          gift_addons?: string[]
          heard_from: string
          heard_other?: string | null
          id?: string
          invite_token?: string | null
          invited_at?: string | null
          is_test_row?: boolean
          lang?: string
          last_name?: string
          lawn_confirm_token?: string | null
          lawn_confirmed_at?: string | null
          lawn_measured_sqft?: number | null
          lawn_new_monthly_cents?: number | null
          lawn_old_monthly_cents?: number | null
          lawn_selected_size?: string | null
          lawn_size_confirmation?: string | null
          lawn_size_variance?: number | null
          lawn_verified_at?: string | null
          lawn_verified_by?: string | null
          lawn_verified_size?: string | null
          lines?: Json
          monthly_cents?: number
          phone: string
          preferred_day: string
          preferred_time: string
          quote?: Json
          rate_card_version?: number | null
          scope_acceptance_ref?: string | null
          services: string[]
          session_id?: string | null
          sms_consent?: boolean
          spigot_at_parking?: boolean | null
          src?: string | null
          status?: string
          street: string
          subscription_id?: string | null
          update_count?: number
          updated_at?: string
          user_id?: string | null
          waitlist_services?: string[]
          zip: string
        }
        Update: {
          assigned_day?: string | null
          assigned_pro_first_name?: string | null
          assigned_window?: string | null
          car_waiting?: boolean
          city?: string
          cleaning_bathrooms?: number | null
          cleaning_confirm_token?: string | null
          cleaning_confirmed_at?: string | null
          cleaning_measured_sqft?: number | null
          cleaning_new_monthly_cents?: number | null
          cleaning_old_monthly_cents?: number | null
          cleaning_selected_range?: string | null
          cleaning_selected_size?: string | null
          cleaning_size_confirmation?: string | null
          cleaning_team_id?: string | null
          cleaning_team_ready?: boolean
          cleaning_verified_at?: string | null
          cleaning_verified_bathrooms?: number | null
          cleaning_verified_by?: string | null
          cleaning_verified_size?: string | null
          cleaning_walkthrough_slot_id?: string | null
          converted_at?: string | null
          created_at?: string
          custom_quote?: boolean
          email?: string
          first_name?: string
          founding?: boolean
          founding_date?: string | null
          founding_number?: number | null
          founding_zip?: string | null
          gift_addons?: string[]
          heard_from?: string
          heard_other?: string | null
          id?: string
          invite_token?: string | null
          invited_at?: string | null
          is_test_row?: boolean
          lang?: string
          last_name?: string
          lawn_confirm_token?: string | null
          lawn_confirmed_at?: string | null
          lawn_measured_sqft?: number | null
          lawn_new_monthly_cents?: number | null
          lawn_old_monthly_cents?: number | null
          lawn_selected_size?: string | null
          lawn_size_confirmation?: string | null
          lawn_size_variance?: number | null
          lawn_verified_at?: string | null
          lawn_verified_by?: string | null
          lawn_verified_size?: string | null
          lines?: Json
          monthly_cents?: number
          phone?: string
          preferred_day?: string
          preferred_time?: string
          quote?: Json
          rate_card_version?: number | null
          scope_acceptance_ref?: string | null
          services?: string[]
          session_id?: string | null
          sms_consent?: boolean
          spigot_at_parking?: boolean | null
          src?: string | null
          status?: string
          street?: string
          subscription_id?: string | null
          update_count?: number
          updated_at?: string
          user_id?: string | null
          waitlist_services?: string[]
          zip?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservations_cleaning_team_id_fkey"
            columns: ["cleaning_team_id"]
            isOneToOne: false
            referencedRelation: "cleaning_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_cleaning_walkthrough_slot_id_fkey"
            columns: ["cleaning_walkthrough_slot_id"]
            isOneToOne: false
            referencedRelation: "cleaning_walkthrough_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      review_bonus_audit: {
        Row: {
          actor_user_id: string | null
          bonus_id: string | null
          checks: Json | null
          created_at: string
          id: string
          member_user_id: string | null
          outcome: string
          pro_id: string | null
          stars: number | null
        }
        Insert: {
          actor_user_id?: string | null
          bonus_id?: string | null
          checks?: Json | null
          created_at?: string
          id?: string
          member_user_id?: string | null
          outcome: string
          pro_id?: string | null
          stars?: number | null
        }
        Update: {
          actor_user_id?: string | null
          bonus_id?: string | null
          checks?: Json | null
          created_at?: string
          id?: string
          member_user_id?: string | null
          outcome?: string
          pro_id?: string | null
          stars?: number | null
        }
        Relationships: []
      }
      reviews: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          comment: string | null
          created_at: string
          external_review_id: string
          fetched_at: string
          fraud_flag: string | null
          id: string
          match_confidence: string
          match_debug: Json | null
          match_score: number | null
          matched_job_id: string | null
          matched_pro_id: string | null
          notes: string | null
          paid_at: string | null
          posted_at: string
          reviewer_name: string | null
          source: string
          stars: number
          status: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          comment?: string | null
          created_at?: string
          external_review_id: string
          fetched_at?: string
          fraud_flag?: string | null
          id?: string
          match_confidence?: string
          match_debug?: Json | null
          match_score?: number | null
          matched_job_id?: string | null
          matched_pro_id?: string | null
          notes?: string | null
          paid_at?: string | null
          posted_at: string
          reviewer_name?: string | null
          source?: string
          stars: number
          status?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          comment?: string | null
          created_at?: string
          external_review_id?: string
          fetched_at?: string
          fraud_flag?: string | null
          id?: string
          match_confidence?: string
          match_debug?: Json | null
          match_score?: number | null
          matched_job_id?: string | null
          matched_pro_id?: string | null
          notes?: string | null
          paid_at?: string | null
          posted_at?: string
          reviewer_name?: string | null
          source?: string
          stars?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_matched_pro_id_fkey"
            columns: ["matched_pro_id"]
            isOneToOne: false
            referencedRelation: "applicants"
            referencedColumns: ["id"]
          },
        ]
      }
      roadmap_events: {
        Row: {
          actor: string | null
          created_at: string
          detail: string | null
          id: string
          initiative_id: string | null
          kind: string
        }
        Insert: {
          actor?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          initiative_id?: string | null
          kind: string
        }
        Update: {
          actor?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          initiative_id?: string | null
          kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "roadmap_events_initiative_id_fkey"
            columns: ["initiative_id"]
            isOneToOne: false
            referencedRelation: "roadmap_initiatives"
            referencedColumns: ["id"]
          },
        ]
      }
      roadmap_initiatives: {
        Row: {
          build_prompt: string | null
          created_at: string
          extra_dates: string[]
          gate_description: string
          gate_note: string | null
          gate_passed: boolean
          id: string
          is_template: boolean
          kickoff_sent_at: string | null
          launch_checked_on: string | null
          launch_date: string
          launched_at: string | null
          name: string
          slug: string
          sort: number
          status: string
          summary: string | null
          switch_key: string
          switch_on: boolean
          updated_at: string
        }
        Insert: {
          build_prompt?: string | null
          created_at?: string
          extra_dates?: string[]
          gate_description?: string
          gate_note?: string | null
          gate_passed?: boolean
          id?: string
          is_template?: boolean
          kickoff_sent_at?: string | null
          launch_checked_on?: string | null
          launch_date: string
          launched_at?: string | null
          name: string
          slug: string
          sort?: number
          status?: string
          summary?: string | null
          switch_key: string
          switch_on?: boolean
          updated_at?: string
        }
        Update: {
          build_prompt?: string | null
          created_at?: string
          extra_dates?: string[]
          gate_description?: string
          gate_note?: string | null
          gate_passed?: boolean
          id?: string
          is_template?: boolean
          kickoff_sent_at?: string | null
          launch_checked_on?: string | null
          launch_date?: string
          launched_at?: string | null
          name?: string
          slug?: string
          sort?: number
          status?: string
          summary?: string | null
          switch_key?: string
          switch_on?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      roadmap_items: {
        Row: {
          created_at: string
          done: boolean
          done_at: string | null
          id: string
          initiative_id: string
          lead_days: number
          note: string | null
          owner: string
          sort: number
          task: string
        }
        Insert: {
          created_at?: string
          done?: boolean
          done_at?: string | null
          id?: string
          initiative_id: string
          lead_days?: number
          note?: string | null
          owner?: string
          sort?: number
          task: string
        }
        Update: {
          created_at?: string
          done?: boolean
          done_at?: string | null
          id?: string
          initiative_id?: string
          lead_days?: number
          note?: string | null
          owner?: string
          sort?: number
          task?: string
        }
        Relationships: [
          {
            foreignKeyName: "roadmap_items_initiative_id_fkey"
            columns: ["initiative_id"]
            isOneToOne: false
            referencedRelation: "roadmap_initiatives"
            referencedColumns: ["id"]
          },
        ]
      }
      sched_blackouts: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          kind: string
          label: string | null
          off_date: string
          service: Database["public"]["Enums"]["service_type"] | null
          zip: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          label?: string | null
          off_date: string
          service?: Database["public"]["Enums"]["service_type"] | null
          zip?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          label?: string | null
          off_date?: string
          service?: Database["public"]["Enums"]["service_type"] | null
          zip?: string | null
        }
        Relationships: []
      }
      sched_budget_hours: {
        Row: {
          hours: number
          service: Database["public"]["Enums"]["service_type"]
          size_tier: number
          source_lookup_key: string | null
          synced_at: string | null
          visit_kind: string
        }
        Insert: {
          hours: number
          service: Database["public"]["Enums"]["service_type"]
          size_tier?: number
          source_lookup_key?: string | null
          synced_at?: string | null
          visit_kind: string
        }
        Update: {
          hours?: number
          service?: Database["public"]["Enums"]["service_type"]
          size_tier?: number
          source_lookup_key?: string | null
          synced_at?: string | null
          visit_kind?: string
        }
        Relationships: []
      }
      sched_config: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      sched_first_right: {
        Row: {
          expires_at: string
          id: string
          offered_at: string
          pro_user_id: string
          responded_at: string | null
          service: Database["public"]["Enums"]["service_type"]
          status: string
          weekday: number
          zip: string
        }
        Insert: {
          expires_at?: string
          id?: string
          offered_at?: string
          pro_user_id: string
          responded_at?: string | null
          service: Database["public"]["Enums"]["service_type"]
          status?: string
          weekday: number
          zip: string
        }
        Update: {
          expires_at?: string
          id?: string
          offered_at?: string
          pro_user_id?: string
          responded_at?: string | null
          service?: Database["public"]["Enums"]["service_type"]
          status?: string
          weekday?: number
          zip?: string
        }
        Relationships: []
      }
      sched_launch_calendar: {
        Row: {
          approved_at: string
          approved_by: string | null
          id: string
          service: Database["public"]["Enums"]["service_type"]
          weekday: number
          zip: string
        }
        Insert: {
          approved_at?: string
          approved_by?: string | null
          id?: string
          service: Database["public"]["Enums"]["service_type"]
          weekday: number
          zip: string
        }
        Update: {
          approved_at?: string
          approved_by?: string | null
          id?: string
          service?: Database["public"]["Enums"]["service_type"]
          weekday?: number
          zip?: string
        }
        Relationships: []
      }
      sched_notice_log: {
        Row: {
          created_at: string
          key: string
        }
        Insert: {
          created_at?: string
          key: string
        }
        Update: {
          created_at?: string
          key?: string
        }
        Relationships: []
      }
      sched_waitlist: {
        Row: {
          created_at: string
          founding_hold_until: string | null
          hold_lapsed_at: string | null
          hold_until: string | null
          hold_warned_at: string | null
          id: string
          kind: string
          offer_weekday: number | null
          offered_at: string | null
          service: Database["public"]["Enums"]["service_type"]
          status: string
          subscription_id: string | null
          user_id: string
          weekday: number | null
          window_key: string | null
          zip: string
        }
        Insert: {
          created_at?: string
          founding_hold_until?: string | null
          hold_lapsed_at?: string | null
          hold_until?: string | null
          hold_warned_at?: string | null
          id?: string
          kind: string
          offer_weekday?: number | null
          offered_at?: string | null
          service: Database["public"]["Enums"]["service_type"]
          status?: string
          subscription_id?: string | null
          user_id: string
          weekday?: number | null
          window_key?: string | null
          zip: string
        }
        Update: {
          created_at?: string
          founding_hold_until?: string | null
          hold_lapsed_at?: string | null
          hold_until?: string | null
          hold_warned_at?: string | null
          id?: string
          kind?: string
          offer_weekday?: number | null
          offered_at?: string | null
          service?: Database["public"]["Enums"]["service_type"]
          status?: string
          subscription_id?: string | null
          user_id?: string
          weekday?: number | null
          window_key?: string | null
          zip?: string
        }
        Relationships: []
      }
      scope_acceptances: {
        Row: {
          acceptance_ref: string
          accepted_at: string
          checkbox_text: string
          customer_id: string | null
          email: string | null
          id: string
          ip: string | null
          language: string
          scope_version: number
          service: string
          surface: string
          user_agent: string | null
          water_consent: boolean | null
        }
        Insert: {
          acceptance_ref: string
          accepted_at?: string
          checkbox_text: string
          customer_id?: string | null
          email?: string | null
          id?: string
          ip?: string | null
          language?: string
          scope_version: number
          service: string
          surface: string
          user_agent?: string | null
          water_consent?: boolean | null
        }
        Update: {
          acceptance_ref?: string
          accepted_at?: string
          checkbox_text?: string
          customer_id?: string | null
          email?: string | null
          id?: string
          ip?: string | null
          language?: string
          scope_version?: number
          service?: string
          surface?: string
          user_agent?: string | null
          water_consent?: boolean | null
        }
        Relationships: []
      }
      scope_versions: {
        Row: {
          change_note: string | null
          existing_members_from: string | null
          notice_sent_at: string | null
          published_at: string
          published_by: string | null
          scope_version: number
          service: string
        }
        Insert: {
          change_note?: string | null
          existing_members_from?: string | null
          notice_sent_at?: string | null
          published_at?: string
          published_by?: string | null
          scope_version: number
          service: string
        }
        Update: {
          change_note?: string | null
          existing_members_from?: string | null
          notice_sent_at?: string | null
          published_at?: string
          published_by?: string | null
          scope_version?: number
          service?: string
        }
        Relationships: []
      }
      sequence_email_queue: {
        Row: {
          applicant_id: string
          created_at: string
          due_at: string
          email_key: string
          id: string
          reason: string
          released_at: string | null
          result: string | null
        }
        Insert: {
          applicant_id: string
          created_at?: string
          due_at: string
          email_key: string
          id?: string
          reason: string
          released_at?: string | null
          result?: string | null
        }
        Update: {
          applicant_id?: string
          created_at?: string
          due_at?: string
          email_key?: string
          id?: string
          reason?: string
          released_at?: string | null
          result?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sequence_email_queue_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "applicants"
            referencedColumns: ["id"]
          },
        ]
      }
      service_days: {
        Row: {
          active: boolean
          close_effective: string | null
          closed_at: string | null
          created_at: string
          id: string
          opened_at: string
          service: Database["public"]["Enums"]["service_type"]
          weekday: number
          zip: string
        }
        Insert: {
          active?: boolean
          close_effective?: string | null
          closed_at?: string | null
          created_at?: string
          id?: string
          opened_at?: string
          service: Database["public"]["Enums"]["service_type"]
          weekday: number
          zip: string
        }
        Update: {
          active?: boolean
          close_effective?: string | null
          closed_at?: string | null
          created_at?: string
          id?: string
          opened_at?: string
          service?: Database["public"]["Enums"]["service_type"]
          weekday?: number
          zip?: string
        }
        Relationships: []
      }
      service_gates: {
        Row: {
          auto_mode: boolean
          business_policy_bound: boolean
          business_policy_doc_url: string | null
          business_policy_effective: string | null
          business_policy_expires: string | null
          business_policy_required: boolean
          go_live_scheduled_for: string | null
          is_live: boolean
          last_change_reason: string | null
          last_changed_at: string
          service: string
        }
        Insert: {
          auto_mode?: boolean
          business_policy_bound?: boolean
          business_policy_doc_url?: string | null
          business_policy_effective?: string | null
          business_policy_expires?: string | null
          business_policy_required?: boolean
          go_live_scheduled_for?: string | null
          is_live?: boolean
          last_change_reason?: string | null
          last_changed_at?: string
          service: string
        }
        Update: {
          auto_mode?: boolean
          business_policy_bound?: boolean
          business_policy_doc_url?: string | null
          business_policy_effective?: string | null
          business_policy_expires?: string | null
          business_policy_required?: boolean
          go_live_scheduled_for?: string | null
          is_live?: boolean
          last_change_reason?: string | null
          last_changed_at?: string
          service?: string
        }
        Relationships: []
      }
      service_scope: {
        Row: {
          active: boolean
          addon_key: string | null
          created_at: string
          group_en: string | null
          group_es: string | null
          id: string
          notice_key: string | null
          scope_version: number
          section: string
          service: string
          sort_order: number
          text_en: string
          text_es: string
        }
        Insert: {
          active?: boolean
          addon_key?: string | null
          created_at?: string
          group_en?: string | null
          group_es?: string | null
          id?: string
          notice_key?: string | null
          scope_version?: number
          section: string
          service: string
          sort_order?: number
          text_en: string
          text_es: string
        }
        Update: {
          active?: boolean
          addon_key?: string | null
          created_at?: string
          group_en?: string | null
          group_es?: string | null
          id?: string
          notice_key?: string | null
          scope_version?: number
          section?: string
          service?: string
          sort_order?: number
          text_en?: string
          text_es?: string
        }
        Relationships: []
      }
      site_google_reviews: {
        Row: {
          author_name: string
          author_photo_url: string | null
          created_at: string
          id: string
          is_published: boolean
          neighborhood: string | null
          rating: number
          review_date: string
          review_text: string
          review_url: string | null
          service: string | null
          verified_at: string
        }
        Insert: {
          author_name: string
          author_photo_url?: string | null
          created_at?: string
          id?: string
          is_published?: boolean
          neighborhood?: string | null
          rating: number
          review_date: string
          review_text: string
          review_url?: string | null
          service?: string | null
          verified_at?: string
        }
        Update: {
          author_name?: string
          author_photo_url?: string | null
          created_at?: string
          id?: string
          is_published?: boolean
          neighborhood?: string | null
          rating?: number
          review_date?: string
          review_text?: string
          review_url?: string | null
          service?: string | null
          verified_at?: string
        }
        Relationships: []
      }
      size_reviews: {
        Row: {
          admin_note: string | null
          booked_size: number | null
          created_at: string
          customer_responded_at: string | null
          id: string
          matches: boolean
          new_monthly_cents: number | null
          observed_bathrooms: number | null
          observed_bedrooms: number | null
          observed_plate: string | null
          observed_size: number | null
          observed_sq_ft: number | null
          observed_vehicle_class: string | null
          old_monthly_cents: number | null
          rate_card_version: number | null
          reviewed_at: string | null
          reviewed_by: string | null
          service: string
          status: string
          subscription_id: string | null
          user_id: string | null
          visit_id: string
        }
        Insert: {
          admin_note?: string | null
          booked_size?: number | null
          created_at?: string
          customer_responded_at?: string | null
          id?: string
          matches: boolean
          new_monthly_cents?: number | null
          observed_bathrooms?: number | null
          observed_bedrooms?: number | null
          observed_plate?: string | null
          observed_size?: number | null
          observed_sq_ft?: number | null
          observed_vehicle_class?: string | null
          old_monthly_cents?: number | null
          rate_card_version?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          service: string
          status?: string
          subscription_id?: string | null
          user_id?: string | null
          visit_id: string
        }
        Update: {
          admin_note?: string | null
          booked_size?: number | null
          created_at?: string
          customer_responded_at?: string | null
          id?: string
          matches?: boolean
          new_monthly_cents?: number | null
          observed_bathrooms?: number | null
          observed_bedrooms?: number | null
          observed_plate?: string | null
          observed_size?: number | null
          observed_sq_ft?: number | null
          observed_vehicle_class?: string | null
          old_monthly_cents?: number | null
          rate_card_version?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          service?: string
          status?: string
          subscription_id?: string | null
          user_id?: string | null
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "size_reviews_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: true
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_delivery_events: {
        Row: {
          created_at: string
          error_code: number | null
          error_message: string | null
          from_number: string | null
          id: string
          message_sid: string | null
          message_status: string | null
          messaging_service_sid: string | null
          raw: Json | null
          received_at: string
          to_number: string | null
        }
        Insert: {
          created_at?: string
          error_code?: number | null
          error_message?: string | null
          from_number?: string | null
          id?: string
          message_sid?: string | null
          message_status?: string | null
          messaging_service_sid?: string | null
          raw?: Json | null
          received_at?: string
          to_number?: string | null
        }
        Update: {
          created_at?: string
          error_code?: number | null
          error_message?: string | null
          from_number?: string | null
          id?: string
          message_sid?: string | null
          message_status?: string | null
          messaging_service_sid?: string | null
          raw?: Json | null
          received_at?: string
          to_number?: string | null
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
      sms_outbox: {
        Row: {
          attempts: number
          body: string | null
          content_sid: string | null
          content_variables: Json | null
          created_at: string
          expires_at: string | null
          id: string
          idempotency_key: string
          last_error: string | null
          queued_reason: string | null
          release_after: string
          sent_at: string | null
          status: string
          template_name: string | null
          to_phone_e164: string
          triggered_by: string | null
          twilio_sid: string | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          body?: string | null
          content_sid?: string | null
          content_variables?: Json | null
          created_at?: string
          expires_at?: string | null
          id?: string
          idempotency_key: string
          last_error?: string | null
          queued_reason?: string | null
          release_after?: string
          sent_at?: string | null
          status?: string
          template_name?: string | null
          to_phone_e164: string
          triggered_by?: string | null
          twilio_sid?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          body?: string | null
          content_sid?: string | null
          content_variables?: Json | null
          created_at?: string
          expires_at?: string | null
          id?: string
          idempotency_key?: string
          last_error?: string | null
          queued_reason?: string | null
          release_after?: string
          sent_at?: string | null
          status?: string
          template_name?: string | null
          to_phone_e164?: string
          triggered_by?: string | null
          twilio_sid?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      social_delivery_tokens: {
        Row: {
          created_at: string
          ledger_id: string
          token: string
        }
        Insert: {
          created_at?: string
          ledger_id: string
          token?: string
        }
        Update: {
          created_at?: string
          ledger_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_delivery_tokens_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: true
            referencedRelation: "social_publish_ledger"
            referencedColumns: ["id"]
          },
        ]
      }
      social_external_history: {
        Row: {
          caption: string
          content_hash: string
          image_file: string | null
          image_hash: string | null
          platform: string
          platform_post_id: string
          posted_at: string
        }
        Insert: {
          caption: string
          content_hash: string
          image_file?: string | null
          image_hash?: string | null
          platform: string
          platform_post_id: string
          posted_at: string
        }
        Update: {
          caption?: string
          content_hash?: string
          image_file?: string | null
          image_hash?: string | null
          platform?: string
          platform_post_id?: string
          posted_at?: string
        }
        Relationships: []
      }
      social_launch_posts: {
        Row: {
          anchor_type: string | null
          anchor_value: string | null
          archive_reason: string | null
          archived_at: string | null
          armed_at: string | null
          caption: string
          channel: string
          content_hash: string | null
          created_at: string
          drop_if_bumped: boolean
          external_post_id: string | null
          id: string
          image_filename: string | null
          image_flag: string | null
          image_hash: string | null
          image_subject: string | null
          image_url: string | null
          is_spare: boolean
          is_test: boolean
          linkedin_url: string | null
          linkedin_urn: string | null
          manual_schedule: boolean
          media_kind: string
          not_before: string
          notes: string | null
          original_scheduled_for: string | null
          post_number: number
          posted_at: string | null
          priority: number | null
          publish_error: string | null
          rendered_caption: string | null
          scheduled_for: string | null
          scheduled_in_native_tool_at: string | null
          source_key: string | null
          status: string
          template_copy: string | null
          theme: string | null
          title: string | null
          updated_at: string
          waiting_reason: string | null
        }
        Insert: {
          anchor_type?: string | null
          anchor_value?: string | null
          archive_reason?: string | null
          archived_at?: string | null
          armed_at?: string | null
          caption: string
          channel: string
          content_hash?: string | null
          created_at?: string
          drop_if_bumped?: boolean
          external_post_id?: string | null
          id?: string
          image_filename?: string | null
          image_flag?: string | null
          image_hash?: string | null
          image_subject?: string | null
          image_url?: string | null
          is_spare?: boolean
          is_test?: boolean
          linkedin_url?: string | null
          linkedin_urn?: string | null
          manual_schedule?: boolean
          media_kind?: string
          not_before?: string
          notes?: string | null
          original_scheduled_for?: string | null
          post_number: number
          posted_at?: string | null
          priority?: number | null
          publish_error?: string | null
          rendered_caption?: string | null
          scheduled_for?: string | null
          scheduled_in_native_tool_at?: string | null
          source_key?: string | null
          status?: string
          template_copy?: string | null
          theme?: string | null
          title?: string | null
          updated_at?: string
          waiting_reason?: string | null
        }
        Update: {
          anchor_type?: string | null
          anchor_value?: string | null
          archive_reason?: string | null
          archived_at?: string | null
          armed_at?: string | null
          caption?: string
          channel?: string
          content_hash?: string | null
          created_at?: string
          drop_if_bumped?: boolean
          external_post_id?: string | null
          id?: string
          image_filename?: string | null
          image_flag?: string | null
          image_hash?: string | null
          image_subject?: string | null
          image_url?: string | null
          is_spare?: boolean
          is_test?: boolean
          linkedin_url?: string | null
          linkedin_urn?: string | null
          manual_schedule?: boolean
          media_kind?: string
          not_before?: string
          notes?: string | null
          original_scheduled_for?: string | null
          post_number?: number
          posted_at?: string | null
          priority?: number | null
          publish_error?: string | null
          rendered_caption?: string | null
          scheduled_for?: string | null
          scheduled_in_native_tool_at?: string | null
          source_key?: string | null
          status?: string
          template_copy?: string | null
          theme?: string | null
          title?: string | null
          updated_at?: string
          waiting_reason?: string | null
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
          image_hash: string | null
          image_path: string
          image_paths: string[]
          image_url: string | null
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
          image_hash?: string | null
          image_path: string
          image_paths?: string[]
          image_url?: string | null
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
          image_hash?: string | null
          image_path?: string
          image_paths?: string[]
          image_url?: string | null
          posted_at?: string | null
          scheduled_at?: string
          status?: Database["public"]["Enums"]["social_post_status"]
          updated_at?: string
        }
        Relationships: []
      }
      social_publish_ledger: {
        Row: {
          caption: string
          confirmed_at: string | null
          content_hash: string
          created_at: string
          error: string | null
          id: string
          image_hash: string
          image_url: string
          is_test: boolean
          platform: string
          platform_post_id: string | null
          post_id: string
          post_url: string | null
          scheduled_for: string
          state: string
          webhook_accepted_at: string | null
          webhook_response: string | null
          webhook_status: number | null
        }
        Insert: {
          caption: string
          confirmed_at?: string | null
          content_hash: string
          created_at?: string
          error?: string | null
          id?: string
          image_hash: string
          image_url: string
          is_test?: boolean
          platform: string
          platform_post_id?: string | null
          post_id: string
          post_url?: string | null
          scheduled_for: string
          state?: string
          webhook_accepted_at?: string | null
          webhook_response?: string | null
          webhook_status?: number | null
        }
        Update: {
          caption?: string
          confirmed_at?: string | null
          content_hash?: string
          created_at?: string
          error?: string | null
          id?: string
          image_hash?: string
          image_url?: string
          is_test?: boolean
          platform?: string
          platform_post_id?: string | null
          post_id?: string
          post_url?: string | null
          scheduled_for?: string
          state?: string
          webhook_accepted_at?: string | null
          webhook_response?: string | null
          webhook_status?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "social_publish_ledger_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_launch_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_catalog: {
        Row: {
          active: boolean
          addon_name: string | null
          band: string | null
          billing_period: string
          bundle_discount_pct: number
          canon_key: string | null
          cleaning_size: number | null
          created_at: string
          description: string | null
          frequency:
            | Database["public"]["Enums"]["subscription_frequency"]
            | null
          id: string
          is_addon: boolean
          lookup_key: string | null
          per_visit: boolean
          price_cents: number
          quantity_rule: string | null
          rate_card_version: number
          service_type: Database["public"]["Enums"]["service_type"] | null
          size: number | null
          sort_order: number
          stripe_price_id: string
          stripe_price_id_test: string | null
          stripe_product_id: string | null
          unit: string | null
        }
        Insert: {
          active?: boolean
          addon_name?: string | null
          band?: string | null
          billing_period?: string
          bundle_discount_pct?: number
          canon_key?: string | null
          cleaning_size?: number | null
          created_at?: string
          description?: string | null
          frequency?:
            | Database["public"]["Enums"]["subscription_frequency"]
            | null
          id?: string
          is_addon?: boolean
          lookup_key?: string | null
          per_visit?: boolean
          price_cents: number
          quantity_rule?: string | null
          rate_card_version?: number
          service_type?: Database["public"]["Enums"]["service_type"] | null
          size?: number | null
          sort_order?: number
          stripe_price_id: string
          stripe_price_id_test?: string | null
          stripe_product_id?: string | null
          unit?: string | null
        }
        Update: {
          active?: boolean
          addon_name?: string | null
          band?: string | null
          billing_period?: string
          bundle_discount_pct?: number
          canon_key?: string | null
          cleaning_size?: number | null
          created_at?: string
          description?: string | null
          frequency?:
            | Database["public"]["Enums"]["subscription_frequency"]
            | null
          id?: string
          is_addon?: boolean
          lookup_key?: string | null
          per_visit?: boolean
          price_cents?: number
          quantity_rule?: string | null
          rate_card_version?: number
          service_type?: Database["public"]["Enums"]["service_type"] | null
          size?: number | null
          sort_order?: number
          stripe_price_id?: string
          stripe_price_id_test?: string | null
          stripe_product_id?: string | null
          unit?: string | null
        }
        Relationships: []
      }
      stripe_connect_pending: {
        Row: {
          applicant_id: string | null
          created_at: string
          error_message: string | null
          id: string
          onboarding_url: string | null
          role: string | null
          status: string
          stripe_account_id: string | null
          updated_at: string
        }
        Insert: {
          applicant_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          onboarding_url?: string | null
          role?: string | null
          status?: string
          stripe_account_id?: string | null
          updated_at?: string
        }
        Update: {
          applicant_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          onboarding_url?: string | null
          role?: string | null
          status?: string
          stripe_account_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stripe_connect_pending_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "applicants"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_events: {
        Row: {
          duration_ms: number | null
          error_message: string | null
          event_type: string
          id: string
          last_replay_at: string | null
          livemode: boolean
          payload_summary: Json
          processed_at: string | null
          received_at: string
          replay_count: number
          status: string
          stripe_event_id: string
        }
        Insert: {
          duration_ms?: number | null
          error_message?: string | null
          event_type: string
          id?: string
          last_replay_at?: string | null
          livemode?: boolean
          payload_summary?: Json
          processed_at?: string | null
          received_at?: string
          replay_count?: number
          status?: string
          stripe_event_id: string
        }
        Update: {
          duration_ms?: number | null
          error_message?: string | null
          event_type?: string
          id?: string
          last_replay_at?: string | null
          livemode?: boolean
          payload_summary?: Json
          processed_at?: string | null
          received_at?: string
          replay_count?: number
          status?: string
          stripe_event_id?: string
        }
        Relationships: []
      }
      stripe_payouts: {
        Row: {
          amount_cents: number
          contractor_id: string | null
          created_at: string
          currency: string
          id: string
          paid_at: string | null
          scheduled_at: string | null
          status: string
          stripe_transfer_id: string | null
          week_ending_date: string
        }
        Insert: {
          amount_cents: number
          contractor_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          paid_at?: string | null
          scheduled_at?: string | null
          status?: string
          stripe_transfer_id?: string | null
          week_ending_date: string
        }
        Update: {
          amount_cents?: number
          contractor_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          paid_at?: string | null
          scheduled_at?: string | null
          status?: string
          stripe_transfer_id?: string | null
          week_ending_date?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          annual_notice_sent_for: string | null
          assigned_pro_id: string | null
          band: string | null
          band_source: string | null
          band_verified_at: string | null
          billing_period: string
          bundle_discount_pct: number
          cadence: string | null
          cancel_at_period_end: boolean
          canceled_at: string | null
          car_service_code: string | null
          car_wash_key: string | null
          card_brand: string | null
          card_exp_month: number | null
          card_exp_year: number | null
          card_last4: string | null
          cleaning_team_id: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          founding_free_addon_first_visit: boolean
          founding_free_addon_fulfilled_at: string | null
          founding_grant_id: string | null
          founding_rate_locked: boolean
          founding_review_promised: boolean
          founding_zip: string | null
          free_addons_per_month: number
          free_car_washes_per_month: number
          frequency: Database["public"]["Enums"]["subscription_frequency"]
          has_electrical_outlet: boolean | null
          has_water_spigot: boolean | null
          id: string
          jobber_client_id: string | null
          jobber_job_ids: Json
          latest_invoice_attempt_count: number | null
          lawn_measured_sqft: number | null
          monthly_total_cents: number
          next_billing_date: string | null
          pause_collection: string | null
          paused_until: string | null
          plan_lines: Json
          preferred_pro_id: string | null
          rate_card_version: number | null
          services: Database["public"]["Enums"]["service_type"][]
          size: number | null
          size_tier: number | null
          sizes_json: Json | null
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id: string | null
          stripe_status: string | null
          stripe_subscription_id: string | null
          surcharge_applied: boolean
          surcharge_cents: number
          updated_at: string
          user_id: string
          washing_allowed: boolean | null
        }
        Insert: {
          annual_notice_sent_for?: string | null
          assigned_pro_id?: string | null
          band?: string | null
          band_source?: string | null
          band_verified_at?: string | null
          billing_period?: string
          bundle_discount_pct?: number
          cadence?: string | null
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          car_service_code?: string | null
          car_wash_key?: string | null
          card_brand?: string | null
          card_exp_month?: number | null
          card_exp_year?: number | null
          card_last4?: string | null
          cleaning_team_id?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          founding_free_addon_first_visit?: boolean
          founding_free_addon_fulfilled_at?: string | null
          founding_grant_id?: string | null
          founding_rate_locked?: boolean
          founding_review_promised?: boolean
          founding_zip?: string | null
          free_addons_per_month?: number
          free_car_washes_per_month?: number
          frequency?: Database["public"]["Enums"]["subscription_frequency"]
          has_electrical_outlet?: boolean | null
          has_water_spigot?: boolean | null
          id?: string
          jobber_client_id?: string | null
          jobber_job_ids?: Json
          latest_invoice_attempt_count?: number | null
          lawn_measured_sqft?: number | null
          monthly_total_cents?: number
          next_billing_date?: string | null
          pause_collection?: string | null
          paused_until?: string | null
          plan_lines?: Json
          preferred_pro_id?: string | null
          rate_card_version?: number | null
          services?: Database["public"]["Enums"]["service_type"][]
          size?: number | null
          size_tier?: number | null
          sizes_json?: Json | null
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_status?: string | null
          stripe_subscription_id?: string | null
          surcharge_applied?: boolean
          surcharge_cents?: number
          updated_at?: string
          user_id: string
          washing_allowed?: boolean | null
        }
        Update: {
          annual_notice_sent_for?: string | null
          assigned_pro_id?: string | null
          band?: string | null
          band_source?: string | null
          band_verified_at?: string | null
          billing_period?: string
          bundle_discount_pct?: number
          cadence?: string | null
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          car_service_code?: string | null
          car_wash_key?: string | null
          card_brand?: string | null
          card_exp_month?: number | null
          card_exp_year?: number | null
          card_last4?: string | null
          cleaning_team_id?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          founding_free_addon_first_visit?: boolean
          founding_free_addon_fulfilled_at?: string | null
          founding_grant_id?: string | null
          founding_rate_locked?: boolean
          founding_review_promised?: boolean
          founding_zip?: string | null
          free_addons_per_month?: number
          free_car_washes_per_month?: number
          frequency?: Database["public"]["Enums"]["subscription_frequency"]
          has_electrical_outlet?: boolean | null
          has_water_spigot?: boolean | null
          id?: string
          jobber_client_id?: string | null
          jobber_job_ids?: Json
          latest_invoice_attempt_count?: number | null
          lawn_measured_sqft?: number | null
          monthly_total_cents?: number
          next_billing_date?: string | null
          pause_collection?: string | null
          paused_until?: string | null
          plan_lines?: Json
          preferred_pro_id?: string | null
          rate_card_version?: number | null
          services?: Database["public"]["Enums"]["service_type"][]
          size?: number | null
          size_tier?: number | null
          sizes_json?: Json | null
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_status?: string | null
          stripe_subscription_id?: string | null
          surcharge_applied?: boolean
          surcharge_cents?: number
          updated_at?: string
          user_id?: string
          washing_allowed?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_cleaning_team_id_fkey"
            columns: ["cleaning_team_id"]
            isOneToOne: false
            referencedRelation: "cleaning_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_preferred_pro_id_fkey"
            columns: ["preferred_pro_id"]
            isOneToOne: false
            referencedRelation: "applicants"
            referencedColumns: ["id"]
          },
        ]
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
          pro_user_id: string | null
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
          pro_user_id?: string | null
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
          pro_user_id?: string | null
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
          visit_id: string | null
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
          visit_id?: string | null
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
          visit_id?: string | null
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
      tier_audit_log: {
        Row: {
          action: string
          applicant_id: string | null
          contractor_id: string | null
          created_at: string
          from_tier: string | null
          id: string
          performed_by: string | null
          reason: string | null
          to_tier: string | null
        }
        Insert: {
          action: string
          applicant_id?: string | null
          contractor_id?: string | null
          created_at?: string
          from_tier?: string | null
          id?: string
          performed_by?: string | null
          reason?: string | null
          to_tier?: string | null
        }
        Update: {
          action?: string
          applicant_id?: string | null
          contractor_id?: string | null
          created_at?: string
          from_tier?: string | null
          id?: string
          performed_by?: string | null
          reason?: string | null
          to_tier?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tier_audit_log_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "applicants"
            referencedColumns: ["id"]
          },
        ]
      }
      tier_offers: {
        Row: {
          accepted_at: string | null
          applicant_id: string | null
          brevo_template_id: number | null
          contractor_id: string
          created_at: string
          declined_at: string | null
          expires_at: string | null
          id: string
          notes: string | null
          offer_type: string
          sent_at: string
          sent_by: string | null
          status: string
        }
        Insert: {
          accepted_at?: string | null
          applicant_id?: string | null
          brevo_template_id?: number | null
          contractor_id: string
          created_at?: string
          declined_at?: string | null
          expires_at?: string | null
          id?: string
          notes?: string | null
          offer_type?: string
          sent_at?: string
          sent_by?: string | null
          status?: string
        }
        Update: {
          accepted_at?: string | null
          applicant_id?: string | null
          brevo_template_id?: number | null
          contractor_id?: string
          created_at?: string
          declined_at?: string | null
          expires_at?: string | null
          id?: string
          notes?: string | null
          offer_type?: string
          sent_at?: string
          sent_by?: string | null
          status?: string
        }
        Relationships: []
      }
      today_visits: {
        Row: {
          address_line1: string | null
          city: string | null
          contractor_id: string | null
          created_at: string
          customer_name: string | null
          distance_miles: number | null
          estimated_duration_minutes: number | null
          id: string
          jobber_visit_id: string | null
          scheduled_at: string
          service_type: string | null
          status: string
        }
        Insert: {
          address_line1?: string | null
          city?: string | null
          contractor_id?: string | null
          created_at?: string
          customer_name?: string | null
          distance_miles?: number | null
          estimated_duration_minutes?: number | null
          id?: string
          jobber_visit_id?: string | null
          scheduled_at: string
          service_type?: string | null
          status?: string
        }
        Update: {
          address_line1?: string | null
          city?: string | null
          contractor_id?: string | null
          created_at?: string
          customer_name?: string | null
          distance_miles?: number | null
          estimated_duration_minutes?: number | null
          id?: string
          jobber_visit_id?: string | null
          scheduled_at?: string
          service_type?: string | null
          status?: string
        }
        Relationships: []
      }
      unmatched_texts: {
        Row: {
          body: string
          created_at: string
          from_phone: string
          id: string
          twilio_sid: string | null
        }
        Insert: {
          body: string
          created_at?: string
          from_phone: string
          id?: string
          twilio_sid?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          from_phone?: string
          id?: string
          twilio_sid?: string | null
        }
        Relationships: []
      }
      user_consents: {
        Row: {
          created_at: string
          email: string | null
          granted: boolean
          id: string
          ip: string | null
          kind: string
          user_agent: string | null
          user_id: string | null
          version: string
          wording: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          granted?: boolean
          id?: string
          ip?: string | null
          kind: string
          user_agent?: string | null
          user_id?: string | null
          version: string
          wording: string
        }
        Update: {
          created_at?: string
          email?: string | null
          granted?: boolean
          id?: string
          ip?: string | null
          kind?: string
          user_agent?: string | null
          user_id?: string | null
          version?: string
          wording?: string
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
      visit_checklist_items: {
        Row: {
          checked_at: string | null
          id: string
          pro_id: string
          template_id: string
          visit_id: string
        }
        Insert: {
          checked_at?: string | null
          id?: string
          pro_id: string
          template_id: string
          visit_id: string
        }
        Update: {
          checked_at?: string | null
          id?: string
          pro_id?: string
          template_id?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_checklist_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_checklist_items_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      visit_moves: {
        Row: {
          created_at: string
          from_date: string | null
          id: string
          reason: string
          to_date: string | null
          visit_id: string
        }
        Insert: {
          created_at?: string
          from_date?: string | null
          id?: string
          reason: string
          to_date?: string | null
          visit_id: string
        }
        Update: {
          created_at?: string
          from_date?: string | null
          id?: string
          reason?: string
          to_date?: string | null
          visit_id?: string
        }
        Relationships: []
      }
      visit_photos: {
        Row: {
          id: string
          kind: string
          pro_id: string
          storage_path: string
          uploaded_at: string
          visit_id: string
        }
        Insert: {
          id?: string
          kind: string
          pro_id: string
          storage_path: string
          uploaded_at?: string
          visit_id: string
        }
        Update: {
          id?: string
          kind?: string
          pro_id?: string
          storage_path?: string
          uploaded_at?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_photos_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      visit_ratings: {
        Row: {
          admin_review_notes: string | null
          admin_review_status: string
          admin_reviewed_at: string | null
          comment: string | null
          contractor_id: string | null
          created_at: string
          customer_id: string | null
          excluded_from_average: boolean
          followup_token: string | null
          google_prompted: boolean
          id: string
          job_id: string | null
          lang: string
          needs_followup: boolean
          pro_visit_id: string | null
          rating: number
          raw_identifier: string | null
          resolution_notes: string | null
          resolved_at: string | null
          source: string
          stars: number | null
          team_partner_contractor_id: string | null
          user_agent: string | null
          user_id: string | null
          verified: boolean
          visit_id: string | null
        }
        Insert: {
          admin_review_notes?: string | null
          admin_review_status?: string
          admin_reviewed_at?: string | null
          comment?: string | null
          contractor_id?: string | null
          created_at?: string
          customer_id?: string | null
          excluded_from_average?: boolean
          followup_token?: string | null
          google_prompted?: boolean
          id?: string
          job_id?: string | null
          lang?: string
          needs_followup?: boolean
          pro_visit_id?: string | null
          rating: number
          raw_identifier?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          source?: string
          stars?: number | null
          team_partner_contractor_id?: string | null
          user_agent?: string | null
          user_id?: string | null
          verified?: boolean
          visit_id?: string | null
        }
        Update: {
          admin_review_notes?: string | null
          admin_review_status?: string
          admin_reviewed_at?: string | null
          comment?: string | null
          contractor_id?: string | null
          created_at?: string
          customer_id?: string | null
          excluded_from_average?: boolean
          followup_token?: string | null
          google_prompted?: boolean
          id?: string
          job_id?: string | null
          lang?: string
          needs_followup?: boolean
          pro_visit_id?: string | null
          rating?: number
          raw_identifier?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          source?: string
          stars?: number | null
          team_partner_contractor_id?: string | null
          user_agent?: string | null
          user_id?: string | null
          verified?: boolean
          visit_id?: string | null
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
          access_notes: string | null
          access_notes_enc: string | null
          address_lat: number | null
          address_lng: number | null
          anchor_date: string | null
          assigned_pro_id: string | null
          backup_pro_id: string | null
          base_visit_id: string | null
          booking_id: string | null
          budget_hours: number | null
          cadence: string | null
          check_in_at: string | null
          check_in_lat: number | null
          check_in_lng: number | null
          check_in_location_reason: string | null
          check_out_at: string | null
          check_out_lat: number | null
          check_out_lng: number | null
          check_out_location_reason: string | null
          claim_id: string | null
          cleaning_base_pay_cents: number | null
          cleaning_final_inspection_at: string | null
          cleaning_first_visit: boolean
          cleaning_team_id: string | null
          cleaning_zones: Json
          completed_at: string | null
          contractor_pay_cents: number | null
          created_at: string
          crew_name: string | null
          customer_first_name: string | null
          customer_told_at: string | null
          different_day: boolean
          gate_code: string | null
          gate_code_enc: string | null
          id: string
          is_redo: boolean
          is_sample: boolean
          jobber_job_id: string | null
          jobber_visit_id: string | null
          lifecycle_reason: string | null
          moved_from_date: string | null
          not_reached_note: string | null
          notes: string | null
          on_my_way_at: string | null
          outcome_reason: string | null
          paid_in_full_reason: string | null
          parking_notes: string | null
          pet_notes: string | null
          pro_loop_enabled: boolean
          rate_token: string | null
          redo_of_visit_id: string | null
          redo_request_id: string | null
          scheduled_end: string | null
          scheduled_start: string | null
          service: Database["public"]["Enums"]["service_type"]
          service_type: string | null
          size_tier: number | null
          status: Database["public"]["Enums"]["visit_status"]
          street: string | null
          subscription_id: string | null
          surcharge_applied: boolean
          teammate_missing_at: string | null
          time_window: string | null
          updated_at: string
          user_id: string
          visit_date: string
          visit_kind: string | null
          visit_outcome: string | null
          visit_pay_cents: number | null
          window_key: string | null
          zip: string | null
        }
        Insert: {
          access_notes?: string | null
          access_notes_enc?: string | null
          address_lat?: number | null
          address_lng?: number | null
          anchor_date?: string | null
          assigned_pro_id?: string | null
          backup_pro_id?: string | null
          base_visit_id?: string | null
          booking_id?: string | null
          budget_hours?: number | null
          cadence?: string | null
          check_in_at?: string | null
          check_in_lat?: number | null
          check_in_lng?: number | null
          check_in_location_reason?: string | null
          check_out_at?: string | null
          check_out_lat?: number | null
          check_out_lng?: number | null
          check_out_location_reason?: string | null
          claim_id?: string | null
          cleaning_base_pay_cents?: number | null
          cleaning_final_inspection_at?: string | null
          cleaning_first_visit?: boolean
          cleaning_team_id?: string | null
          cleaning_zones?: Json
          completed_at?: string | null
          contractor_pay_cents?: number | null
          created_at?: string
          crew_name?: string | null
          customer_first_name?: string | null
          customer_told_at?: string | null
          different_day?: boolean
          gate_code?: string | null
          gate_code_enc?: string | null
          id?: string
          is_redo?: boolean
          is_sample?: boolean
          jobber_job_id?: string | null
          jobber_visit_id?: string | null
          lifecycle_reason?: string | null
          moved_from_date?: string | null
          not_reached_note?: string | null
          notes?: string | null
          on_my_way_at?: string | null
          outcome_reason?: string | null
          paid_in_full_reason?: string | null
          parking_notes?: string | null
          pet_notes?: string | null
          pro_loop_enabled?: boolean
          rate_token?: string | null
          redo_of_visit_id?: string | null
          redo_request_id?: string | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          service: Database["public"]["Enums"]["service_type"]
          service_type?: string | null
          size_tier?: number | null
          status?: Database["public"]["Enums"]["visit_status"]
          street?: string | null
          subscription_id?: string | null
          surcharge_applied?: boolean
          teammate_missing_at?: string | null
          time_window?: string | null
          updated_at?: string
          user_id: string
          visit_date: string
          visit_kind?: string | null
          visit_outcome?: string | null
          visit_pay_cents?: number | null
          window_key?: string | null
          zip?: string | null
        }
        Update: {
          access_notes?: string | null
          access_notes_enc?: string | null
          address_lat?: number | null
          address_lng?: number | null
          anchor_date?: string | null
          assigned_pro_id?: string | null
          backup_pro_id?: string | null
          base_visit_id?: string | null
          booking_id?: string | null
          budget_hours?: number | null
          cadence?: string | null
          check_in_at?: string | null
          check_in_lat?: number | null
          check_in_lng?: number | null
          check_in_location_reason?: string | null
          check_out_at?: string | null
          check_out_lat?: number | null
          check_out_lng?: number | null
          check_out_location_reason?: string | null
          claim_id?: string | null
          cleaning_base_pay_cents?: number | null
          cleaning_final_inspection_at?: string | null
          cleaning_first_visit?: boolean
          cleaning_team_id?: string | null
          cleaning_zones?: Json
          completed_at?: string | null
          contractor_pay_cents?: number | null
          created_at?: string
          crew_name?: string | null
          customer_first_name?: string | null
          customer_told_at?: string | null
          different_day?: boolean
          gate_code?: string | null
          gate_code_enc?: string | null
          id?: string
          is_redo?: boolean
          is_sample?: boolean
          jobber_job_id?: string | null
          jobber_visit_id?: string | null
          lifecycle_reason?: string | null
          moved_from_date?: string | null
          not_reached_note?: string | null
          notes?: string | null
          on_my_way_at?: string | null
          outcome_reason?: string | null
          paid_in_full_reason?: string | null
          parking_notes?: string | null
          pet_notes?: string | null
          pro_loop_enabled?: boolean
          rate_token?: string | null
          redo_of_visit_id?: string | null
          redo_request_id?: string | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          service?: Database["public"]["Enums"]["service_type"]
          service_type?: string | null
          size_tier?: number | null
          status?: Database["public"]["Enums"]["visit_status"]
          street?: string | null
          subscription_id?: string | null
          surcharge_applied?: boolean
          teammate_missing_at?: string | null
          time_window?: string | null
          updated_at?: string
          user_id?: string
          visit_date?: string
          visit_kind?: string | null
          visit_outcome?: string | null
          visit_pay_cents?: number | null
          window_key?: string | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visits_cleaning_team_id_fkey"
            columns: ["cleaning_team_id"]
            isOneToOne: false
            referencedRelation: "cleaning_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_redo_of_visit_id_fkey"
            columns: ["redo_of_visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist: {
        Row: {
          address: string | null
          email: string
          id: string
          requested_at: string
          source: string
          zip: string
        }
        Insert: {
          address?: string | null
          email: string
          id?: string
          requested_at?: string
          source?: string
          zip: string
        }
        Update: {
          address?: string | null
          email?: string
          id?: string
          requested_at?: string
          source?: string
          zip?: string
        }
        Relationships: []
      }
      zap_cutover: {
        Row: {
          app_stage: string | null
          created_at: string
          cutover_date: string | null
          name: string
          notes: string | null
          replacement_note: string | null
          status: string
          updated_at: string
          zap_id: string
          zap_state: string
        }
        Insert: {
          app_stage?: string | null
          created_at?: string
          cutover_date?: string | null
          name: string
          notes?: string | null
          replacement_note?: string | null
          status?: string
          updated_at?: string
          zap_id: string
          zap_state?: string
        }
        Update: {
          app_stage?: string | null
          created_at?: string
          cutover_date?: string | null
          name?: string
          notes?: string | null
          replacement_note?: string | null
          status?: string
          updated_at?: string
          zap_id?: string
          zap_state?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      access_decrypt: { Args: { _cipher: string }; Returns: string }
      access_encrypt: { Args: { _plain: string }; Returns: string }
      active_founding_grant_for: {
        Args: { _user: string }
        Returns: {
          address_key: string
          cancel_reason: string | null
          cancelled_at: string | null
          email: string | null
          founding_number: number
          founding_zip: string
          granted_at: string
          id: string
          rate_card_version: number
          reservation_id: string | null
          seal_status: string
          seal_updated_at: string | null
          status: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "founding_grants"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_add_blackout: {
        Args: {
          _date: string
          _kind?: string
          _label: string
          _service?: Database["public"]["Enums"]["service_type"]
          _zip?: string
        }
        Returns: Json
      }
      admin_application_note: {
        Args: { _id: string; _note: string }
        Returns: undefined
      }
      admin_application_report: { Args: { _id: string }; Returns: Json }
      admin_approve_car_launch: { Args: never; Returns: Json }
      admin_approve_launch_calendar: { Args: { _rows: Json }; Returns: Json }
      admin_assign_customer_pro: {
        Args: { _applicant_id: string; _subscription_id: string }
        Returns: undefined
      }
      admin_bulk_rate_card_migration: {
        Args: { _reason: string; _target: number }
        Returns: {
          moved: number
          skipped_founding: number
        }[]
      }
      admin_cleaning_staff: {
        Args: { _reservation: string; _team: string }
        Returns: undefined
      }
      admin_cleaning_team: {
        Args: {
          _background?: boolean
          _helper?: string
          _insured?: boolean
          _kind: string
          _lead: string
          _partner?: string
        }
        Returns: string
      }
      admin_cleaning_team_options: {
        Args: never
        Returns: {
          name: string
          pro_id: string
        }[]
      }
      admin_cleaning_verify: {
        Args: { _baths: number; _reservation: string; _sqft: number }
        Returns: Json
      }
      admin_cron_health: {
        Args: never
        Returns: {
          active: boolean
          expected_interval_minutes: number
          jobid: number
          jobname: string
          last_message: string
          last_run_at: string
          last_status: string
          minutes_since: number
          schedule: string
          stale: boolean
        }[]
      }
      admin_demand_report: { Args: never; Returns: Json }
      admin_evidence_pack: {
        Args: { _email: string; _from: string; _to: string }
        Returns: Json
      }
      admin_founding_override: {
        Args: { _reason: string; _subscription: string; _target: number }
        Returns: string
      }
      admin_founding_registry: {
        Args: never
        Returns: {
          address: string
          current_zip: string
          email: string
          founding_number: number
          founding_zip: string
          grant_id: string
          granted_at: string
          monthly_cents: number
          name: string
          rate_card_version: number
          seal_status: string
          services: string[]
          status: string
        }[]
      }
      admin_get_jobber_refresh_token: { Args: never; Returns: string }
      admin_get_meta_secret: { Args: { _name: string }; Returns: string }
      admin_get_scheduler_paused: { Args: never; Returns: boolean }
      admin_get_service_role_key: { Args: never; Returns: string }
      admin_get_vapid_private: { Args: never; Returns: string }
      admin_get_vapid_public: { Args: never; Returns: string }
      admin_gift_cost_by_month: {
        Args: never
        Returns: {
          cost_cents: number
          gifts: number
          month: string
        }[]
      }
      admin_launch_proposal: { Args: never; Returns: Json }
      admin_lawn_plan_verify: {
        Args: { _change: string; _measured: number }
        Returns: Json
      }
      admin_lawn_verify: {
        Args: { _measured: number; _reservation: string }
        Returns: Json
      }
      admin_mark_candidate_texts_read: {
        Args: { _id: string; _through: string }
        Returns: number
      }
      admin_mark_seal: {
        Args: { _grant: string; _status: string }
        Returns: undefined
      }
      admin_mark_social_posted: {
        Args: { _external?: string; _id: string }
        Returns: undefined
      }
      admin_move_visit: {
        Args: {
          _date: string
          _reason: string
          _visit: string
          _window: string
        }
        Returns: Json
      }
      admin_onboarding_tokens: {
        Args: { _applicant_id: string; _regenerate?: boolean }
        Returns: Json
      }
      admin_pro_partner_status: { Args: { _applicant: string }; Returns: Json }
      admin_pro_push_status: {
        Args: never
        Returns: {
          applicant_id: string
          badge_status: string
          contractor_id: string
          devices: number
          first_name: string
          has_fallback_phone: boolean
          last_name: string
          last_push_device_at: string
          reachable: boolean
        }[]
      }
      admin_pro_tracker: { Args: { _date?: string }; Returns: Json }
      admin_publish_scope: {
        Args: { _note?: string; _rows: Json; _service: string }
        Returns: number
      }
      admin_remove_blackout: { Args: { _id: string }; Returns: undefined }
      admin_reschedule_list: { Args: never; Returns: Json }
      admin_resolve_reschedule: {
        Args: { _id: string; _note: string }
        Returns: undefined
      }
      admin_resolve_teammate_missing: {
        Args: {
          _backup_pro?: string
          _new_date?: string
          _resolution: string
          _visit: string
        }
        Returns: Json
      }
      admin_route_households: {
        Args: { _from: string; _to: string }
        Returns: {
          homes: number
          pro_id: string
          pro_name: string
          visit_date: string
          visits: number
        }[]
      }
      admin_sched_state: { Args: never; Returns: Json }
      admin_set_alert_tier: {
        Args: { _night_ok?: boolean; _rule: string; _tier: string }
        Returns: undefined
      }
      admin_set_car_threshold: { Args: { _n: number }; Returns: undefined }
      admin_set_jobber_refresh_token: {
        Args: { _token: string }
        Returns: undefined
      }
      admin_set_launch_config: {
        Args: { _field: string; _scope: string; _value: string }
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
      admin_set_service_day: {
        Args: {
          _active: boolean
          _service: Database["public"]["Enums"]["service_type"]
          _weekday: number
          _zip: string
        }
        Returns: Json
      }
      admin_set_service_role_key: { Args: { _key: string }; Returns: undefined }
      admin_set_site_live: { Args: { _live: boolean }; Returns: boolean }
      admin_set_vapid_secret: {
        Args: { _name: string; _value: string }
        Returns: undefined
      }
      admin_set_visit_pro: {
        Args: { _applicant_id: string; _visit_id: string }
        Returns: undefined
      }
      admin_size_review_notify: {
        Args: { _new_size: number; _note?: string; _review: string }
        Returns: Json
      }
      admin_storm_day: { Args: { _date: string; _zip: string }; Returns: Json }
      admin_unassigned_visits: {
        Args: never
        Returns: {
          customer_first_name: string
          id: string
          scheduled_start: string
          service_type: string
          street: string
          subscription_id: string
          zip: string
        }[]
      }
      admin_weather_day: {
        Args: {
          _date: string
          _service: Database["public"]["Enums"]["service_type"]
          _zip: string
        }
        Returns: Json
      }
      approve_review_bonus: {
        Args: {
          _member: string
          _pro: string
          _review_date: string
          _review_text: string
          _stars: number
        }
        Returns: Json
      }
      badge_photo_load: { Args: { _token: string }; Returns: Json }
      call_edge_function: {
        Args: { _fn: string; _payload: Json }
        Returns: undefined
      }
      capture_cron_health: { Args: never; Returns: number }
      car_launch_check: { Args: never; Returns: undefined }
      car_launch_propose_date: { Args: { _from: string }; Returns: string }
      car_launch_status: { Args: never; Returns: Json }
      car_reservation_count: { Args: never; Returns: number }
      car_wash_line: {
        Args: { _sub: string }
        Returns: {
          size: number
          washes: number
        }[]
      }
      change_badge_status: {
        Args: { _applicant_id: string; _new_status: string; _note?: string }
        Returns: undefined
      }
      choose_free_addon: {
        Args: { _addon_key: string; _entitlement: string; _visit: string }
        Returns: Json
      }
      claim_due_social_posts: {
        Args: { _limit?: number; _only?: string }
        Returns: {
          anchor_type: string | null
          anchor_value: string | null
          archive_reason: string | null
          archived_at: string | null
          armed_at: string | null
          caption: string
          channel: string
          content_hash: string | null
          created_at: string
          drop_if_bumped: boolean
          external_post_id: string | null
          id: string
          image_filename: string | null
          image_flag: string | null
          image_hash: string | null
          image_subject: string | null
          image_url: string | null
          is_spare: boolean
          is_test: boolean
          linkedin_url: string | null
          linkedin_urn: string | null
          manual_schedule: boolean
          media_kind: string
          not_before: string
          notes: string | null
          original_scheduled_for: string | null
          post_number: number
          posted_at: string | null
          priority: number | null
          publish_error: string | null
          rendered_caption: string | null
          scheduled_for: string | null
          scheduled_in_native_tool_at: string | null
          source_key: string | null
          status: string
          template_copy: string | null
          theme: string | null
          title: string | null
          updated_at: string
          waiting_reason: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "social_launch_posts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_pro_notification: {
        Args: { _contractor_id: string; _kind: string; _scope: string }
        Returns: boolean
      }
      cleaning_apply_verified_quote: {
        Args: { _reservation: string }
        Returns: undefined
      }
      cleaning_conversion_block: {
        Args: { r: Database["public"]["Tables"]["reservations"]["Row"] }
        Returns: string
      }
      cleaning_finish_details: {
        Args: { _inspection: boolean; _visit: string; _zones: Json }
        Returns: undefined
      }
      cleaning_pro_visit_pay: {
        Args: { _pro: string; _visit: string }
        Returns: number
      }
      cleaning_record_pay: { Args: { _visit: string }; Returns: number }
      cleaning_size_from_sqft: {
        Args: { _baths: number; _sqft: number }
        Returns: string
      }
      cleaning_size_offer: { Args: { _token: string }; Returns: Json }
      cleaning_size_respond: {
        Args: { _accept: boolean; _token: string }
        Returns: Json
      }
      cleaning_team_presence_record: {
        Args: {
          _action: string
          _lat: number
          _lng: number
          _pro: string
          _visit: string
        }
        Returns: undefined
      }
      cleaning_team_valid: { Args: { _team: string }; Returns: boolean }
      coi_token_load: { Args: { _token: string }; Returns: Json }
      contract_load: { Args: { _token: string }; Returns: Json }
      contractor_visit_pay_cents: {
        Args: {
          _cadence: string
          _service: string
          _size: number
          _surcharge?: boolean
          _tier?: string
          _visit_kind?: string
        }
        Returns: number
      }
      credit_payout_week: {
        Args: { _at: string; _cents: number; _pro: string }
        Returns: string
      }
      cron_expected_interval_minutes: {
        Args: { _schedule: string }
        Returns: number
      }
      cron_http_post: {
        Args: { _fn: string; _job_name: string; _payload?: Json }
        Returns: number
      }
      cron_manifest_diff: {
        Args: { _expected: Json }
        Returns: {
          detail: string
          job_name: string
          problem: string
        }[]
      }
      current_rate_card_version: { Args: never; Returns: number }
      current_scope_version: { Args: { _service: string }; Returns: number }
      current_user_admin: { Args: never; Returns: boolean }
      customer_assign_lawn_day: { Args: never; Returns: Json }
      customer_book_day: {
        Args: {
          _details?: Json
          _service: Database["public"]["Enums"]["service_type"]
          _weekday: number
          _window: string
        }
        Returns: Json
      }
      customer_day_options: {
        Args: { _service: Database["public"]["Enums"]["service_type"] }
        Returns: Json
      }
      customer_join_waitlist: {
        Args: {
          _service: Database["public"]["Enums"]["service_type"]
          _weekday?: number
        }
        Returns: Json
      }
      customer_move_visit: {
        Args: { _date: string; _visit: string }
        Returns: Json
      }
      customer_waitlist_join: {
        Args: {
          _service: Database["public"]["Enums"]["service_type"]
          _weekday?: number
          _window?: string
        }
        Returns: Json
      }
      customers_needing_attention: {
        Args: never
        Returns: {
          first_name: string
          last_name: string
          missing_pro: boolean
          monthly_total_cents: number
          preferred_pro_id: string
          retired_price: boolean
          subscription_id: string
          user_id: string
        }[]
      }
      dispatch_due_social_posts: { Args: never; Returns: number }
      ensure_referral_code: { Args: never; Returns: string }
      feature_enabled: { Args: { _key: string }; Returns: boolean }
      founding_address_key: {
        Args: { _street: string; _zip: string }
        Returns: string
      }
      founding_home_counts: {
        Args: never
        Returns: {
          cap: number
          homes: number
          zip: string
        }[]
      }
      founding_home_status: {
        Args: { _street: string; _zip: string }
        Returns: {
          already: boolean
          homes: number
        }[]
      }
      founding_spot_counts: {
        Args: never
        Returns: {
          cap: number
          reserved: number
          service: string
        }[]
      }
      founding_spots_left: { Args: { _zip: string }; Returns: number }
      gen_intake_token: { Args: never; Returns: string }
      gen_onboarding_token: { Args: never; Returns: string }
      generate_recurring_visits: {
        Args: { _horizon_days?: number; _subscription_id?: string }
        Returns: {
          out_created: number
          out_service: string
          out_subscription_id: string
        }[]
      }
      generate_referral_code: { Args: never; Returns: string }
      get_customer_preferred_pro_options: {
        Args: { p_user_id: string }
        Returns: {
          first_name: string
          high_demand: boolean
          last_name: string
          preferred_by_count: number
          pro_id: string
        }[]
      }
      get_page_visibility: { Args: never; Returns: Json }
      get_pro_addon_request_stats: {
        Args: never
        Returns: {
          applicant_id: string
          approval_rate: number
          approvals: number
          completed_visits: number
          contractor_id: string
          fleet_median_rate: number
          over_3x_median: boolean
          request_rate: number
          requests: number
        }[]
      }
      get_pro_capacity_stats: {
        Args: never
        Returns: {
          applicant_id: string
          booked_pct: number
          high_demand: boolean
          preferred_by_count: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      hire_ready_claim: {
        Args: { _job_id: string }
        Returns: {
          applicant_id: string
          archive_at: string
          campaign: string
          completed_at: string | null
          due_at: string
          email_status: string
          error: string | null
          finish_at: string
          id: string
          kind: string
          language: string
          requested_at: string | null
          service: string
          sms_status: string
          status: string
          twilio_sid: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "hire_ready_invite_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      hire_ready_tick: { Args: never; Returns: undefined }
      hiring_answer: { Args: { _id: string; _key: string }; Returns: Json }
      hiring_answer_num: {
        Args: { _id: string; _key: string }
        Returns: number
      }
      hiring_answer_text: {
        Args: { _id: string; _key: string }
        Returns: string
      }
      hiring_application_v6_tick: { Args: never; Returns: number }
      hiring_fit_report: { Args: { _id: string }; Returns: Json }
      hiring_reopen: { Args: { _applicant_id: string }; Returns: undefined }
      hiring_resolve_deadline: {
        Args: { _id: string; _kind: string }
        Returns: undefined
      }
      hiring_revive: { Args: { _id: string }; Returns: Json }
      hiring_seed_slots: { Args: never; Returns: number }
      hiring_set_deadline: {
        Args: { _due: string; _id: string; _kind: string; _nudge?: string }
        Returns: undefined
      }
      hiring_sprint_active: { Args: never; Returns: boolean }
      hiring_sprint_set: { Args: { _on: boolean }; Returns: Json }
      hiring_tick: { Args: never; Returns: number }
      inbox_message_visit: {
        Args: { _message_id: string }
        Returns: {
          body: string
          completed_at: string
          conversation_id: string
          message_id: string
          sent_at: string
          user_id: string
          visit_id: string
        }[]
      }
      inbox_redo_flags: {
        Args: never
        Returns: {
          conversation_id: string
          message_id: string
          redo_exists: boolean
          sent_at: string
          visit_id: string
        }[]
      }
      intake_load: { Args: { _token: string }; Returns: Json }
      intake_save: {
        Args: { _patch: Json; _submit?: boolean; _token: string }
        Returns: Json
      }
      is_contractor_job_eligible: {
        Args: { _contractor_id: string }
        Returns: boolean
      }
      is_privileged_caller: { Args: never; Returns: boolean }
      is_scheduler_paused: { Args: never; Returns: boolean }
      is_service_caller: { Args: never; Returns: boolean }
      is_site_live: { Args: never; Returns: boolean }
      issue_member_credit: {
        Args: {
          _amount_cents: number
          _kind: string
          _note: string
          _subscription: string
          _user: string
          _visit: string
        }
        Returns: string
      }
      kpi_latest_snapshot_rows: {
        Args: never
        Returns: {
          computed_at: string
          context: Json
          kpi_code: string
          status: Database["public"]["Enums"]["kpi_status"]
          value: number
          value_text: string
        }[]
      }
      kpi_latest_snapshots: {
        Args: { _codes?: string[] }
        Returns: {
          computed_at: string
          kpi_code: string
          status: Database["public"]["Enums"]["kpi_status"]
          value: number
          value_text: string
        }[]
      }
      kpi_snapshots_prune: { Args: never; Returns: number }
      launch_conversion_open: { Args: { _scope: string }; Returns: boolean }
      lawn_apply_size: { Args: { _reservation: string }; Returns: undefined }
      lawn_checkout_gate: { Args: { _email: string }; Returns: Json }
      lawn_conversion_block: {
        Args: { r: Database["public"]["Tables"]["reservations"]["Row"] }
        Returns: string
      }
      lawn_line_cents: {
        Args: { _cadence: string; _rate_card: number; _size: string }
        Returns: number
      }
      lawn_plan_respond: {
        Args: { _accept: boolean; _token: string }
        Returns: Json
      }
      lawn_size_from_sqft: { Args: { _sqft: number }; Returns: string }
      lawn_size_respond: {
        Args: { _accept: boolean; _token: string }
        Returns: Json
      }
      lifecycle_capture_contact: {
        Args: {
          _email: string
          _first: string
          _lang: string
          _last: string
          _phone: string
          _sms: boolean
          _test?: boolean
          _zip: string
        }
        Returns: string
      }
      lifecycle_contact_for_user: {
        Args: { _user_id: string }
        Returns: string
      }
      lifecycle_daily_events: { Args: { _at?: string }; Returns: Json }
      lifecycle_dispatch: {
        Args: {
          _at?: string
          _contact_id: string
          _event: string
          _key: string
          _simulation_id?: string
          _tokens?: Json
        }
        Returns: Json
      }
      lifecycle_dispatch_internal: {
        Args: {
          _at?: string
          _contact_id: string
          _event: string
          _key: string
          _simulation_id?: string
          _tokens?: Json
        }
        Returns: Json
      }
      lifecycle_emit_user: {
        Args: {
          _at?: string
          _event: string
          _key: string
          _tokens?: Json
          _user_id: string
        }
        Returns: undefined
      }
      lifecycle_inbound_reply: {
        Args: { _body: string; _phone: string; _sid: string }
        Returns: Json
      }
      lifecycle_next_send_time: { Args: { _at: string }; Returns: string }
      lifecycle_orphans: {
        Args: never
        Returns: {
          created_at: string
          email: string | null
          email_marketing: boolean
          email_suppressed: boolean
          first_name: string | null
          id: string
          is_test: boolean
          lang: string
          last_marketing_sent_at: string | null
          last_name: string | null
          lifecycle_stage: string
          phone: string | null
          sms_marketing: boolean
          sms_service: boolean
          sms_stopped: boolean
          source: string | null
          src_tag: string | null
          stage_entered_at: string
          updated_at: string
          user_id: string | null
          welcome_at: string | null
          zip: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "contacts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      lifecycle_set_stage: {
        Args: { _contact_id: string; _stage: string; _tokens?: Json }
        Returns: undefined
      }
      lifecycle_simulate: {
        Args: {
          _contact_id: string
          _event?: string
          _journey?: boolean
          _tokens?: Json
        }
        Returns: Json
      }
      linkedin_confirm_receipt: {
        Args: { _post: string; _token: string; _url: string; _urn: string }
        Returns: undefined
      }
      linkedin_enable_calendar: { Args: never; Returns: undefined }
      linkedin_expire_unconfirmed: { Args: never; Returns: number }
      linkedin_manual_confirm: {
        Args: { _post: string; _url: string; _urn?: string }
        Returns: undefined
      }
      linkedin_manual_release: {
        Args: { _post: string; _reason?: string }
        Returns: undefined
      }
      linkedin_prepare_live_test: {
        Args: { _kind: string }
        Returns: {
          anchor_type: string | null
          anchor_value: string | null
          archive_reason: string | null
          archived_at: string | null
          armed_at: string | null
          caption: string
          channel: string
          content_hash: string | null
          created_at: string
          drop_if_bumped: boolean
          external_post_id: string | null
          id: string
          image_filename: string | null
          image_flag: string | null
          image_hash: string | null
          image_subject: string | null
          image_url: string | null
          is_spare: boolean
          is_test: boolean
          linkedin_url: string | null
          linkedin_urn: string | null
          manual_schedule: boolean
          media_kind: string
          not_before: string
          notes: string | null
          original_scheduled_for: string | null
          post_number: number
          posted_at: string | null
          priority: number | null
          publish_error: string | null
          rendered_caption: string | null
          scheduled_for: string | null
          scheduled_in_native_tool_at: string | null
          source_key: string | null
          status: string
          template_copy: string | null
          theme: string | null
          title: string | null
          updated_at: string
          waiting_reason: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "social_launch_posts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      mark_visit_paid_in_full: {
        Args: {
          _actor?: string
          _note?: string
          _reason: string
          _visit_id: string
        }
        Returns: Json
      }
      member_guide_accepted: { Args: { _user: string }; Returns: boolean }
      member_ops_tick: { Args: never; Returns: Json }
      member_rate_card_version: { Args: { _user: string }; Returns: number }
      member_scope_version: {
        Args: { _service: string; _user: string }
        Returns: number
      }
      member_size_review_respond: {
        Args: { _confirm: boolean; _review: string }
        Returns: Json
      }
      my_founding: { Args: never; Returns: Json }
      my_gate_code: { Args: never; Returns: string }
      my_language: { Args: never; Returns: string }
      my_pro_services: {
        Args: never
        Returns: Database["public"]["Enums"]["service_type"][]
      }
      new_application_reminder_at: {
        Args: { _invited_at: string }
        Returns: string
      }
      nextval: { Args: { seq_name: string }; Returns: number }
      notify_member: {
        Args: {
          _body: string
          _dedupe: string
          _ent?: string
          _kind: string
          _title: string
          _user: string
          _visit?: string
        }
        Returns: undefined
      }
      payment_pause_tick: { Args: never; Returns: Json }
      pipeline_add_artifact: {
        Args: { _id: string; _kind: string; _name: string; _path: string }
        Returns: string
      }
      pipeline_advance: {
        Args: {
          _amount_cents?: number
          _confirm_spend?: boolean
          _expected_to?: string
          _id: string
          _note?: string
        }
        Returns: Json
      }
      pipeline_archive_apply: {
        Args: {
          _id: string
          _meta: Json
          _note: string
          _reason: string
          _state: string
        }
        Returns: undefined
      }
      pipeline_archive_list: {
        Args: { _q?: string }
        Returns: {
          applicant_id: string
          archived_at: string
          email: string
          name: string
          phone: string
          reason: string
          service: string
          spend_cents: number
          stage: string
          state: string
        }[]
      }
      pipeline_assert_admin: { Args: never; Returns: undefined }
      pipeline_board: {
        Args: never
        Returns: {
          activated: boolean
          applicant_id: string
          callback_overdue: boolean
          city: string
          days_in_stage: number
          hold_callback_date: string
          hold_reason: string
          is_test: boolean
          name: string
          overridden: boolean
          previously_declined: string
          service: string
          stage: string
          state: string
        }[]
      }
      pipeline_bulk_decline: {
        Args: { _ids: string[]; _note?: string; _reason: string }
        Returns: number
      }
      pipeline_business_days_between: {
        Args: { _from: string; _to: string }
        Returns: number
      }
      pipeline_callbacks_due: { Args: never; Returns: number }
      pipeline_coi_tick: { Args: never; Returns: Json }
      pipeline_decline: {
        Args: {
          _adverse?: string
          _id: string
          _note?: string
          _pre_adverse?: string
          _reason: string
          _rights_provided?: boolean
        }
        Returns: undefined
      }
      pipeline_doc_warnings: { Args: never; Returns: string[] }
      pipeline_hold: {
        Args: { _callback: string; _id: string; _reason: string }
        Returns: undefined
      }
      pipeline_is_test_pro: { Args: { _uid: string }; Returns: boolean }
      pipeline_log: {
        Args: {
          _from_stage: string
          _from_state: string
          _id: string
          _kind: string
          _meta?: Json
          _reason: string
          _to_stage: string
          _to_state: string
        }
        Returns: undefined
      }
      pipeline_mark_sent: {
        Args: { _id: string; _what: string }
        Returns: undefined
      }
      pipeline_mark_welcome_sent: { Args: { _id: string }; Returns: undefined }
      pipeline_missing: { Args: { _id: string }; Returns: string[] }
      pipeline_money_at_risk: {
        Args: never
        Returns: {
          service: string
          spend_cents: number
        }[]
      }
      pipeline_override: {
        Args: { _id: string; _reason: string; _to_stage: string }
        Returns: undefined
      }
      pipeline_pro_assignable: {
        Args: { _applicant_id: string }
        Returns: boolean
      }
      pipeline_probation_checks: {
        Args: { _since: string }
        Returns: {
          applicant_id: string
          completed_at: string
          n: number
          name: string
          visit_id: string
        }[]
      }
      pipeline_probation_clear: { Args: { _id: string }; Returns: undefined }
      pipeline_proof_message: { Args: never; Returns: string }
      pipeline_proof_missing: { Args: { _id: string }; Returns: string[] }
      pipeline_proof_overdue: {
        Args: never
        Returns: {
          applicant_id: string
          name: string
          sent_at: string
          service: string
        }[]
      }
      pipeline_proof_recompute: { Args: { _id: string }; Returns: boolean }
      pipeline_proof_review: {
        Args: {
          _approve: boolean
          _id: string
          _note?: string
          _reason?: string
          _slot: string
        }
        Returns: Json
      }
      pipeline_proof_slots: {
        Args: { _service: string }
        Returns: {
          item_id: string
          kind: string
          label_en: string
          label_es: string
          slot: string
          sort: number
        }[]
      }
      pipeline_proof_tick: { Args: never; Returns: number }
      pipeline_reference_review: {
        Args: { _id: string; _notes?: string; _status: string }
        Returns: Json
      }
      pipeline_reinstate: { Args: { _id: string }; Returns: undefined }
      pipeline_restore: { Args: { _id: string }; Returns: undefined }
      pipeline_resume: { Args: { _id: string }; Returns: undefined }
      pipeline_send_proof_link: { Args: { _id: string }; Returns: undefined }
      pipeline_service_key: { Args: { _s: string }; Returns: string }
      pipeline_service_label: { Args: { _s: string }; Returns: string }
      pipeline_spend_lock_holder: {
        Args: { _except: string; _service: string }
        Returns: {
          applicant_id: string
          name: string
          stage: string
        }[]
      }
      pipeline_stage_index: { Args: { _s: string }; Returns: number }
      pipeline_stage_label: { Args: { _s: string }; Returns: string }
      pipeline_update: {
        Args: { _id: string; _patch: Json }
        Returns: undefined
      }
      pipeline_withdraw: {
        Args: { _id: string; _note: string }
        Returns: undefined
      }
      pro_access_window_open: {
        Args: { _pro: string; _visit: string }
        Returns: boolean
      }
      pro_all_five: { Args: { _applicant_id: string }; Returns: boolean }
      pro_capacity_stats_internal: {
        Args: never
        Returns: {
          applicant_id: string
          booked_pct: number
          high_demand: boolean
          preferred_by_count: number
        }[]
      }
      pro_claim_day: {
        Args: {
          _end: string
          _service: Database["public"]["Enums"]["service_type"]
          _start: string
          _weekday: number
          _zip: string
        }
        Returns: Json
      }
      pro_cleaning_check: {
        Args: { _checked: boolean; _key: string; _visit: string }
        Returns: undefined
      }
      pro_cleaning_checklist: { Args: { _visit: string }; Returns: Json }
      pro_cleaning_visit_details: { Args: { _visit: string }; Returns: Json }
      pro_coi_state: {
        Args: { _pro: string }
        Returns: {
          can_work: boolean
          carrier: string
          certificate_path: string
          expires_at: string
          policy_number: string
          status: string
        }[]
      }
      pro_complete_addon: {
        Args: { _attach: string; _mode: string }
        Returns: Json
      }
      pro_custom_hours_state: { Args: never; Returns: Json }
      pro_dates: { Args: { _weeks?: number }; Returns: Json }
      pro_decline_first_right: { Args: { _id: string }; Returns: Json }
      pro_drop_day: { Args: { _claim: string }; Returns: Json }
      pro_drop_preview: { Args: { _claim: string }; Returns: Json }
      pro_get_me: {
        Args: never
        Returns: {
          active_since: string
          avg_rating: number
          badge_status: string
          badge_token: string
          completed_visits: number
          first_name: string
          pro_id: string
          pro_number: string
          referral_code: string
          tier: string
        }[]
      }
      pro_get_visits: {
        Args: { _from?: string; _to?: string }
        Returns: {
          access_notes: string
          after_photos: number
          before_photos: number
          completed_at: string
          customer_first_name: string
          gate_code: string
          id: string
          is_sample: boolean
          on_my_way_at: string
          paid_in_full_reason: string
          parking_notes: string
          pet_notes: string
          scheduled_end: string
          scheduled_start: string
          service_type: string
          status: string
          street: string
          visit_kind: string
          visit_pay_cents: number
          zip: string
        }[]
      }
      pro_gps_distance: {
        Args: {
          _lat: number
          _lng: number
          _target_lat: number
          _target_lng: number
        }
        Returns: number
      }
      pro_gps_validate: {
        Args: {
          _lat: number
          _lng: number
          _pro: string
          _reason?: string
          _visit: string
        }
        Returns: Json
      }
      pro_home_note: { Args: { _visit: string }; Returns: string }
      pro_job_card: { Args: { _visit: string }; Returns: Json }
      pro_lawn_job_info: {
        Args: { _visit: string }
        Returns: {
          measured_sqft: number
          size_tier: number
          visit_pay_cents: number
        }[]
      }
      pro_mark_off: { Args: { _date: string; _note?: string }; Returns: Json }
      pro_on_cleaning_team_visit: {
        Args: { _pro: string; _visit: string }
        Returns: boolean
      }
      pro_orientation_state: { Args: never; Returns: Json }
      pro_orientation_touch: {
        Args: { _complete?: boolean; _section_id: string }
        Returns: undefined
      }
      pro_partner_progress: { Args: never; Returns: Json }
      pro_partner_status: { Args: { _applicant: string }; Returns: Json }
      pro_partner_try_promote: { Args: { _applicant: string }; Returns: Json }
      pro_record_ping: {
        Args: {
          _accuracy?: number
          _lat: number
          _lng: number
          _pro: string
          _visit: string
        }
        Returns: Json
      }
      pro_record_team_location: {
        Args: {
          _action: string
          _lat: number
          _lng: number
          _pro: string
          _reason?: string
          _visit: string
        }
        Returns: undefined
      }
      pro_report_teammate_missing: { Args: { _visit: string }; Returns: Json }
      pro_required_check_keys: {
        Args: { _kind: string; _service: string }
        Returns: string[]
      }
      pro_review_bonus_total: { Args: { _pro?: string }; Returns: number }
      pro_route_details: {
        Args: never
        Returns: {
          checked_in: boolean
          checked_out: boolean
          first_visit: boolean
          is_lead: boolean
          is_team: boolean
          size_tier: number
          visit_id: string
        }[]
      }
      pro_schedule_state: { Args: never; Returns: Json }
      pro_send_message: {
        Args: { _body: string; _visit_id?: string }
        Returns: string
      }
      pro_service_check: {
        Args: { _checked: boolean; _key: string; _visit: string }
        Returns: undefined
      }
      pro_service_checklist: { Args: { _visit: string }; Returns: Json }
      pro_set_catchup: { Args: { _weekday: number }; Returns: Json }
      pro_set_catchup_busy: {
        Args: { _busy: boolean; _date: string }
        Returns: Json
      }
      pro_tier_uplift_cents: {
        Args: { _base_cents: number; _pro_uid: string }
        Returns: number
      }
      pro_update_claim_hours: {
        Args: { _claim: string; _end: string; _start: string }
        Returns: Json
      }
      pro_visit_addons: {
        Args: { _visit: string }
        Returns: {
          addon_name: string
          can_split: boolean
          completed_by: string
          id: string
          split_pay: boolean
          status: string
        }[]
      }
      pro_visit_context: { Args: { _visit: string }; Returns: Json }
      pro_visit_extras: { Args: { _visit: string }; Returns: Json }
      public_five_star_proof: { Args: never; Returns: Json }
      rate_limit_take: {
        Args: {
          _bucket: string
          _identifier: string
          _limit: number
          _window_seconds: number
        }
        Returns: Json
      }
      repoint_cron_to_helper: { Args: { _job_name: string }; Returns: string }
      reserve_cleaning_walkthrough: {
        Args: { _reservation: string; _slot: string }
        Returns: boolean
      }
      review_bonus_next_friday: { Args: never; Returns: string }
      review_bonus_precheck: {
        Args: { _member: string; _pro: string; _stars: number }
        Returns: Json
      }
      review_kpis: { Args: never; Returns: Json }
      sched_active_pro_count: {
        Args: { _s: Database["public"]["Enums"]["service_type"] }
        Returns: number
      }
      sched_alert: {
        Args: {
          _body: string
          _dedupe: string
          _level: string
          _title: string
          _type: string
          _url: string
        }
        Returns: undefined
      }
      sched_blocked: {
        Args: {
          _d: string
          _s: Database["public"]["Enums"]["service_type"]
          _zip: string
        }
        Returns: boolean
      }
      sched_booked: {
        Args: { _d: string; _excl: string; _pro: string }
        Returns: number
      }
      sched_budget: {
        Args: {
          _kind: string
          _s: Database["public"]["Enums"]["service_type"]
          _size: number
        }
        Returns: number
      }
      sched_claim_hours: {
        Args: {
          _c: Database["public"]["Tables"]["pro_day_claims"]["Row"]
          _d: string
        }
        Returns: number
      }
      sched_claim_live_on: {
        Args: {
          _c: Database["public"]["Tables"]["pro_day_claims"]["Row"]
          _d: string
        }
        Returns: boolean
      }
      sched_cleaning_seq_ok: {
        Args: {
          _budget: number
          _d: string
          _excl_booking: string
          _pro: string
          _w: string
        }
        Returns: boolean
      }
      sched_cluster: { Args: { _zip: string }; Returns: string }
      sched_cluster_zips: { Args: { _c: string }; Returns: string[] }
      sched_custom_hours_allowed: {
        Args: { _s: Database["public"]["Enums"]["service_type"] }
        Returns: boolean
      }
      sched_customer_notice: {
        Args: {
          _body: string
          _dedupe: string
          _expires: string
          _kind: string
          _sms: string
          _title: string
          _user: string
          _visit: string
        }
        Returns: undefined
      }
      sched_customer_sms: {
        Args: {
          _dedupe: string
          _expires: string
          _kind: string
          _sms: string
          _user: string
        }
        Returns: undefined
      }
      sched_dates: {
        Args: {
          _cadence: string
          _first: string
          _max: number
          _s: Database["public"]["Enums"]["service_type"]
          _until: string
        }
        Returns: string[]
      }
      sched_day_capacity: { Args: { _s: string }; Returns: number }
      sched_day_loss: {
        Args: { _claim: string; _effective: string; _reason: string }
        Returns: number
      }
      sched_day_name: { Args: { _w: number }; Returns: string }
      sched_days_needed: {
        Args: { _hours: number; _s: string; _visits: number }
        Returns: number
      }
      sched_demand_items: { Args: never; Returns: Json }
      sched_demand_rows: {
        Args: never
        Returns: {
          afternoons: number
          claimed: boolean
          day: string
          fit_pct: number
          flagged: boolean
          mornings: number
          preferences: number
          service: string
          share: number
          weekday: number
          zip: string
        }[]
      }
      sched_dow: { Args: { _d: string }; Returns: number }
      sched_es: { Args: { _t: string }; Returns: string }
      sched_es_tok: { Args: { _t: string }; Returns: string }
      sched_find_slot: {
        Args: {
          _budget: number
          _d: string
          _excl: string
          _pro: string
          _s: Database["public"]["Enums"]["service_type"]
          _sub?: string
          _w: string
          _zip: string
        }
        Returns: Record<string, unknown>
      }
      sched_first_date: {
        Args: {
          _budget: number
          _cadence: string
          _claim: string
          _excl_booking: string
          _w: string
        }
        Returns: string
      }
      sched_first_right_open: {
        Args: {
          _s: Database["public"]["Enums"]["service_type"]
          _wd: number
          _zip: string
        }
        Returns: string
      }
      sched_fmt: { Args: { _d: string }; Returns: string }
      sched_full_day: {
        Args: { _s: Database["public"]["Enums"]["service_type"] }
        Returns: Record<string, unknown>
      }
      sched_generate_booking: {
        Args: { _b: string; _until: string }
        Returns: number
      }
      sched_item_load: { Args: { _i: Json }; Returns: Record<string, unknown> }
      sched_ladder: { Args: never; Returns: undefined }
      sched_launch_date:
        | { Args: never; Returns: string }
        | {
            Args: { _s: Database["public"]["Enums"]["service_type"] }
            Returns: string
          }
      sched_launch_locked: {
        Args: { _s: Database["public"]["Enums"]["service_type"] }
        Returns: boolean
      }
      sched_launch_proposal: { Args: { _items?: Json }; Returns: Json }
      sched_lawn_day_pick: {
        Args: {
          _sim?: Json
          _street: string
          _weekdays: number[]
          _zip: string
        }
        Returns: number
      }
      sched_load: {
        Args: { _d: string; _excl_booking: string; _pro: string }
        Returns: number
      }
      sched_me_pro: { Args: never; Returns: string }
      sched_month_anchor: {
        Args: { _first: string; _k: number }
        Returns: string
      }
      sched_move_visit: {
        Args: { _reason: string; _to: string; _visit: string; _w: string }
        Returns: undefined
      }
      sched_once: { Args: { _key: string }; Returns: boolean }
      sched_options: {
        Args: { _s: Database["public"]["Enums"]["service_type"]; _user: string }
        Returns: Json
      }
      sched_place_visit: {
        Args: {
          _anchor: string
          _b: string
          _force_move: boolean
          _kind: string
          _pay: number
        }
        Returns: boolean
      }
      sched_pro_active: { Args: { _uid: string }; Returns: boolean }
      sched_pro_cap: { Args: { _d: string; _pro: string }; Returns: number }
      sched_pro_first_name: { Args: { _uid: string }; Returns: string }
      sched_pro_notice: {
        Args: {
          _body: string
          _dedupe: string
          _kind: string
          _pro: string
          _title: string
          _url: string
        }
        Returns: undefined
      }
      sched_pro_services: {
        Args: { _uid: string }
        Returns: Database["public"]["Enums"]["service_type"][]
      }
      sched_pro_went_inactive: { Args: { _claim: string }; Returns: undefined }
      sched_prompt_unbooked: { Args: { _sub?: string }; Returns: number }
      sched_relocate_visit: {
        Args: { _reason: string; _visit: string }
        Returns: string
      }
      sched_require_admin: { Args: never; Returns: undefined }
      sched_routes: { Args: never; Returns: Json }
      sched_seq_check: { Args: { _items: Json }; Returns: boolean }
      sched_slot_fits: {
        Args: {
          _budget: number
          _cadence: string
          _claim: string
          _excl_booking: string
          _first: string
          _w: string
        }
        Returns: boolean
      }
      sched_std_kind: {
        Args: { _s: Database["public"]["Enums"]["service_type"] }
        Returns: string
      }
      sched_street_key: { Args: { _addr: string }; Returns: string }
      sched_svc_label: {
        Args: { _s: Database["public"]["Enums"]["service_type"] }
        Returns: string
      }
      sched_sync_pro: { Args: { _uid: string }; Returns: undefined }
      sched_tick: { Args: never; Returns: Json }
      sched_today: { Args: never; Returns: string }
      sched_visits_per_week: {
        Args: { _cadence: string; _s: string }
        Returns: number
      }
      sched_waitlist_holds: { Args: never; Returns: undefined }
      sched_waitlist_offer: {
        Args: { _s: Database["public"]["Enums"]["service_type"]; _zip: string }
        Returns: undefined
      }
      sched_weekday_hours: {
        Args: { _d: string; _pro: string }
        Returns: number
      }
      sched_window_taken: {
        Args: {
          _d: string
          _excl_booking: string
          _pro: string
          _s: Database["public"]["Enums"]["service_type"]
          _w: string
        }
        Returns: boolean
      }
      sched_window_times: {
        Args: { _key: string; _s: Database["public"]["Enums"]["service_type"] }
        Returns: Record<string, unknown>
      }
      sched_windows: {
        Args: { _s: Database["public"]["Enums"]["service_type"] }
        Returns: string[]
      }
      sched_zips: { Args: never; Returns: string[] }
      schedule_car_wash_jobs: {
        Args: { _cap_per_pro_day?: number }
        Returns: number
      }
      set_my_gate_code: { Args: { _code: string }; Returns: undefined }
      set_my_language: { Args: { _lang: string }; Returns: string }
      sms_recipient_name: { Args: { _phone: string }; Returns: string }
      social_caption_hash: { Args: { _c: string }; Returns: string }
      social_confirm_publish: {
        Args: { _ledger: string; _platform_id: string }
        Returns: undefined
      }
      social_reserve_publish: {
        Args: {
          _at?: string
          _caption: string
          _dry_run?: boolean
          _id: string
          _image_hash: string
          _image_url?: string
          _platform: string
        }
        Returns: Json
      }
      subscription_service_count: { Args: { _sub: string }; Returns: number }
      sync_member_entitlements: {
        Args: { _reason: string; _sub: string }
        Returns: undefined
      }
      user_lang: { Args: { _uid: string }; Returns: string }
      verify_pro_badge: {
        Args: { _token: string }
        Returns: {
          badge_photo_url: string
          badge_status: string
          bg_check_cleared_at: string
          display_name: string
          insurance_active: boolean
          pro_number: string
          pro_since: string
          services: string
        }[]
      }
      visit_access_details: {
        Args: { _visit: string }
        Returns: {
          access_notes: string
          gate_code: string
        }[]
      }
      visit_customer_price_cents: { Args: { _visit: string }; Returns: number }
    }
    Enums: {
      app_role: "customer" | "crew" | "admin" | "pro"
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
      support_channel: "sms" | "web" | "pro"
      support_direction: "inbound" | "outbound" | "auto_reply"
      support_sender_type: "customer" | "ai" | "admin" | "pro"
      support_status: "open" | "resolved" | "escalated"
      visit_status:
        | "scheduled"
        | "on_the_way"
        | "in_progress"
        | "complete"
        | "canceled"
        | "skipped"
        | "blocked"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["customer", "crew", "admin", "pro"],
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
      support_channel: ["sms", "web", "pro"],
      support_direction: ["inbound", "outbound", "auto_reply"],
      support_sender_type: ["customer", "ai", "admin", "pro"],
      support_status: ["open", "resolved", "escalated"],
      visit_status: [
        "scheduled",
        "on_the_way",
        "in_progress",
        "complete",
        "canceled",
        "skipped",
        "blocked",
      ],
    },
  },
} as const
