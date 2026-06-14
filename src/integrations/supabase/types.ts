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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      appointments: {
        Row: {
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
          created_at?: string
          date: string
          deleted_at?: string | null
          description?: string
          id?: string
          time: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
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
