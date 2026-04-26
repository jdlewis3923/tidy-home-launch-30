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
          last_name: string | null
          parking_notes: string | null
          pets: string | null
          phone: string | null
          preferred_day: string | null
          preferred_time: string | null
          sms_opt_in: boolean
          sms_opt_out: boolean
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
          last_name?: string | null
          parking_notes?: string | null
          pets?: string | null
          phone?: string | null
          preferred_day?: string | null
          preferred_time?: string | null
          sms_opt_in?: boolean
          sms_opt_out?: boolean
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
          last_name?: string | null
          parking_notes?: string | null
          pets?: string | null
          phone?: string | null
          preferred_day?: string | null
          preferred_time?: string | null
          sms_opt_in?: boolean
          sms_opt_out?: boolean
          special_instructions?: string | null
          updated_at?: string
          user_id?: string
          zip?: string | null
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
      subscriptions: {
        Row: {
          bundle_discount_pct: number
          created_at: string
          frequency: Database["public"]["Enums"]["subscription_frequency"]
          id: string
          jobber_client_id: string | null
          jobber_job_ids: Json
          monthly_total_cents: number
          next_billing_date: string | null
          services: Database["public"]["Enums"]["service_type"][]
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bundle_discount_pct?: number
          created_at?: string
          frequency?: Database["public"]["Enums"]["subscription_frequency"]
          id?: string
          jobber_client_id?: string | null
          jobber_job_ids?: Json
          monthly_total_cents?: number
          next_billing_date?: string | null
          services?: Database["public"]["Enums"]["service_type"][]
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bundle_discount_pct?: number
          created_at?: string
          frequency?: Database["public"]["Enums"]["subscription_frequency"]
          id?: string
          jobber_client_id?: string | null
          jobber_job_ids?: Json
          monthly_total_cents?: number
          next_billing_date?: string | null
          services?: Database["public"]["Enums"]["service_type"][]
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
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
      visits: {
        Row: {
          created_at: string
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
      admin_get_service_role_key: { Args: never; Returns: string }
      admin_set_jobber_refresh_token: {
        Args: { _token: string }
        Returns: undefined
      }
      admin_set_service_role_key: { Args: { _key: string }; Returns: undefined }
      current_user_admin: { Args: never; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "customer" | "crew" | "admin"
      invoice_status: "paid" | "pending" | "failed" | "refunded"
      service_type: "cleaning" | "lawn" | "detailing"
      subscription_frequency: "weekly" | "biweekly" | "monthly"
      subscription_status: "active" | "paused" | "canceled"
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
      service_type: ["cleaning", "lawn", "detailing"],
      subscription_frequency: ["weekly", "biweekly", "monthly"],
      subscription_status: ["active", "paused", "canceled"],
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
