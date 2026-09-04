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
      appointments: {
        Row: {
          alert_sound: string
          created_at: string
          date: string
          deleted_at: string | null
          description: string
          id: string
          time: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          alert_sound?: string
          created_at?: string
          date: string
          deleted_at?: string | null
          description?: string
          id?: string
          time?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          alert_sound?: string
          created_at?: string
          date?: string
          deleted_at?: string | null
          description?: string
          id?: string
          time?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      biometric_credentials: {
        Row: {
          created_at: string
          credential_id: string
          credential_label: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credential_id: string
          credential_label?: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          credential_id?: string
          credential_label?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      device_commands: {
        Row: {
          command: string
          created_at: string
          device_id: string
          executed_at: string | null
          id: string
          payload: Json | null
          status: string
          user_id: string
        }
        Insert: {
          command: string
          created_at?: string
          device_id: string
          executed_at?: string | null
          id?: string
          payload?: Json | null
          status?: string
          user_id: string
        }
        Update: {
          command?: string
          created_at?: string
          device_id?: string
          executed_at?: string | null
          id?: string
          payload?: Json | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_commands_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "user_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      device_locations: {
        Row: {
          accuracy: number | null
          address: string | null
          battery_level: number | null
          device_id: string
          id: string
          is_online: boolean | null
          latitude: number
          longitude: number
          recorded_at: string
          source: string
          user_id: string
        }
        Insert: {
          accuracy?: number | null
          address?: string | null
          battery_level?: number | null
          device_id: string
          id?: string
          is_online?: boolean | null
          latitude: number
          longitude: number
          recorded_at?: string
          source?: string
          user_id: string
        }
        Update: {
          accuracy?: number | null
          address?: string | null
          battery_level?: number | null
          device_id?: string
          id?: string
          is_online?: boolean | null
          latitude?: number
          longitude?: number
          recorded_at?: string
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_locations_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "user_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      geofence_reminders: {
        Row: {
          address: string
          created_at: string
          id: string
          is_active: boolean
          latitude: number
          longitude: number
          radius_m: number
          title: string
          triggered_at: string | null
          user_id: string
        }
        Insert: {
          address: string
          created_at?: string
          id?: string
          is_active?: boolean
          latitude: number
          longitude: number
          radius_m?: number
          title: string
          triggered_at?: string | null
          user_id: string
        }
        Update: {
          address?: string
          created_at?: string
          id?: string
          is_active?: boolean
          latitude?: number
          longitude?: number
          radius_m?: number
          title?: string
          triggered_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      google_calendar_tokens: {
        Row: {
          access_token: string
          created_at: string
          expires_at: string
          id: string
          refresh_token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          expires_at: string
          id?: string
          refresh_token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          expires_at?: string
          id?: string
          refresh_token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      location_shares: {
        Row: {
          created_at: string
          device_id: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_id?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_id?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_shares_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "user_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          color: string
          content: string
          created_at: string
          deleted_at: string | null
          font_family: string
          font_size: string
          id: string
          images: string[]
          is_locked: boolean
          is_pinned: boolean
          lock_salt: string | null
          pin_order: number | null
          reminder_date: string | null
          reminder_sound: string
          reminder_time: string | null
          sincronizado: boolean
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          content?: string
          created_at?: string
          deleted_at?: string | null
          font_family?: string
          font_size?: string
          id?: string
          images?: string[]
          is_locked?: boolean
          is_pinned?: boolean
          lock_salt?: string | null
          pin_order?: number | null
          reminder_date?: string | null
          reminder_sound?: string
          reminder_time?: string | null
          sincronizado?: boolean
          status?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          content?: string
          created_at?: string
          deleted_at?: string | null
          font_family?: string
          font_size?: string
          id?: string
          images?: string[]
          is_locked?: boolean
          is_pinned?: boolean
          lock_salt?: string | null
          pin_order?: number | null
          reminder_date?: string | null
          reminder_sound?: string
          reminder_time?: string | null
          sincronizado?: boolean
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      oauth_states: {
        Row: {
          app_origin: string | null
          created_at: string
          expires_at: string
          provider: string
          token: string
          user_id: string
        }
        Insert: {
          app_origin?: string | null
          created_at?: string
          expires_at?: string
          provider?: string
          token: string
          user_id: string
        }
        Update: {
          app_origin?: string | null
          created_at?: string
          expires_at?: string
          provider?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      user_devices: {
        Row: {
          browser: string
          created_at: string
          custom_label: string | null
          device_fingerprint: string
          device_name: string
          id: string
          ip_address: string | null
          is_current: boolean
          last_seen_at: string
          manual_address: string | null
          manual_address_updated_at: string | null
          os: string
          user_id: string
        }
        Insert: {
          browser?: string
          created_at?: string
          custom_label?: string | null
          device_fingerprint?: string
          device_name?: string
          id?: string
          ip_address?: string | null
          is_current?: boolean
          last_seen_at?: string
          manual_address?: string | null
          manual_address_updated_at?: string | null
          os?: string
          user_id: string
        }
        Update: {
          browser?: string
          created_at?: string
          custom_label?: string | null
          device_fingerprint?: string
          device_name?: string
          id?: string
          ip_address?: string | null
          is_current?: boolean
          last_seen_at?: string
          manual_address?: string | null
          manual_address_updated_at?: string | null
          os?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_shared_location: {
        Args: { _token: string }
        Returns: {
          address: string
          battery_level: number
          device_id: string
          expires_at: string
          latitude: number
          longitude: number
          recorded_at: string
          share_id: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
