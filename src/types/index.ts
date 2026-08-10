export type UserRole =
  | 'platform_owner'
  | 'super_admin'
  | 'admin'
  | 'operations_manager'
  | 'operations_staff'
  | 'viewer';

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  job_title: string;
  is_active: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  created_by_id: string | null;
  promoted_by_name: string;
  deactivated_by_id: string | null;
  deactivated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubAgent {
  id: string;
  organisation_name: string;
  contact_person: string;
  country: string;
  email: string | null;
  phone_number: string | null;
  active_status: boolean;
  notes: string | null;
  is_sample_data: boolean;
  internal_code: string | null;
  agent_match_key: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface Pilgrim {
  id: string;
  full_name: string;
  passport_number: string;
  nationality: string;
  phone_number: string | null;
  gender: 'male' | 'female' | null;
  date_of_birth: string | null;
  sub_agent_id: string | null;
  arrival_date: string | null;
  expected_departure_date: string;
  actual_departure_date: string | null;
  operational_notes: string | null;
  is_sample_data: boolean;
  visa_number: string | null;
  makkah_hotel: string | null;
  madinah_hotel: string | null;
  transportation: string | null;
  visa_company: string | null;
  arrival_port: string | null;
  contract_record_date: string | null;
  source_sheet: string | null;
  source_row: number | null;
  import_batch_id: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  sub_agents?: SubAgent | null;
  // Actual confirmation fields (manual staff action only)
  actual_arrival_at?: string | null;
  arrival_confirmed_at?: string | null;
  arrival_confirmed_by?: string | null;
  arrival_port_actual?: string | null;
  arrival_flight_number?: string | null;
  arrival_notes?: string | null;
  departure_confirmed_at?: string | null;
  departure_confirmed_by?: string | null;
  departure_airport?: string | null;
  departure_flight_number?: string | null;
  departure_notes?: string | null;
  // Planned return date (from CSV, not an actual departure)
  expected_return_date?: string | null;
  // Status provenance
  status_source?: string | null;
}

export interface AuditLog {
  id: string;
  action: string;
  record_type: string;
  record_id: string | null;
  record_label: string;
  previous_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  performed_by: string | null;
  performed_by_name: string;
  created_at: string;
}

export interface PilgrimInput {
  full_name: string;
  passport_number: string;
  nationality: string;
  phone_number?: string | null;
  gender?: 'male' | 'female' | null;
  date_of_birth?: string | null;
  sub_agent_id?: string | null;
  arrival_date?: string | null;
  expected_departure_date: string;
  expected_return_date?: string | null;
  actual_departure_date?: string | null;
  operational_notes?: string | null;
  is_sample_data?: boolean;
}

export interface SubAgentInput {
  organisation_name: string;
  contact_person: string;
  country: string;
  email?: string | null;
  phone_number?: string | null;
  active_status?: boolean;
  notes?: string | null;
  is_sample_data?: boolean;
}

export const ROLE_HIERARCHY: UserRole[] = [
  'platform_owner',
  'super_admin',
  'admin',
  'operations_manager',
  'operations_staff',
  'viewer',
];

export const ROLE_LABELS: Record<UserRole, string> = {
  platform_owner: 'Platform Owner',
  super_admin: 'Super Administrator',
  admin: 'Administrator',
  operations_manager: 'Operations Manager',
  operations_staff: 'Operations Staff',
  viewer: 'Viewer',
};

export const ROLE_SHORT_LABELS: Record<UserRole, string> = {
  platform_owner: 'Owner',
  super_admin: 'Super Admin',
  admin: 'Admin',
  operations_manager: 'Ops Manager',
  operations_staff: 'Ops Staff',
  viewer: 'Viewer',
};

export const JOB_TITLE_SUGGESTIONS = [
  'CEO',
  'General Director',
  'Managing Director',
  'Head of Operations',
  'Operations Manager',
  'Accountant',
  'Visa Officer',
  'Customer Service Officer',
  'System Administrator',
  'Trusted System Administrator',
];
