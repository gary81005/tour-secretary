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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      days: {
        Row: {
          city: string | null
          created_at: string
          date: string
          id: string
          timezone: string | null
          trip_id: string
          updated_at: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          date: string
          id?: string
          timezone?: string | null
          trip_id: string
          updated_at?: string
        }
        Update: {
          city?: string | null
          created_at?: string
          date?: string
          id?: string
          timezone?: string | null
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "days_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      fallbacks: {
        Row: {
          alternative: string
          condition: string | null
          created_at: string
          id: string
          item_id: string
          position: number
          trip_id: string
        }
        Insert: {
          alternative: string
          condition?: string | null
          created_at?: string
          id?: string
          item_id: string
          position?: number
          trip_id: string
        }
        Update: {
          alternative?: string
          condition?: string | null
          created_at?: string
          id?: string
          item_id?: string
          position?: number
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fallbacks_item_fk"
            columns: ["item_id", "trip_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id", "trip_id"]
          },
          {
            foreignKeyName: "fallbacks_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      item_places: {
        Row: {
          created_at: string
          id: string
          item_id: string
          name: string
          position: number
          trip_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          name: string
          position?: number
          trip_id: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          name?: string
          position?: number
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_places_item_fk"
            columns: ["item_id", "trip_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id", "trip_id"]
          },
          {
            foreignKeyName: "item_places_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          category: Database["public"]["Enums"]["item_category"]
          created_at: string
          day_id: string
          deleted_at: string | null
          description: string | null
          end_time: string | null
          id: string
          position: number
          start_time: string | null
          time_slot: Database["public"]["Enums"]["time_slot"]
          title: string
          trip_id: string
          updated_at: string
          url: string | null
        }
        Insert: {
          category: Database["public"]["Enums"]["item_category"]
          created_at?: string
          day_id: string
          deleted_at?: string | null
          description?: string | null
          end_time?: string | null
          id?: string
          position?: number
          start_time?: string | null
          time_slot: Database["public"]["Enums"]["time_slot"]
          title: string
          trip_id: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["item_category"]
          created_at?: string
          day_id?: string
          deleted_at?: string | null
          description?: string | null
          end_time?: string | null
          id?: string
          position?: number
          start_time?: string | null
          time_slot?: Database["public"]["Enums"]["time_slot"]
          title?: string
          trip_id?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "items_day_fk"
            columns: ["day_id", "trip_id"]
            isOneToOne: false
            referencedRelation: "days"
            referencedColumns: ["id", "trip_id"]
          },
          {
            foreignKeyName: "items_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      stays: {
        Row: {
          address: string | null
          check_in: string
          check_out: string
          confirmation_code: string | null
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          note: string | null
          status: Database["public"]["Enums"]["stay_status"]
          trip_id: string
          updated_at: string
          url: string | null
        }
        Insert: {
          address?: string | null
          check_in: string
          check_out: string
          confirmation_code?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          note?: string | null
          status?: Database["public"]["Enums"]["stay_status"]
          trip_id: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          address?: string | null
          check_in?: string
          check_out?: string
          confirmation_code?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          note?: string | null
          status?: Database["public"]["Enums"]["stay_status"]
          trip_id?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stays_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      traveler_constraints: {
        Row: {
          content: string
          created_at: string
          deleted_at: string | null
          id: string
          kind: Database["public"]["Enums"]["traveler_constraint_kind"]
          subject: string | null
          trip_id: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          kind: Database["public"]["Enums"]["traveler_constraint_kind"]
          subject?: string | null
          trip_id: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["traveler_constraint_kind"]
          subject?: string | null
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "traveler_constraints_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_members: {
        Row: {
          created_at: string
          role: Database["public"]["Enums"]["trip_role"]
          trip_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          role?: Database["public"]["Enums"]["trip_role"]
          trip_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          role?: Database["public"]["Enums"]["trip_role"]
          trip_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_members_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_notes: {
        Row: {
          content: string | null
          created_at: string
          deleted_at: string | null
          id: string
          position: number
          topic: string
          trip_id: string
          updated_at: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          position?: number
          topic: string
          trip_id: string
          updated_at?: string
        }
        Update: {
          content?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          position?: number
          topic?: string
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_notes_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          created_at: string
          created_by: string
          default_timezone: string
          deleted_at: string | null
          end_date: string
          id: string
          name: string
          start_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          default_timezone?: string
          deleted_at?: string | null
          end_date: string
          id?: string
          name: string
          start_date: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          default_timezone?: string
          deleted_at?: string | null
          end_date?: string
          id?: string
          name?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_trip: { Args: { p_trip_id: string }; Returns: boolean }
      create_trip: {
        Args: {
          p_end_date: string
          p_name: string
          p_start_date: string
          p_timezone: string
        }
        Returns: string
      }
      is_trip_member: { Args: { p_trip_id: string }; Returns: boolean }
      is_trip_owner: { Args: { p_trip_id: string }; Returns: boolean }
      purge_deleted_rows: { Args: never; Returns: undefined }
      shares_trip_with: { Args: { p_user_id: string }; Returns: boolean }
    }
    Enums: {
      item_category:
        | "sightseeing"
        | "meal"
        | "transport"
        | "lodging"
        | "shopping"
        | "reminder"
      stay_status: "candidate" | "booked" | "paid"
      time_slot:
        | "all_day"
        | "early_morning"
        | "morning"
        | "noon"
        | "afternoon"
        | "evening"
        | "night"
      traveler_constraint_kind:
        | "diet"
        | "stamina"
        | "mobility"
        | "preference"
        | "other"
      trip_role: "owner" | "member"
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
      item_category: [
        "sightseeing",
        "meal",
        "transport",
        "lodging",
        "shopping",
        "reminder",
      ],
      stay_status: ["candidate", "booked", "paid"],
      time_slot: [
        "all_day",
        "early_morning",
        "morning",
        "noon",
        "afternoon",
        "evening",
        "night",
      ],
      traveler_constraint_kind: [
        "diet",
        "stamina",
        "mobility",
        "preference",
        "other",
      ],
      trip_role: ["owner", "member"],
    },
  },
} as const
