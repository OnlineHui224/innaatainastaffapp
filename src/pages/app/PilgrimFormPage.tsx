import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Save } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { friendlyError, validatePilgrim } from '@/lib/validation';
import { logAudit } from '@/lib/audit';
import type { Pilgrim, PilgrimInput, SubAgent } from '@/types';
import { PageHeader } from '@/components/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { LoadingBlock } from '@/components/ui/Feedback';
import { Panel } from '@/components/ui/Panel';

/**
 * The general Add/Edit form manages identity, responsibility, planned travel and
 * notes only.
 *
 * Actual arrival and actual departure are deliberately absent: they are recorded
 * exclusively through the confirmation and correction workflows on the pilgrim
 * record, so they can never be set without a named officer and a timestamp. The
 * underlying columns are untouched by this form — it simply never writes them.
 */

type FormState = Omit<PilgrimInput, 'arrival_date' | 'actual_departure_date'>;

const EMPTY_FORM: FormState = {
  full_name: '',
  passport_number: '',
  nationality: '',
  phone_number: '',
  gender: null,
  date_of_birth: '',
  sub_agent_id: null,
  expected_departure_date: '',
  expected_return_date: '',
  operational_notes: '',
};

export default function PilgrimFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [subAgents, setSubAgents] = useState<SubAgent[]>([]);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(isEdit);
  const [errors, setErrors] = useState<string[]>([]);
  const [dbError, setDbError] = useState<string | null>(null);
  const [existing, setExisting] = useState<Pilgrim | null>(null);

  useEffect(() => {
    supabase
      .from('sub_agents')
      .select('*')
      .eq('active_status', true)
      .order('organisation_name')
      .then(({ data }) => {
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
          setDbError('This pilgrim record could not be found.');
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
            expected_departure_date: p.expected_departure_date,
            expected_return_date: p.expected_return_date || '',
            operational_notes: p.operational_notes || '',
          });
        }
        setPageLoading(false);
      });
  }, [id]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrors([]);
    setDbError(null);

    const cleanInput: FormState = {
      ...form,
      full_name: form.full_name.trim(),
      passport_number: form.passport_number.trim(),
      nationality: form.nationality.trim(),
      phone_number: form.phone_number?.trim() || null,
      date_of_birth: form.date_of_birth || null,
      expected_return_date: form.expected_return_date || null,
      operational_notes: form.operational_notes?.trim() || null,
      sub_agent_id: form.sub_agent_id || null,
      gender: form.gender || null,
      is_sample_data: false,
    };

    const validation = validatePilgrim(cleanInput as PilgrimInput);
    if (!validation.valid) {
      setErrors(validation.errors);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setLoading(true);
    try {
      if (isEdit && id) {
        /* Only the fields this form owns are written. Actual-movement columns
           are never part of the payload, so an edit cannot overwrite a
           confirmation. */
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
        navigate(`/app/pilgrims/${id}`);
        return;
      }

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
      navigate('/app/pilgrims');
    } catch (err) {
      setDbError(friendlyError(err));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setLoading(false);
    }
  }

  if (pageLoading) return <LoadingBlock label="Loading pilgrim record…" />;

  const cancelTo = isEdit ? `/app/pilgrims/${id}` : '/app/pilgrims';

  return (
    <div>
      <PageHeader
        eyebrow={isEdit ? 'Pilgrim record' : 'Operations'}
        title={isEdit ? 'Edit pilgrim' : 'Add pilgrim'}
        subtitle={
          isEdit
            ? 'Update identity, responsibility, planned travel and notes. Actual movement is recorded separately through the confirmation workflows.'
            : 'Register a new pilgrim record. The pilgrim starts with planned travel only — no movement is confirmed.'
        }
      />

      {(errors.length > 0 || dbError) && (
        <Alert tone="critical" title="This record could not be saved" className="mb-6">
          {dbError && <p className="font-medium">{dbError}</p>}
          {errors.length > 0 && (
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {errors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="max-w-4xl space-y-6" noValidate>
        <Panel title="Identity">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Full name" htmlFor="full-name" required>
              <Input
                id="full-name"
                value={form.full_name}
                onChange={(e) => update('full_name', e.target.value)}
                placeholder="e.g. Ahmed Ibrahim"
                autoComplete="off"
              />
            </Field>
            <Field
              label="Passport number"
              htmlFor="passport-number"
              required
              hint="Must be unique across the platform."
            >
              {/* Genuine operational identifier */}
              <Input
                id="passport-number"
                identifier
                value={form.passport_number}
                onChange={(e) => update('passport_number', e.target.value.toUpperCase())}
                placeholder="e.g. B12345678"
                autoComplete="off"
              />
            </Field>
            <Field label="Nationality" htmlFor="nationality" required>
              <Input
                id="nationality"
                value={form.nationality}
                onChange={(e) => update('nationality', e.target.value)}
                placeholder="e.g. Nigeria"
                autoComplete="off"
              />
            </Field>
            <Field label="Phone number" htmlFor="phone-number">
              <Input
                id="phone-number"
                type="tel"
                value={form.phone_number || ''}
                onChange={(e) => update('phone_number', e.target.value)}
                placeholder="e.g. +234 800 000 0000"
              />
            </Field>
            <Field label="Gender" htmlFor="gender">
              <Select
                id="gender"
                value={form.gender || ''}
                onChange={(e) => update('gender', (e.target.value || null) as 'male' | 'female' | null)}
              >
                <option value="">Not specified</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </Select>
            </Field>
            <Field label="Date of birth" htmlFor="date-of-birth">
              <Input
                id="date-of-birth"
                type="date"
                value={form.date_of_birth || ''}
                onChange={(e) => update('date_of_birth', e.target.value)}
              />
            </Field>
          </div>
        </Panel>

        <Panel title="Responsibility">
          <Field
            label="Assigned sub-agent"
            htmlFor="sub-agent"
            hint="A pilgrim may temporarily have no assigned sub-agent. Only active sub-agents are listed."
          >
            <Select
              id="sub-agent"
              value={form.sub_agent_id || ''}
              onChange={(e) => update('sub_agent_id', e.target.value || null)}
            >
              <option value="">Unassigned</option>
              {subAgents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.organisation_name} — {agent.country}
                </option>
              ))}
            </Select>
          </Field>
        </Panel>

        <Panel
          edge="derived"
          title="Planned travel"
          description="Plans only — scheduled dates do not confirm movement."
        >
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field
              label="Scheduled outbound date"
              htmlFor="expected-departure"
              required
              hint="Planned departure from the home country."
            >
              <Input
                id="expected-departure"
                type="date"
                value={form.expected_departure_date}
                onChange={(e) => update('expected_departure_date', e.target.value)}
              />
            </Field>
            <Field
              label="Expected return date"
              htmlFor="expected-return"
              hint="Planned return. This is not a departure confirmation."
            >
              <Input
                id="expected-return"
                type="date"
                value={form.expected_return_date || ''}
                onChange={(e) => update('expected_return_date', e.target.value)}
              />
            </Field>
          </div>

          <Alert tone="info" className="mt-5">
            Actual arrival and actual departure are not editable here. They are recorded by an authorised staff
            member from the pilgrim record, where the confirming officer and timestamp are captured.
          </Alert>
        </Panel>

        <Panel title="Operational notes">
          <Field label="Notes" htmlFor="operational-notes">
            <Textarea
              id="operational-notes"
              rows={4}
              value={form.operational_notes || ''}
              onChange={(e) => update('operational_notes', e.target.value)}
              placeholder="Any operational context for this pilgrim…"
            />
          </Field>
        </Panel>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Link
            to={cancelTo}
            className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            Cancel
          </Link>
          <Button type="submit" loading={loading} icon={<Save className="h-4 w-4" aria-hidden="true" />}>
            {isEdit ? 'Save changes' : 'Create pilgrim'}
          </Button>
        </div>
      </form>
    </div>
  );
}
