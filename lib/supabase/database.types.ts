// Hand-written to match supabase/migrations; regenerate with `supabase gen types` once the project is linked.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      candles: {
        Row: {
          symbol: string;
          interval: string;
          ts: string;
          open: number;
          high: number;
          low: number;
          close: number;
          volume: number | null;
        };
        Insert: {
          symbol: string;
          interval: string;
          ts: string;
          open: number;
          high: number;
          low: number;
          close: number;
          volume?: number | null;
        };
        Update: {
          symbol?: string;
          interval?: string;
          ts?: string;
          open?: number;
          high?: number;
          low?: number;
          close?: number;
          volume?: number | null;
        };
        Relationships: [];
      };
      fetch_log: {
        Row: {
          id: number;
          symbol: string;
          interval: string;
          credits_used: number;
          status: string;
          candles_received: number | null;
          message: string | null;
          created_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: never;
          symbol: string;
          interval: string;
          credits_used?: number;
          status: string;
          candles_received?: number | null;
          message?: string | null;
          created_at?: string;
          completed_at?: string | null;
        };
        Update: {
          id?: never;
          symbol?: string;
          interval?: string;
          credits_used?: number;
          status?: string;
          candles_received?: number | null;
          message?: string | null;
          created_at?: string;
          completed_at?: string | null;
        };
        Relationships: [];
      };
      watchlist: {
        Row: {
          id: string;
          user_id: string;
          symbol: string;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          symbol: string;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          symbol?: string;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      indicator_prefs: {
        Row: {
          id: string;
          user_id: string;
          symbol: string | null;
          config: Json;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          symbol?: string | null;
          config?: Json;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          symbol?: string | null;
          config?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
