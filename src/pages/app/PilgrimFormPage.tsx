import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, Save, Loader2, AlertCircle, UserPlus, UserCog } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { validatePilgrim, friendlyError } from '@/lib/validation';
import { logAudit } from '@/lib/audit';
import type { Pilgrim, PilgrimInput, SubAgent } from '@/types';
import { PageHeader } from '@/components/PageHeader';

export default function PilgrimFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [form, setForm] = useState<PilgrimInput>({
    full_name: '',
    passport_number: '',
    nationality: '',
    phone_number: '',
    gender: null,
    date_of_birth: '',
    sub_agent_id: null,
    arrival_date: '',
    expected_departure_date: '',
    expected_return_date: '',
    actual_departure_date: '',
    operational_notes: '',
  });
  const [subAgents, setSubAgents] = useState<SubAgent[]>([]);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(isEdit);
  const [errors, setErrors] = useState<string[]>([]);
  const [dbError, setDbError] = useState<string | null>(null);
  const [existing, setExisting] = useState<Pilgrim | null>(null);

  useEffect(() => {
    supabase.from('sub_agents').select('*').eq('active_status', true).order('organisation_name').then(({ data }) => {
      if (data) setSubAgents(data as SubAgent[]);
    });
  }, []);

  useEffect(() => {
    if (!id) return;
    setPageLoading(true);
    supabase
      .from('pilgrims')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) {
          setDbError('Pilgrim not found.');
        } else {
          const p = data as Pilgrim;
          setExisting(p);
          setForm({
            full_name: p.full_name,
            passport_number: p.passport_number,
            nationality: p.nationality,
            phone_number: p.phone_number || '',
            gender: p.gender,
            date_of_birth: p.date_of_birth || '',
            sub_agent_id: p.sub_agent_id,
            arrival_date: p.arrival_date || '',
            expected_departure_date: p.expected_departure_date,
            expected_return_date: p.expected_return_date || '',
            actual_departure_date: p.actual_departure_date || '',
            operational_notes: p.operational_notes || '',
          });
        }
        setPageLoading(false);
      });
  }, [id]);

  function update<K extends keyof PilgrimInput>(key: K, value: PilgrimInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrors([]);
    setDbError(null);

    const cleanInput: PilgrimInput = {
      ...form,
      phone_number: form.phone_number?.trim() || null,
      date_of_birth: form.date_of_birth || null,
      arrival_date: form.arrival_date || null,
      expected_return_date: form.expected_return_date || null,
      actual_departure_date: form.actual_departure_date || null,
      operational_notes: form.operational_notes?.trim() || null,
      sub_agent_id: form.sub_agent_id || null,
      gender: form.gender || null,
      is_sample_data: false,
    };

    const validation = validatePilgrim(cleanInput);
    if (!validation.valid) {
      setErrors(validation.errors);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setLoading(true);
    try {
      if (isEdit && id) {
        const { data, error } = await supabase
          .from('pilgrims')
          .update({
            ...cleanInput,
            updated_by: profile?.id ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
          .select('*')
          .maybeSingle();

        if (error) throw error;
        await logAudit({
          action: 'pilgrim_edited',
          recordType: 'pilgrim',
          recordId: id,
          recordLabel: cleanInput.full_name,
          previousValue: existing as Record<string, unknown> | null,
          newValue: (data as Record<string, unknown> | null) ?? null,
          performedBy: profile?.id ?? null,
          performedByName: profile?.full_name ?? '',
        });
      } else {
        const { data, error } = await supabase
          .from('pilgrims')
          .insert({
            ...cleanInput,
            created_by: profile?.id ?? null,
            updated_by: profile?.id ?? null,
          })
          .select('*')
          .maybeSingle();

        if (error) throw error;
        await logAudit({
          action: 'pilgrim_created',
          recordType: 'pilgrim',
          recordId: (data as { id: string } | null)?.id ?? null,
          recordLabel: cleanInput.full_name,
          newValue: data as Record<string, unknown> | null,
          performedBy: profile?.id ?? null,
          performedByName: profile?.full_name ?? '',
        });
      }
      navigate('/app/pilgrims');
    } catch (err) {
      setDbError(friendlyError(err));
      window.scrollTo({ top: 0, behavior: 'smooth' });
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
      <Link to={isEdit ? `/app/pilgrims/${id}` : '/app/pilgrims'} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      <PageHeader
        title={isEdit ? 'Edit Pilgrim' : 'Add Pilgrim'}
        subtitle={isEdit ? 'Update pilgrim record details' : 'Register a new pilgrim'}
        icon={isEdit ? <UserCog className="h-6 w-6" /> : <UserPlus className="h-6 w-6" />}
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
          <h3 className="font-display font-bold text-base text-slate-900 mb-4">Personal Information</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Full Name <span className="text-red-500">*</span></label>
              <input className={inputCls} value={form.full_name} onChange={(e) => update('full_name', e.target.value)} placeholder="e.g. Ahmed Ibrahim" />
            </div>
            <div>
              <label className={labelCls}>Passport Number <span className="text-red-500">*</span></label>
              <input className={inputCls} value={form.passport_number} onChange={(e) => update('passport_number', e.target.value)} placeholder="Unique passport number" />
            </div>
            <div>
              <label className={labelCls}>Nationality <span className="text-red-500">*</span></label>
              <input className={inputCls} value={form.nationality} onChange={(e) => update('nationality', e.target.value)} placeholder="e.g. Nigeria" />
            </div>
            <div>
              <label className={labelCls}>Phone Number</label>
              <input className={inputCls} value={form.phone_number || ''} onChange={(e) => update('phone_number', e.target.value)} placeholder="e.g. +234 800 000 0000" />
            </div>
            <div>
              <label className={labelCls}>Gender</label>
              <select className={inputCls} value={form.gender || ''} onChange={(e) => update('gender', (e.target.value || null) as 'male' | 'female' | null)}>
                <option value="">Not specified</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Date of Birth</label>
              <input type="date" className={inputCls} value={form.date_of_birth || ''} onChange={(e) => update('date_of_birth', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <h3 className="font-display font-bold text-base text-slate-900 mb-4">Sub-Agent Assignment</h3>
          <div>
            <label className={labelCls}>Assigned Sub-Agent</label>
            <select className={inputCls} value={form.sub_agent_id || ''} onChange={(e) => update('sub_agent_id', e.target.value || null)}>
              <option value="">Unassigned</option>
              {subAgents.map((sa) => (
                <option key={sa.id} value={sa.id}>{sa.organisation_name} — {sa.country}</option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-slate-400">A pilgrim may temporarily have no assigned sub-agent.</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <h3 className="font-display font-bold text-base text-slate-900 mb-4">Planned Travel Dates</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Scheduled Outbound Date <span className="text-red-500">*</span></label>
              <input type="date" className={inputCls} value={form.expected_departure_date} onChange={(e) => update('expected_departure_date', e.target.value)} />
              <p className="mt-1.5 text-xs text-slate-400">Planned departure from home country.</p>
            </div>
            <div>
              <label className={labelCls}>Expected Return Date</label>
              <input type="date" className={inputCls} value={form.expected_return_date || ''} onChange={(e) => update('expected_return_date', e.target.value)} />
              <p className="mt-1.5 text-xs text-slate-400">Planned return date. Not an actual departure confirmation.</p>
            </div>
          </div>
          <div className="mt-4 rounded-lg bg-blue-50 border border-blue-100 px-4 py-3">
            <p className="text-xs text-blue-700">
              Actual arrival and departure are confirmed separately by authorized staff from the pilgrim detail page. These dates are plans only.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <h3 className="font-display font-bold text-base text-slate-900 mb-4">Operational Notes</h3>
          <textarea
            className={`${inputCls} min-h-[100px] resize-y`}
            value={form.operational_notes || ''}
            onChange={(e) => update('operational_notes', e.target.value)}
            placeholder="Any operational notes about this pilgrim..."
          />
        </div>

        <div className="flex items-center justify-end gap-3">
          <Link to={isEdit ? `/app/pilgrims/${id}` : '/app/pilgrims'} className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-900/20 hover:bg-brand-600 transition-all active:scale-95 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isEdit ? 'Save Changes' : 'Create Pilgrim'}
          </button>
        </div>
      </form>
    </div>
  );
}
