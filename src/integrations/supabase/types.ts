export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      app_settings: {
        Row: {
          ai_risk_analysis: boolean;
          auto_schedule: boolean;
          id: number;
          sla_breach_days: number;
          sla_warning_days: number;
          teams_reminders: boolean;
          updated_at: string;
          weekly_digest: boolean;
        };
        Insert: {
          ai_risk_analysis?: boolean;
          auto_schedule?: boolean;
          id?: number;
          sla_breach_days?: number;
          sla_warning_days?: number;
          teams_reminders?: boolean;
          updated_at?: string;
          weekly_digest?: boolean;
        };
        Update: {
          ai_risk_analysis?: boolean;
          auto_schedule?: boolean;
          id?: number;
          sla_breach_days?: number;
          sla_warning_days?: number;
          teams_reminders?: boolean;
          updated_at?: string;
          weekly_digest?: boolean;
        };
        Relationships: [];
      };
      candidate_activity_log: {
        Row: {
          action_type: string;
          candidate_id: string;
          created_at: string;
          details: Json;
          id: string;
        };
        Insert: {
          action_type: string;
          candidate_id: string;
          created_at?: string;
          details?: Json;
          id?: string;
        };
        Update: {
          action_type?: string;
          candidate_id?: string;
          created_at?: string;
          details?: Json;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "candidate_activity_log_candidate_id_fkey";
            columns: ["candidate_id"];
            isOneToOne: false;
            referencedRelation: "candidates";
            referencedColumns: ["id"];
          },
        ];
      };
      candidates: {
        Row: {
          created_at: string;
          current_stage: string;
          email: string;
          experience_years: number;
          first_name: string;
          id: string;
          job_id: string | null;
          last_name: string;
          phone: string | null;
          resume_url: string | null;
          rejection_reason: string | null;
          skills: string[];
          source: string;
          status_updated_at: string;
        };
        Insert: {
          created_at?: string;
          current_stage?: string;
          email: string;
          experience_years?: number;
          first_name: string;
          id?: string;
          job_id?: string | null;
          last_name: string;
          phone?: string | null;
          resume_url?: string | null;
          rejection_reason?: string | null;
          skills?: string[];
          source?: string;
          status_updated_at?: string;
        };
        Update: {
          created_at?: string;
          current_stage?: string;
          email?: string;
          experience_years?: number;
          first_name?: string;
          id?: string;
          job_id?: string | null;
          last_name?: string;
          phone?: string | null;
          resume_url?: string | null;
          rejection_reason?: string | null;
          skills?: string[];
          source?: string;
          status_updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "candidates_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      departments: {
        Row: {
          code: string;
          created_at: string;
          id: string;
          name: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          id?: string;
          name: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      interview_feedback: {
        Row: {
          decision: string;
          id: string;
          interview_id: string;
          overall_score: number;
          risk_level: string;
          risk_rationale: string | null;
          rubric_responses: Json;
          submitted_at: string;
          summary_comments: string | null;
        };
        Insert: {
          decision?: string;
          id?: string;
          interview_id: string;
          overall_score?: number;
          risk_level?: string;
          risk_rationale?: string | null;
          rubric_responses?: Json;
          submitted_at?: string;
          summary_comments?: string | null;
        };
        Update: {
          decision?: string;
          id?: string;
          interview_id?: string;
          overall_score?: number;
          risk_level?: string;
          risk_rationale?: string | null;
          rubric_responses?: Json;
          submitted_at?: string;
          summary_comments?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "interview_feedback_interview_id_fkey";
            columns: ["interview_id"];
            isOneToOne: false;
            referencedRelation: "interviews";
            referencedColumns: ["id"];
          },
        ];
      };
      interviewers: {
        Row: {
          created_at: string;
          email: string;
          id: string;
          name: string;
          skills: string[];
          timezone: string;
          title: string;
        };
        Insert: {
          created_at?: string;
          email: string;
          id?: string;
          name: string;
          skills?: string[];
          timezone?: string;
          title?: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          id?: string;
          name?: string;
          skills?: string[];
          timezone?: string;
          title?: string;
        };
        Relationships: [];
      };
      interviews: {
        Row: {
          booking_group_id: string;
          candidate_id: string;
          created_at: string;
          id: string;
          interviewer_id: string | null;
          job_id: string | null;
          meeting_link: string | null;
          scheduled_end: string;
          scheduled_start: string;
          stage: string;
          status: string;
        };
        Insert: {
          booking_group_id?: string;
          candidate_id: string;
          created_at?: string;
          id?: string;
          interviewer_id?: string | null;
          job_id?: string | null;
          meeting_link?: string | null;
          scheduled_end: string;
          scheduled_start: string;
          stage: string;
          status?: string;
        };
        Update: {
          booking_group_id?: string;
          candidate_id?: string;
          created_at?: string;
          id?: string;
          interviewer_id?: string | null;
          job_id?: string | null;
          meeting_link?: string | null;
          scheduled_end?: string;
          scheduled_start?: string;
          stage?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "interviews_candidate_id_fkey";
            columns: ["candidate_id"];
            isOneToOne: false;
            referencedRelation: "candidates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "interviews_interviewer_id_fkey";
            columns: ["interviewer_id"];
            isOneToOne: false;
            referencedRelation: "interviewers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "interviews_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      jobs: {
        Row: {
          created_at: string;
          department: string;
          department_id: string;
          description: string | null;
          id: string;
          job_code: string;
          location: string;
          open_since: string;
          required_skills: string[];
          status: string;
          title: string;
        };
        Insert: {
          created_at?: string;
          department?: string;
          department_id: string;
          description?: string | null;
          id?: string;
          job_code?: string;
          location?: string;
          open_since?: string;
          required_skills?: string[];
          status?: string;
          title: string;
        };
        Update: {
          created_at?: string;
          department?: string;
          department_id?: string;
          description?: string | null;
          id?: string;
          job_code?: string;
          location?: string;
          open_since?: string;
          required_skills?: string[];
          status?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "jobs_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      import_candidates: {
        Args: { import_rows: Json };
        Returns: number;
      };
      import_positions: {
        Args: { import_rows: Json };
        Returns: number;
      };
      create_job_with_code: {
        Args: {
          title: string;
          department_id: string;
          description?: string | null;
          location?: string;
          required_skills?: string[];
          status?: string;
        };
        Returns: Database["public"]["Tables"]["jobs"]["Row"];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
