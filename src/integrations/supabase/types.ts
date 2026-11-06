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
      analysis_workspaces: {
        Row: {
          analyst_notes: string | null
          column_mappings: Json | null
          company_name: string
          created_at: string
          id: string
          industry: string | null
          raw_data: Json | null
          template_type: Database["public"]["Enums"]["analysis_template_type"]
          ticker: string
          updated_at: string
          user_id: string
        }
        Insert: {
          analyst_notes?: string | null
          column_mappings?: Json | null
          company_name: string
          created_at?: string
          id?: string
          industry?: string | null
          raw_data?: Json | null
          template_type?: Database["public"]["Enums"]["analysis_template_type"]
          ticker: string
          updated_at?: string
          user_id: string
        }
        Update: {
          analyst_notes?: string | null
          column_mappings?: Json | null
          company_name?: string
          created_at?: string
          id?: string
          industry?: string | null
          raw_data?: Json | null
          template_type?: Database["public"]["Enums"]["analysis_template_type"]
          ticker?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      page_content: {
        Row: {
          content: Json
          id: string
          page_key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content?: Json
          id?: string
          page_key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content?: Json
          id?: string
          page_key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          full_name: string | null
          id: string
          linkedin_url: string | null
          notification_email: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          linkedin_url?: string | null
          notification_email?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          linkedin_url?: string | null
          notification_email?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      public_thesis_data: {
        Row: {
          alert_type: string | null
          analyst_notes: string | null
          base_fcf: number | null
          capital_allocation_data: Json | null
          capital_efficiency_data: Json | null
          cash: number | null
          company_name: string
          created_at: string
          current_price: number | null
          dcf_projections: Json | null
          export_config: Json | null
          fair_value: number | null
          growth_margins_data: Json | null
          id: string
          implied_growth_rate: number | null
          kpi_data: Json | null
          last_alert_sent_at: string | null
          last_reviewed_at: string | null
          needs_review: boolean | null
          price_at_last_check: number | null
          published_at: string | null
          sensitivity_matrix: Json | null
          shares_outstanding: number | null
          terminal_growth: number | null
          ticker: string
          total_debt: number | null
          updated_at: string
          upside_percent: number | null
          user_id: string
          valuation_context_data: Json | null
          wacc: number | null
          workspace_id: string | null
        }
        Insert: {
          alert_type?: string | null
          analyst_notes?: string | null
          base_fcf?: number | null
          capital_allocation_data?: Json | null
          capital_efficiency_data?: Json | null
          cash?: number | null
          company_name: string
          created_at?: string
          current_price?: number | null
          dcf_projections?: Json | null
          export_config?: Json | null
          fair_value?: number | null
          growth_margins_data?: Json | null
          id?: string
          implied_growth_rate?: number | null
          kpi_data?: Json | null
          last_alert_sent_at?: string | null
          last_reviewed_at?: string | null
          needs_review?: boolean | null
          price_at_last_check?: number | null
          published_at?: string | null
          sensitivity_matrix?: Json | null
          shares_outstanding?: number | null
          terminal_growth?: number | null
          ticker: string
          total_debt?: number | null
          updated_at?: string
          upside_percent?: number | null
          user_id: string
          valuation_context_data?: Json | null
          wacc?: number | null
          workspace_id?: string | null
        }
        Update: {
          alert_type?: string | null
          analyst_notes?: string | null
          base_fcf?: number | null
          capital_allocation_data?: Json | null
          capital_efficiency_data?: Json | null
          cash?: number | null
          company_name?: string
          created_at?: string
          current_price?: number | null
          dcf_projections?: Json | null
          export_config?: Json | null
          fair_value?: number | null
          growth_margins_data?: Json | null
          id?: string
          implied_growth_rate?: number | null
          kpi_data?: Json | null
          last_alert_sent_at?: string | null
          last_reviewed_at?: string | null
          needs_review?: boolean | null
          price_at_last_check?: number | null
          published_at?: string | null
          sensitivity_matrix?: Json | null
          shares_outstanding?: number | null
          terminal_growth?: number | null
          ticker?: string
          total_debt?: number | null
          updated_at?: string
          upside_percent?: number | null
          user_id?: string
          valuation_context_data?: Json | null
          wacc?: number | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "public_thesis_data_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "analysis_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sec_companies: {
        Row: {
          cik: string
          created_at: string
          entity_name: string
          is_published: boolean
          updated_at: string
        }
        Insert: {
          cik: string
          created_at?: string
          entity_name: string
          is_published?: boolean
          updated_at?: string
        }
        Update: {
          cik?: string
          created_at?: string
          entity_name?: string
          is_published?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      sec_filings: {
        Row: {
          accepted_at: string | null
          accession_number: string
          cik: string
          created_at: string
          filed_date: string
          first_run_id: string
          form: string
          report_date: string | null
        }
        Insert: {
          accepted_at?: string | null
          accession_number: string
          cik: string
          created_at?: string
          filed_date: string
          first_run_id: string
          form: string
          report_date?: string | null
        }
        Update: {
          accepted_at?: string | null
          accession_number?: string
          cik?: string
          created_at?: string
          filed_date?: string
          first_run_id?: string
          form?: string
          report_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sec_filings_cik_first_run_id_fkey"
            columns: ["cik", "first_run_id"]
            isOneToOne: false
            referencedRelation: "sec_ingestion_runs"
            referencedColumns: ["cik", "run_id"]
          },
          {
            foreignKeyName: "sec_filings_cik_fkey"
            columns: ["cik"]
            isOneToOne: false
            referencedRelation: "sec_companies"
            referencedColumns: ["cik"]
          },
        ]
      }
      sec_ingestion_runs: {
        Row: {
          cik: string
          conflict_samples: Json | null
          content_type: string | null
          endpoint_url: string
          error_message: string | null
          facts_existing: number | null
          facts_inserted: number | null
          facts_rejected: number | null
          facts_skipped_scope: number | null
          filing_conflicts: number | null
          filings_inserted: number | null
          filings_not_inserted: number | null
          filings_skipped_form: number | null
          finished_at: string | null
          frame_changes: number | null
          http_status: number | null
          initiated_by: string | null
          metadata_conflicts: number | null
          observations_written: number | null
          page_name: string | null
          payload_bytes: number | null
          payload_duplicate_count: number | null
          payload_fact_count: number | null
          payload_filing_count: number | null
          payload_sha256: string | null
          resource_kind: string
          run_id: string
          started_at: string
          status: string
          storage_bucket: string | null
          storage_path: string | null
          user_agent: string
        }
        Insert: {
          cik: string
          conflict_samples?: Json | null
          content_type?: string | null
          endpoint_url: string
          error_message?: string | null
          facts_existing?: number | null
          facts_inserted?: number | null
          facts_rejected?: number | null
          facts_skipped_scope?: number | null
          filing_conflicts?: number | null
          filings_inserted?: number | null
          filings_not_inserted?: number | null
          filings_skipped_form?: number | null
          finished_at?: string | null
          frame_changes?: number | null
          http_status?: number | null
          initiated_by?: string | null
          metadata_conflicts?: number | null
          observations_written?: number | null
          page_name?: string | null
          payload_bytes?: number | null
          payload_duplicate_count?: number | null
          payload_fact_count?: number | null
          payload_filing_count?: number | null
          payload_sha256?: string | null
          resource_kind: string
          run_id?: string
          started_at?: string
          status?: string
          storage_bucket?: string | null
          storage_path?: string | null
          user_agent: string
        }
        Update: {
          cik?: string
          conflict_samples?: Json | null
          content_type?: string | null
          endpoint_url?: string
          error_message?: string | null
          facts_existing?: number | null
          facts_inserted?: number | null
          facts_rejected?: number | null
          facts_skipped_scope?: number | null
          filing_conflicts?: number | null
          filings_inserted?: number | null
          filings_not_inserted?: number | null
          filings_skipped_form?: number | null
          finished_at?: string | null
          frame_changes?: number | null
          http_status?: number | null
          initiated_by?: string | null
          metadata_conflicts?: number | null
          observations_written?: number | null
          page_name?: string | null
          payload_bytes?: number | null
          payload_duplicate_count?: number | null
          payload_fact_count?: number | null
          payload_filing_count?: number | null
          payload_sha256?: string | null
          resource_kind?: string
          run_id?: string
          started_at?: string
          status?: string
          storage_bucket?: string | null
          storage_path?: string | null
          user_agent?: string
        }
        Relationships: [
          {
            foreignKeyName: "sec_ingestion_runs_cik_fkey"
            columns: ["cik"]
            isOneToOne: false
            referencedRelation: "sec_companies"
            referencedColumns: ["cik"]
          },
        ]
      }
      sec_normalized_fact_sources: {
        Row: {
          cik: string
          normalized_fact_id: string
          raw_fact_hash: string
          role: string
        }
        Insert: {
          cik: string
          normalized_fact_id: string
          raw_fact_hash: string
          role?: string
        }
        Update: {
          cik?: string
          normalized_fact_id?: string
          raw_fact_hash?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "sec_normalized_fact_sources_cik_normalized_fact_id_fkey"
            columns: ["cik", "normalized_fact_id"]
            isOneToOne: false
            referencedRelation: "sec_normalized_facts"
            referencedColumns: ["cik", "normalized_fact_id"]
          },
          {
            foreignKeyName: "sec_normalized_fact_sources_cik_raw_fact_hash_fkey"
            columns: ["cik", "raw_fact_hash"]
            isOneToOne: false
            referencedRelation: "sec_raw_facts"
            referencedColumns: ["cik", "fact_hash"]
          },
        ]
      }
      sec_normalized_facts: {
        Row: {
          accession_number: string
          canonical_concept: string
          cik: string
          created_at: string
          is_current: boolean
          logical_key: string
          normalized_fact_id: string
          normalizer_version: string
          period_end: string
          period_start: string | null
          period_type: string
          resolved_fiscal_period: string | null
          resolved_fiscal_year: number | null
          rule_version: string
          sec_fiscal_period: string | null
          sec_fiscal_year: number | null
          source_run_id: string
          superseded_by: string | null
          unit: string
          value_numeric: number
        }
        Insert: {
          accession_number: string
          canonical_concept: string
          cik: string
          created_at?: string
          is_current?: boolean
          logical_key: string
          normalized_fact_id?: string
          normalizer_version: string
          period_end: string
          period_start?: string | null
          period_type: string
          resolved_fiscal_period?: string | null
          resolved_fiscal_year?: number | null
          rule_version: string
          sec_fiscal_period?: string | null
          sec_fiscal_year?: number | null
          source_run_id: string
          superseded_by?: string | null
          unit: string
          value_numeric: number
        }
        Update: {
          accession_number?: string
          canonical_concept?: string
          cik?: string
          created_at?: string
          is_current?: boolean
          logical_key?: string
          normalized_fact_id?: string
          normalizer_version?: string
          period_end?: string
          period_start?: string | null
          period_type?: string
          resolved_fiscal_period?: string | null
          resolved_fiscal_year?: number | null
          rule_version?: string
          sec_fiscal_period?: string | null
          sec_fiscal_year?: number | null
          source_run_id?: string
          superseded_by?: string | null
          unit?: string
          value_numeric?: number
        }
        Relationships: [
          {
            foreignKeyName: "sec_normalized_facts_cik_accession_number_fkey"
            columns: ["cik", "accession_number"]
            isOneToOne: false
            referencedRelation: "sec_filings"
            referencedColumns: ["cik", "accession_number"]
          },
          {
            foreignKeyName: "sec_normalized_facts_cik_fkey"
            columns: ["cik"]
            isOneToOne: false
            referencedRelation: "sec_companies"
            referencedColumns: ["cik"]
          },
          {
            foreignKeyName: "sec_normalized_facts_cik_logical_key_accession_number_supe_fkey"
            columns: ["cik", "logical_key", "accession_number", "superseded_by"]
            isOneToOne: false
            referencedRelation: "sec_normalized_facts"
            referencedColumns: [
              "cik",
              "logical_key",
              "accession_number",
              "normalized_fact_id",
            ]
          },
          {
            foreignKeyName: "sec_normalized_facts_cik_source_run_id_fkey"
            columns: ["cik", "source_run_id"]
            isOneToOne: false
            referencedRelation: "sec_ingestion_runs"
            referencedColumns: ["cik", "run_id"]
          },
        ]
      }
      sec_raw_fact_observations: {
        Row: {
          cik: string
          conflict: boolean
          conflict_detail: Json | null
          conflict_kind: string | null
          filed_date: string | null
          fiscal_period: string | null
          fiscal_year: number | null
          form: string | null
          frame: string | null
          observation_id: string
          observed_at: string
          raw_fact_hash: string
          raw_json: Json
          raw_json_sha256: string
          run_id: string
        }
        Insert: {
          cik: string
          conflict?: boolean
          conflict_detail?: Json | null
          conflict_kind?: string | null
          filed_date?: string | null
          fiscal_period?: string | null
          fiscal_year?: number | null
          form?: string | null
          frame?: string | null
          observation_id?: string
          observed_at?: string
          raw_fact_hash: string
          raw_json: Json
          raw_json_sha256: string
          run_id: string
        }
        Update: {
          cik?: string
          conflict?: boolean
          conflict_detail?: Json | null
          conflict_kind?: string | null
          filed_date?: string | null
          fiscal_period?: string | null
          fiscal_year?: number | null
          form?: string | null
          frame?: string | null
          observation_id?: string
          observed_at?: string
          raw_fact_hash?: string
          raw_json?: Json
          raw_json_sha256?: string
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sec_raw_fact_observations_cik_raw_fact_hash_fkey"
            columns: ["cik", "raw_fact_hash"]
            isOneToOne: false
            referencedRelation: "sec_raw_facts"
            referencedColumns: ["cik", "fact_hash"]
          },
          {
            foreignKeyName: "sec_raw_fact_observations_cik_run_id_fkey"
            columns: ["cik", "run_id"]
            isOneToOne: false
            referencedRelation: "sec_ingestion_runs"
            referencedColumns: ["cik", "run_id"]
          },
        ]
      }
      sec_raw_facts: {
        Row: {
          accession_number: string
          cik: string
          created_at: string
          fact_hash: string
          fact_hash_version: number
          first_run_id: string
          fiscal_period: string | null
          fiscal_year: number | null
          period_end: string
          period_start: string | null
          period_type: string
          tag: string
          taxonomy_key: string
          taxonomy_uri: string | null
          unit: string | null
          value_kind: string
          value_numeric: number | null
          value_text: string | null
        }
        Insert: {
          accession_number: string
          cik: string
          created_at?: string
          fact_hash: string
          fact_hash_version?: number
          first_run_id: string
          fiscal_period?: string | null
          fiscal_year?: number | null
          period_end: string
          period_start?: string | null
          period_type: string
          tag: string
          taxonomy_key: string
          taxonomy_uri?: string | null
          unit?: string | null
          value_kind: string
          value_numeric?: number | null
          value_text?: string | null
        }
        Update: {
          accession_number?: string
          cik?: string
          created_at?: string
          fact_hash?: string
          fact_hash_version?: number
          first_run_id?: string
          fiscal_period?: string | null
          fiscal_year?: number | null
          period_end?: string
          period_start?: string | null
          period_type?: string
          tag?: string
          taxonomy_key?: string
          taxonomy_uri?: string | null
          unit?: string | null
          value_kind?: string
          value_numeric?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sec_raw_facts_cik_accession_number_fkey"
            columns: ["cik", "accession_number"]
            isOneToOne: false
            referencedRelation: "sec_filings"
            referencedColumns: ["cik", "accession_number"]
          },
          {
            foreignKeyName: "sec_raw_facts_cik_first_run_id_fkey"
            columns: ["cik", "first_run_id"]
            isOneToOne: false
            referencedRelation: "sec_ingestion_runs"
            referencedColumns: ["cik", "run_id"]
          },
        ]
      }
      sec_ticker_mappings: {
        Row: {
          cik: string
          created_at: string
          exchange: string | null
          is_active: boolean
          ticker: string
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          cik: string
          created_at?: string
          exchange?: string | null
          is_active?: boolean
          ticker: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          cik?: string
          created_at?: string
          exchange?: string | null
          is_active?: boolean
          ticker?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sec_ticker_mappings_cik_fkey"
            columns: ["cik"]
            isOneToOne: false
            referencedRelation: "sec_companies"
            referencedColumns: ["cik"]
          },
        ]
      }
      theses: {
        Row: {
          analysis_date: string
          chart_data: Json | null
          company_name: string
          created_at: string
          currency: string
          current_price: number
          direction: Database["public"]["Enums"]["thesis_direction"]
          executive_summary: string | null
          id: string
          investment_case: string | null
          is_published: boolean
          market_cap_category: Database["public"]["Enums"]["market_cap_category"]
          metrics: Json | null
          risks: string | null
          sector: string
          sparkline_data: Json | null
          strategy: Database["public"]["Enums"]["investment_strategy"]
          target_price: number | null
          ticker: string
          updated_at: string
          user_id: string | null
          valuation: string | null
        }
        Insert: {
          analysis_date?: string
          chart_data?: Json | null
          company_name: string
          created_at?: string
          currency?: string
          current_price: number
          direction?: Database["public"]["Enums"]["thesis_direction"]
          executive_summary?: string | null
          id?: string
          investment_case?: string | null
          is_published?: boolean
          market_cap_category?: Database["public"]["Enums"]["market_cap_category"]
          metrics?: Json | null
          risks?: string | null
          sector: string
          sparkline_data?: Json | null
          strategy?: Database["public"]["Enums"]["investment_strategy"]
          target_price?: number | null
          ticker: string
          updated_at?: string
          user_id?: string | null
          valuation?: string | null
        }
        Update: {
          analysis_date?: string
          chart_data?: Json | null
          company_name?: string
          created_at?: string
          currency?: string
          current_price?: number
          direction?: Database["public"]["Enums"]["thesis_direction"]
          executive_summary?: string | null
          id?: string
          investment_case?: string | null
          is_published?: boolean
          market_cap_category?: Database["public"]["Enums"]["market_cap_category"]
          metrics?: Json | null
          risks?: string | null
          sector?: string
          sparkline_data?: Json | null
          strategy?: Database["public"]["Enums"]["investment_strategy"]
          target_price?: number | null
          ticker?: string
          updated_at?: string
          user_id?: string | null
          valuation?: string | null
        }
        Relationships: []
      }
      thesis_alerts: {
        Row: {
          acknowledged: boolean | null
          alert_type: string
          created_at: string | null
          email_sent: boolean | null
          id: string
          message: string
          thesis_id: string | null
          ticker: string
          triggered_at: string | null
          user_id: string
        }
        Insert: {
          acknowledged?: boolean | null
          alert_type: string
          created_at?: string | null
          email_sent?: boolean | null
          id?: string
          message: string
          thesis_id?: string | null
          ticker: string
          triggered_at?: string | null
          user_id: string
        }
        Update: {
          acknowledged?: boolean | null
          alert_type?: string
          created_at?: string | null
          email_sent?: boolean | null
          id?: string
          message?: string
          thesis_id?: string | null
          ticker?: string
          triggered_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thesis_alerts_thesis_id_fkey"
            columns: ["thesis_id"]
            isOneToOne: false
            referencedRelation: "public_thesis_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thesis_alerts_thesis_id_fkey"
            columns: ["thesis_id"]
            isOneToOne: false
            referencedRelation: "public_thesis_data_view"
            referencedColumns: ["id"]
          },
        ]
      }
      thesis_purchases: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          price_per_share: number
          purchase_date: string
          shares: number
          thesis_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          price_per_share: number
          purchase_date?: string
          shares: number
          thesis_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          price_per_share?: number
          purchase_date?: string
          shares?: number
          thesis_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thesis_purchases_thesis_id_fkey"
            columns: ["thesis_id"]
            isOneToOne: false
            referencedRelation: "theses"
            referencedColumns: ["id"]
          },
        ]
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
    }
    Views: {
      public_thesis_data_view: {
        Row: {
          alert_type: string | null
          analyst_notes: string | null
          base_fcf: number | null
          capital_allocation_data: Json | null
          capital_efficiency_data: Json | null
          cash: number | null
          company_name: string | null
          created_at: string | null
          current_price: number | null
          dcf_projections: Json | null
          export_config: Json | null
          fair_value: number | null
          growth_margins_data: Json | null
          id: string | null
          implied_growth_rate: number | null
          kpi_data: Json | null
          published_at: string | null
          sensitivity_matrix: Json | null
          shares_outstanding: number | null
          terminal_growth: number | null
          ticker: string | null
          total_debt: number | null
          updated_at: string | null
          upside_percent: number | null
          valuation_context_data: Json | null
          wacc: number | null
        }
        Insert: {
          alert_type?: string | null
          analyst_notes?: string | null
          base_fcf?: number | null
          capital_allocation_data?: Json | null
          capital_efficiency_data?: Json | null
          cash?: number | null
          company_name?: string | null
          created_at?: string | null
          current_price?: number | null
          dcf_projections?: Json | null
          export_config?: Json | null
          fair_value?: number | null
          growth_margins_data?: Json | null
          id?: string | null
          implied_growth_rate?: number | null
          kpi_data?: Json | null
          published_at?: string | null
          sensitivity_matrix?: Json | null
          shares_outstanding?: number | null
          terminal_growth?: number | null
          ticker?: string | null
          total_debt?: number | null
          updated_at?: string | null
          upside_percent?: number | null
          valuation_context_data?: Json | null
          wacc?: number | null
        }
        Update: {
          alert_type?: string | null
          analyst_notes?: string | null
          base_fcf?: number | null
          capital_allocation_data?: Json | null
          capital_efficiency_data?: Json | null
          cash?: number | null
          company_name?: string | null
          created_at?: string | null
          current_price?: number | null
          dcf_projections?: Json | null
          export_config?: Json | null
          fair_value?: number | null
          growth_margins_data?: Json | null
          id?: string | null
          implied_growth_rate?: number | null
          kpi_data?: Json | null
          published_at?: string | null
          sensitivity_matrix?: Json | null
          shares_outstanding?: number | null
          terminal_growth?: number | null
          ticker?: string | null
          total_debt?: number | null
          updated_at?: string | null
          upside_percent?: number | null
          valuation_context_data?: Json | null
          wacc?: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      sec_fail_run: {
        Args: { _conflict_samples?: Json; _message: string; _run_id: string }
        Returns: undefined
      }
      sec_fail_stale_runs: { Args: { _older_than: string }; Returns: number }
      sec_finalize_run: {
        Args: { _conflict_samples?: Json; _counts: Json; _run_id: string }
        Returns: string
      }
      sec_is_admin: { Args: never; Returns: boolean }
      sec_record_download: {
        Args: {
          _content_type: string
          _http_status: number
          _payload_bytes: number
          _payload_sha256: string
          _run_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      analysis_template_type:
        | "dcf"
        | "comparables"
        | "lbo"
        | "sum_of_parts"
        | "custom"
      app_role: "admin" | "user"
      investment_strategy:
        | "value"
        | "growth"
        | "compounder"
        | "turnaround"
        | "dividend"
      market_cap_category: "mega" | "large" | "mid" | "small" | "micro"
      thesis_direction: "long" | "short"
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
      analysis_template_type: [
        "dcf",
        "comparables",
        "lbo",
        "sum_of_parts",
        "custom",
      ],
      app_role: ["admin", "user"],
      investment_strategy: [
        "value",
        "growth",
        "compounder",
        "turnaround",
        "dividend",
      ],
      market_cap_category: ["mega", "large", "mid", "small", "micro"],
      thesis_direction: ["long", "short"],
    },
  },
} as const
