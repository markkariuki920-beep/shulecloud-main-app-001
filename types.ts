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
      academic_years: {
        Row: {
          created_at: string
          ends_on: string
          id: string
          is_current: boolean
          name: string
          school_id: string
          starts_on: string
        }
        Insert: {
          created_at?: string
          ends_on: string
          id?: string
          is_current?: boolean
          name: string
          school_id: string
          starts_on: string
        }
        Update: {
          created_at?: string
          ends_on?: string
          id?: string
          is_current?: boolean
          name?: string
          school_id?: string
          starts_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_years_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          class_id: string
          id: string
          on_date: string
          recorded_by: string
          school_id: string
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          class_id: string
          id?: string
          on_date: string
          recorded_by: string
          school_id: string
          status: string
          student_id: string
          updated_at?: string
        }
        Update: {
          class_id?: string
          id?: string
          on_date?: string
          recorded_by?: string
          school_id?: string
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          id: string
          school_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          school_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          school_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      backup_runs: {
        Row: {
          checksum: string | null
          error: string | null
          file_deleted_at: string | null
          file_path: string | null
          finished_at: string | null
          id: string
          restored_at: string | null
          restored_by: string | null
          size_bytes: number | null
          started_at: string
          started_by: string | null
          status: string
          table_counts: Json | null
          trigger: string
          verified_at: string | null
        }
        Insert: {
          checksum?: string | null
          error?: string | null
          file_deleted_at?: string | null
          file_path?: string | null
          finished_at?: string | null
          id?: string
          restored_at?: string | null
          restored_by?: string | null
          size_bytes?: number | null
          started_at?: string
          started_by?: string | null
          status?: string
          table_counts?: Json | null
          trigger: string
          verified_at?: string | null
        }
        Update: {
          checksum?: string | null
          error?: string | null
          file_deleted_at?: string | null
          file_path?: string | null
          finished_at?: string | null
          id?: string
          restored_at?: string | null
          restored_by?: string | null
          size_bytes?: number | null
          started_at?: string
          started_by?: string | null
          status?: string
          table_counts?: Json | null
          trigger?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      classes: {
        Row: {
          class_teacher_id: string | null
          created_at: string
          id: string
          name: string
          school_id: string
          stream: string | null
        }
        Insert: {
          class_teacher_id?: string | null
          created_at?: string
          id?: string
          name: string
          school_id: string
          stream?: string | null
        }
        Update: {
          class_teacher_id?: string | null
          created_at?: string
          id?: string
          name?: string
          school_id?: string
          stream?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "classes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_marks: {
        Row: {
          entered_by: string
          exam_id: string
          id: string
          school_id: string
          score: number
          student_id: string
          subject_id: string
          updated_at: string
        }
        Insert: {
          entered_by: string
          exam_id: string
          id?: string
          school_id: string
          score: number
          student_id: string
          subject_id: string
          updated_at?: string
        }
        Update: {
          entered_by?: string
          exam_id?: string
          id?: string
          school_id?: string
          score?: number
          student_id?: string
          subject_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_marks_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_marks_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_marks_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_marks_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      exams: {
        Row: {
          created_at: string
          id: string
          is_locked: boolean
          max_score: number
          name: string
          school_id: string
          term_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_locked?: boolean
          max_score?: number
          name: string
          school_id: string
          term_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_locked?: boolean
          max_score?: number
          name?: string
          school_id?: string
          term_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exams_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_items: {
        Row: {
          amount: number
          class_id: string | null
          created_at: string
          id: string
          name: string
          school_id: string
          term_id: string | null
        }
        Insert: {
          amount: number
          class_id?: string | null
          created_at?: string
          id?: string
          name: string
          school_id: string
          term_id?: string | null
        }
        Update: {
          amount?: number
          class_id?: string | null
          created_at?: string
          id?: string
          name?: string
          school_id?: string
          term_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fee_items_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_items_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_items_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      grade_bands: {
        Row: {
          created_at: string
          grade: string
          id: string
          min_score: number
          points: number | null
          remark: string | null
          school_id: string
        }
        Insert: {
          created_at?: string
          grade: string
          id?: string
          min_score: number
          points?: number | null
          remark?: string | null
          school_id: string
        }
        Update: {
          created_at?: string
          grade?: string
          id?: string
          min_score?: number
          points?: number | null
          remark?: string | null
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grade_bands_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_settings: {
        Row: {
          config: Json
          enabled: boolean
          last_check: string | null
          provider: string
          secret_hints: Json
          secrets_encrypted: string | null
          updated_at: string
          updated_by: string | null
          verified_at: string | null
        }
        Insert: {
          config?: Json
          enabled?: boolean
          last_check?: string | null
          provider: string
          secret_hints?: Json
          secrets_encrypted?: string | null
          updated_at?: string
          updated_by?: string | null
          verified_at?: string | null
        }
        Update: {
          config?: Json
          enabled?: boolean
          last_check?: string | null
          provider?: string
          secret_hints?: Json
          secrets_encrypted?: string | null
          updated_at?: string
          updated_by?: string | null
          verified_at?: string | null
        }
        Relationships: []
      }
      invoices: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          description: string
          fee_item_id: string | null
          id: string
          school_id: string
          student_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string
          description: string
          fee_item_id?: string | null
          id?: string
          school_id: string
          student_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          description?: string
          fee_item_id?: string | null
          id?: string
          school_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_fee_item_id_fkey"
            columns: ["fee_item_id"]
            isOneToOne: false
            referencedRelation: "fee_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      mpesa_transactions: {
        Row: {
          amount: number
          checkout_request_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          environment: string
          id: string
          merchant_request_id: string | null
          months: number
          mpesa_receipt: string | null
          payment_id: string | null
          phone: string
          result_code: string | null
          result_desc: string | null
          school_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          checkout_request_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by: string
          environment: string
          id?: string
          merchant_request_id?: string | null
          months: number
          mpesa_receipt?: string | null
          payment_id?: string | null
          phone: string
          result_code?: string | null
          result_desc?: string | null
          school_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          checkout_request_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          environment?: string
          id?: string
          merchant_request_id?: string | null
          months?: number
          mpesa_receipt?: string | null
          payment_id?: string | null
          phone?: string
          result_code?: string | null
          result_desc?: string | null
          school_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mpesa_transactions_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "subscription_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mpesa_transactions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_links: {
        Row: {
          created_at: string
          email: string
          id: string
          parent_id: string | null
          school_id: string
          student_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          parent_id?: string | null
          school_id: string
          student_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          parent_id?: string | null
          school_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_links_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_links_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          method: string
          paid_on: string
          receipt_no: number
          recorded_by: string
          reference: string | null
          school_id: string
          student_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          method?: string
          paid_on?: string
          receipt_no?: number
          recorded_by?: string
          reference?: string | null
          school_id: string
          student_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          method?: string
          paid_on?: string
          receipt_no?: number
          recorded_by?: string
          reference?: string | null
          school_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          backup_retention_days: number
          id: boolean
          trial_days: number
          updated_at: string
        }
        Insert: {
          backup_retention_days?: number
          id?: boolean
          trial_days?: number
          updated_at?: string
        }
        Update: {
          backup_retention_days?: number
          id?: boolean
          trial_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      scheduled_job_locks: {
        Row: {
          job_name: string
          lease_token: string
          lock_expires_at: string
          updated_at: string
        }
        Insert: {
          job_name: string
          lease_token: string
          lock_expires_at: string
          updated_at?: string
        }
        Update: {
          job_name?: string
          lease_token?: string
          lock_expires_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      school_applications: {
        Row: {
          applicant_id: string
          county: string
          created_at: string
          email: string
          id: string
          level: Database["public"]["Enums"]["school_level"]
          phone: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          school_id: string | null
          school_name: string
          status: Database["public"]["Enums"]["application_status"]
          student_estimate: number | null
        }
        Insert: {
          applicant_id: string
          county: string
          created_at?: string
          email: string
          id?: string
          level: Database["public"]["Enums"]["school_level"]
          phone: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_id?: string | null
          school_name: string
          status?: Database["public"]["Enums"]["application_status"]
          student_estimate?: number | null
        }
        Update: {
          applicant_id?: string
          county?: string
          created_at?: string
          email?: string
          id?: string
          level?: Database["public"]["Enums"]["school_level"]
          phone?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_id?: string | null
          school_name?: string
          status?: Database["public"]["Enums"]["application_status"]
          student_estimate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "school_applications_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_drive_backups: {
        Row: {
          connected_at: string | null
          created_by: string | null
          enabled: boolean
          frequency: string
          google_email: string | null
          last_error: string | null
          last_file_id: string | null
          last_file_name: string | null
          last_file_url: string | null
          last_run_at: string | null
          last_status: string | null
          last_success_at: string | null
          refresh_token_encrypted: string | null
          school_id: string
          updated_at: string
        }
        Insert: {
          connected_at?: string | null
          created_by?: string | null
          enabled?: boolean
          frequency?: string
          google_email?: string | null
          last_error?: string | null
          last_file_id?: string | null
          last_file_name?: string | null
          last_file_url?: string | null
          last_run_at?: string | null
          last_status?: string | null
          last_success_at?: string | null
          refresh_token_encrypted?: string | null
          school_id: string
          updated_at?: string
        }
        Update: {
          connected_at?: string | null
          created_by?: string | null
          enabled?: boolean
          frequency?: string
          google_email?: string | null
          last_error?: string | null
          last_file_id?: string | null
          last_file_name?: string | null
          last_file_url?: string | null
          last_run_at?: string | null
          last_status?: string | null
          last_success_at?: string | null
          refresh_token_encrypted?: string | null
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_drive_backups_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: true
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      schools: {
        Row: {
          approved_at: string
          archived_at: string | null
          county: string | null
          created_at: string
          email: string | null
          id: string
          level: Database["public"]["Enums"]["school_level"]
          manually_suspended: boolean
          name: string
          paid_until: string | null
          phone: string | null
          trial_ends_at: string
        }
        Insert: {
          approved_at?: string
          archived_at?: string | null
          county?: string | null
          created_at?: string
          email?: string | null
          id?: string
          level: Database["public"]["Enums"]["school_level"]
          manually_suspended?: boolean
          name: string
          paid_until?: string | null
          phone?: string | null
          trial_ends_at?: string
        }
        Update: {
          approved_at?: string
          archived_at?: string | null
          county?: string | null
          created_at?: string
          email?: string | null
          id?: string
          level?: Database["public"]["Enums"]["school_level"]
          manually_suspended?: boolean
          name?: string
          paid_until?: string | null
          phone?: string | null
          trial_ends_at?: string
        }
        Relationships: []
      }
      sms_messages: {
        Row: {
          attempts: number
          body: string
          created_at: string
          dedupe_key: string | null
          id: string
          kind: string
          last_error: string | null
          next_attempt_at: string
          provider: string | null
          provider_message_id: string | null
          school_id: string | null
          sent_at: string | null
          status: string
          to_phone: string
        }
        Insert: {
          attempts?: number
          body: string
          created_at?: string
          dedupe_key?: string | null
          id?: string
          kind: string
          last_error?: string | null
          next_attempt_at?: string
          provider?: string | null
          provider_message_id?: string | null
          school_id?: string | null
          sent_at?: string | null
          status?: string
          to_phone: string
        }
        Update: {
          attempts?: number
          body?: string
          created_at?: string
          dedupe_key?: string | null
          id?: string
          kind?: string
          last_error?: string | null
          next_attempt_at?: string
          provider?: string | null
          provider_message_id?: string | null
          school_id?: string | null
          sent_at?: string | null
          status?: string
          to_phone?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_messages_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_invitations: {
        Row: {
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          responded_at: string | null
          role: Database["public"]["Enums"]["app_role"]
          school_id: string
          status: string
        }
        Insert: {
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          responded_at?: string | null
          role: Database["public"]["Enums"]["app_role"]
          school_id: string
          status?: string
        }
        Update: {
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          responded_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          school_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_invitations_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          admission_no: string
          class_id: string | null
          created_at: string
          date_of_birth: string | null
          full_name: string
          gender: string | null
          guardian_name: string | null
          guardian_phone: string | null
          id: string
          is_active: boolean
          school_id: string
        }
        Insert: {
          admission_no: string
          class_id?: string | null
          created_at?: string
          date_of_birth?: string | null
          full_name: string
          gender?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          id?: string
          is_active?: boolean
          school_id: string
        }
        Update: {
          admission_no?: string
          class_id?: string | null
          created_at?: string
          date_of_birth?: string | null
          full_name?: string
          gender?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          id?: string
          is_active?: boolean
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          code: string | null
          created_at: string
          id: string
          name: string
          school_id: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          id?: string
          name: string
          school_id: string
        }
        Update: {
          code?: string | null
          created_at?: string
          id?: string
          name?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subjects_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          method: string
          months: number
          period_end: string | null
          period_start: string | null
          reference: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          school_id: string
          status: string
          submitted_by: string
          unit_price: number
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          method?: string
          months: number
          period_end?: string | null
          period_start?: string | null
          reference: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_id: string
          status?: string
          submitted_by?: string
          unit_price: number
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          method?: string
          months?: number
          period_end?: string | null
          period_start?: string | null
          reference?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_id?: string
          status?: string
          submitted_by?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "subscription_payments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          grace_days: number
          level: Database["public"]["Enums"]["school_level"]
          monthly_price: number
          updated_at: string
        }
        Insert: {
          grace_days?: number
          level: Database["public"]["Enums"]["school_level"]
          monthly_price: number
          updated_at?: string
        }
        Update: {
          grace_days?: number
          level?: Database["public"]["Enums"]["school_level"]
          monthly_price?: number
          updated_at?: string
        }
        Relationships: []
      }
      teacher_assignments: {
        Row: {
          class_id: string
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          school_id: string
          subject_id: string
          teacher_id: string
        }
        Insert: {
          class_id: string
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean
          school_id: string
          subject_id: string
          teacher_id: string
        }
        Update: {
          class_id?: string
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          school_id?: string
          subject_id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_assignments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_assignments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_assignments_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      terms: {
        Row: {
          academic_year_id: string
          created_at: string
          ends_on: string
          id: string
          name: string
          school_id: string
          starts_on: string
        }
        Insert: {
          academic_year_id: string
          created_at?: string
          ends_on: string
          id?: string
          name: string
          school_id: string
          starts_on: string
        }
        Update: {
          academic_year_id?: string
          created_at?: string
          ends_on?: string
          id?: string
          name?: string
          school_id?: string
          starts_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "terms_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terms_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          school_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          school_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          school_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_staff_invitation: {
        Args: { _invitation_id: string }
        Returns: string
      }
      archive_school: {
        Args: { _archive: boolean; _reason: string; _school_id: string }
        Returns: undefined
      }
      can_enter_mark: {
        Args: { _school_id: string; _student_id: string; _subject_id: string }
        Returns: boolean
      }
      can_manage_finance: { Args: { _school_id: string }; Returns: boolean }
      can_manage_school: { Args: { _school_id: string }; Returns: boolean }
      can_read_finance: { Args: { _school_id: string }; Returns: boolean }
      can_read_mark: {
        Args: { _school_id: string; _student_id: string; _subject_id: string }
        Returns: boolean
      }
      can_take_attendance: {
        Args: { _class_id: string; _school_id: string }
        Returns: boolean
      }
      cancel_staff_invitation: {
        Args: { _invitation_id: string }
        Returns: undefined
      }
      change_school_staff_role: {
        Args: {
          _role?: Database["public"]["Enums"]["app_role"]
          _school_id: string
          _user_id: string
        }
        Returns: undefined
      }
      claim_parent_links: { Args: never; Returns: number }
      claim_sms_batch: {
        Args: { _limit: number }
        Returns: {
          attempts: number
          body: string
          created_at: string
          dedupe_key: string | null
          id: string
          kind: string
          last_error: string | null
          next_attempt_at: string
          provider: string | null
          provider_message_id: string | null
          school_id: string | null
          sent_at: string | null
          status: string
          to_phone: string
        }[]
        SetofOptions: {
          from: "*"
          to: "sms_messages"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      complete_mpesa_payment: {
        Args: {
          _paid_amount: number
          _receipt: string
          _result_code: string
          _result_desc: string
          _status: string
          _tx_id: string
        }
        Returns: string
      }
      enqueue_sms: {
        Args: {
          _body: string
          _key: string
          _kind: string
          _school_id: string
          _to: string
        }
        Returns: undefined
      }
      enqueue_subscription_reminders: { Args: never; Returns: undefined }
      extend_trial: {
        Args: { _days: number; _reason: string; _school_id: string }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_school_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _school_id: string
          _user_id: string
        }
        Returns: boolean
      }
      has_teacher_assignment: {
        Args: { _class_id: string; _school_id: string; _subject_id?: string }
        Returns: boolean
      }
      invitation_matches_user: { Args: { _email: string }; Returns: boolean }
      invite_school_staff: {
        Args: {
          _email: string
          _role: Database["public"]["Enums"]["app_role"]
          _school_id: string
        }
        Returns: string
      }
      is_class_teacher: {
        Args: { _class_id: string; _school_id: string }
        Returns: boolean
      }
      is_parent_in_class: { Args: { _class_id: string }; Returns: boolean }
      is_parent_of: { Args: { _student_id: string }; Returns: boolean }
      is_school_member: {
        Args: { _school_id: string; _user_id: string }
        Returns: boolean
      }
      list_my_staff_invitations: {
        Args: never
        Returns: {
          expires_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          school_id: string
          school_name: string
        }[]
      }
      list_school_staff: {
        Args: { _school_id: string }
        Returns: {
          email: string
          full_name: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }[]
      }
      mpesa_stk_available: { Args: never; Returns: boolean }
      normalize_payment_ref: { Args: { _ref: string }; Returns: string }
      release_scheduled_job_lock: {
        Args: { _job_name: string; _lease_token: string }
        Returns: boolean
      }
      restore_platform_backup: {
        Args: { p_actor: string; p_run_id: string; p_tables: Json }
        Returns: Json
      }
      review_school_application: {
        Args: { _app_id: string; _approve: boolean; _note?: string }
        Returns: string
      }
      review_subscription_payment: {
        Args: { _confirm: boolean; _note?: string; _payment_id: string }
        Returns: undefined
      }
      school_is_writable: { Args: { _school_id: string }; Returns: boolean }
      school_status: {
        Args: { s: Database["public"]["Tables"]["schools"]["Row"] }
        Returns: string
      }
      set_backup_retention: { Args: { _days: number }; Returns: undefined }
      set_plan_price: {
        Args: {
          _grace_days: number
          _level: Database["public"]["Enums"]["school_level"]
          _price: number
        }
        Returns: undefined
      }
      set_school_suspension: {
        Args: { _reason: string; _school_id: string; _suspend: boolean }
        Returns: undefined
      }
      set_trial_days: { Args: { _days: number }; Returns: undefined }
      submit_subscription_payment: {
        Args: {
          _method: string
          _months: number
          _reference: string
          _school_id: string
        }
        Returns: string
      }
      subscription_revenue: {
        Args: { _from: string; _to: string }
        Returns: {
          payments: number
          total: number
        }[]
      }
      try_acquire_scheduled_job_lock: {
        Args: { _job_name: string; _lock_seconds?: number }
        Returns: string
      }
    }
    Enums: {
      app_role: "super_admin" | "school_admin" | "bursar" | "teacher" | "parent"
      application_status: "pending" | "approved" | "rejected"
      school_level: "primary" | "secondary" | "college"
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
      app_role: ["super_admin", "school_admin", "bursar", "teacher", "parent"],
      application_status: ["pending", "approved", "rejected"],
      school_level: ["primary", "secondary", "college"],
    },
  },
} as const
