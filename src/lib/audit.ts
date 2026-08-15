import { supabase } from './supabase';
import type { Profile } from '@/types';

/**
 * Inserts an audit log entry. Call after every important action.
 */
export async function logAudit(params: {
  action: string;
  recordType: string;
  recordId?: string | null;
  recordLabel: string;
  previousValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  performedBy?: string | null;
  performedByName?: string | null;
}): Promise<void> {
  try {
    // The actor is always taken from the live session, never from the caller's
    // arguments, so an entry cannot be attributed to somebody else.
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('audit_log').insert({
      action: params.action,
      record_type: params.recordType,
      record_id: params.recordId ?? null,
      record_label: params.recordLabel,
      previous_value: params.previousValue ?? null,
      new_value: params.newValue ?? null,
      performed_by: user.id,
      performed_by_name: params.performedByName ?? '',
    });
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}

export function profileDisplayName(p: Profile | null): string {
  if (!p) return 'System';
  return p.full_name || 'Staff Member';
}
