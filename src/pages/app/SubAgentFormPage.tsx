import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, Save, Loader2, AlertCircle, Building2, Building } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { validateEmail, validatePhone, friendlyError } from '@/lib/validation';
import { logAudit } from '@/lib/audit';
import type { SubAgent, SubAgentInput } from '@/types';
import { PageHeader } from '@/components/PageHeader';

export default function SubAgentFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [form, setForm] = useState<SubAgentInput>({
    organisation_name: '',
    contact_person: '',
    country: '',
    email: '',
    phone_number: '',
    active_status: true,
    notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(isEdit);
  const [errors, setErrors] = useState<string[]>([]);
  const [dbError, setDbError] = useState<string | null>(null);
  const [existing, setExisting] = useState<SubAgent | null>(null);

  useEffect(() => {
    if (!id) return;
    setPageLoading(true);
    supabase
      .from('sub_agents')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) {
          setDbError('Sub-agent not found.');
        } else {
          const sa = data as SubAgent;
          setExisting(sa);
          setForm({
            organisation_name: sa.organisation_name,
            contact_person: sa.contact_person,
            country: sa.country,
            email: sa.email || '',
            phone_number: sa.phone_number || '',
            active_status: sa.active_status,
            notes: sa.notes || '',
          });
        }
        setPageLoading(false);
      });
  }, [id]);

  function update<K extends keyof SubAgentInput>(key: K, value: SubAgentInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrors([]);
    setDbError(null);

    const errs: string[] = [];
    if (!form.organisation_name?.trim()) errs.push('Organisation name is required.');
    if (!form.contact_person?.trim()) errs.push('Contact person is required.');
    if (!form.country?.trim()) errs.push('Country is required.');
    if (form.email && !validateEmail(form.email)) errs.push('Email address is not valid.');
    if (form.phone_number && !validatePhone(form.phone_number)) errs.push('Phone number format is not valid.');

    if (errs.length > 0) {
      setErrors(errs);
      return;
    }

    const clean: SubAgentInput = {
      ...form,
      email: form.email?.trim() || null,
      phone_number: form.phone_number?.trim() || null,
      notes: form.notes?.trim() || null,
    };

    setLoading(true);
    try {
      if (isEdit && id) {
        const { data, error } = await supabase
          .from('sub_agents')
          .update({ ...clean, updated_by: profile?.id ?? null, updated_at: new Date().toISOString() })
          .eq('id', id)
          .select('*')
          .maybeSingle();
        if (error) throw error;
        await logAudit({
          action: 'sub_agent_edited',
          recordType: 'sub_agent',
          recordId: id,
          recordLabel: clean.organisation_name,
          previousValue: existing as unknown as Record<string, unknown> | null,
          newValue: data as Record<string, unknown> | null,
          performedBy: profile?.id ?? null,
          performedByName: profile?.full_name ?? '',
        });
      } else {
        const { data, error } = await supabase
          .from('sub_agents')
          .insert({ ...clean, created_by: profile?.id ?? null, updated_by: profile?.id ?? null })
          .select('*')
          .maybeSingle();
        if (error) throw error;
        await logAudit({
          action: 'sub_agent_created',
          recordType: 'sub_agent',
          recordId: (data as { id: string } | null)?.id ?? null,
          recordLabel: clean.organisation_name,
          newValue: data as Record<string, unknown> | null,
          performedBy: profile?.id ?? null,
          performedByName: profile?.full_name ?? '',
        });
      }
      navigate('/app/sub-agents');
    } catch (err) {
      setDbError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  if (pageLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const inputCls = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 focus:outline-none transition-all';
  const labelCls = 'block text-sm font-semibold text-slate-700 mb-1.5';

  return (
    <div>
      <Link to={isEdit ? `/app/sub-agents/${id}` : '/app/sub-agents'} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      <PageHeader
        title={isEdit ? 'Edit Sub-Agent' : 'Add Sub-Agent'}
        subtitle={isEdit ? 'Update sub-agent details' : 'Register a new sub-agent organisation'}
        icon={isEdit ? <Building className="h-6 w-6" /> : <Building2 className="h-6 w-6" />}
      />

      {(errors.length > 0 || dbError) && (
        <div className="mb-6 rounded-2xl bg-red-50 border border-red-200 p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              {dbError && <p className="text-sm text-red-700 font-medium">{dbError}</p>}
              {errors.length > 0 && (
                <ul className="mt-1 space-y-1 text-sm text-red-700">
                  {errors.map((er) => <li key={er}>• {er}</li>)}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <h3 className="font-display font-bold text-base text-slate-900 mb-4">Organisation Details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Organisation Name <span className="text-red-500">*</span></label>
              <input className={inputCls} value={form.organisation_name} onChange={(e) => update('organisation_name', e.target.value)} placeholder="e.g. Al-Noor Pilgrim Services" />
            </div>
            <div>
              <label className={labelCls}>Contact Person <span className="text-red-500">*</span></label>
              <input className={inputCls} value={form.contact_person} onChange={(e) => update('contact_person', e.target.value)} placeholder="Full name" />
            </div>
            <div>
              <label className={labelCls}>Country <span className="text-red-500">*</span></label>
              <input className={inputCls} value={form.country} onChange={(e) => update('country', e.target.value)} placeholder="e.g. Nigeria" />
            </div>
            <div>
              <label className={labelCls}>Active Status</label>
              <select className={inputCls} value={form.active_status ? 'true' : 'false'} onChange={(e) => update('active_status', e.target.value === 'true')}>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input className={inputCls} value={form.email || ''} onChange={(e) => update('email', e.target.value)} placeholder="contact@example.com" />
            </div>
            <div>
              <label className={labelCls}>Phone Number</label>
              <input className={inputCls} value={form.phone_number || ''} onChange={(e) => update('phone_number', e.target.value)} placeholder="+234 800 000 0000" />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <h3 className="font-display font-bold text-base text-slate-900 mb-4">Notes</h3>
          <textarea
            className={`${inputCls} min-h-[100px] resize-y`}
            value={form.notes || ''}
            onChange={(e) => update('notes', e.target.value)}
            placeholder="Optional notes about this sub-agent..."
          />
        </div>

        <div className="flex items-center justify-end gap-3">
          <Link to={isEdit ? `/app/sub-agents/${id}` : '/app/sub-agents'} className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-900/20 hover:bg-brand-600 transition-all active:scale-95 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isEdit ? 'Save Changes' : 'Create Sub-Agent'}
          </button>
        </div>
      </form>
    </div>
  );
}
