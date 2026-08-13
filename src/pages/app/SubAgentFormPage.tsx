import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Save } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { friendlyError, validateEmail, validatePhone } from '@/lib/validation';
import { logAudit } from '@/lib/audit';
import { normalizeAgentName } from '@/types/visa';
import type { SubAgent, SubAgentInput } from '@/types';
import { PageHeader } from '@/components/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { LoadingBlock } from '@/components/ui/Feedback';
import { Panel } from '@/components/ui/Panel';

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
  const [duplicates, setDuplicates] = useState<SubAgent[]>([]);

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
          setDbError('This sub-agent could not be found.');
        } else {
          const agent = data as SubAgent;
          setExisting(agent);
          setForm({
            organisation_name: agent.organisation_name,
            contact_person: agent.contact_person,
            country: agent.country,
            email: agent.email || '',
            phone_number: agent.phone_number || '',
            active_status: agent.active_status,
            notes: agent.notes || '',
          });
        }
        setPageLoading(false);
      });
  }, [id]);

  /**
   * Duplicate-name warning.
   * Warns, never blocks: two organisations can legitimately share a similar name,
   * so the decision stays with the operator.
   */
  const checkDuplicates = useCallback(
    async (name: string) => {
      const normalized = normalizeAgentName(name);
      if (normalized.length < 3) {
        setDuplicates([]);
        return;
      }
      const { data } = await supabase
        .from('sub_agents')
        .select('*')
        .ilike('organisation_name', `%${name.trim()}%`)
        .limit(6);
      const matches = ((data || []) as SubAgent[]).filter(
        (agent) => agent.id !== id && normalizeAgentName(agent.organisation_name) === normalized,
      );
      setDuplicates(matches);
    },
    [id],
  );

  useEffect(() => {
    const timer = setTimeout(() => checkDuplicates(form.organisation_name), 400);
    return () => clearTimeout(timer);
  }, [form.organisation_name, checkDuplicates]);

  function update<K extends keyof SubAgentInput>(key: K, value: SubAgentInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrors([]);
    setDbError(null);

    const validationErrors: string[] = [];
    if (!form.organisation_name?.trim()) validationErrors.push('Organisation name is required.');
    if (!form.contact_person?.trim()) validationErrors.push('Contact person is required.');
    if (!form.country?.trim()) validationErrors.push('Country is required.');
    if (form.email && !validateEmail(form.email)) validationErrors.push('Email address is not valid.');
    if (form.phone_number && !validatePhone(form.phone_number))
      validationErrors.push('Phone number format is not valid.');

    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const clean: SubAgentInput = {
      ...form,
      organisation_name: form.organisation_name.trim(),
      contact_person: form.contact_person.trim(),
      country: form.country.trim(),
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
        navigate(`/app/sub-agents/${id}`);
        return;
      }

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
      navigate('/app/sub-agents');
    } catch (err) {
      setDbError(friendlyError(err));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setLoading(false);
    }
  }

  if (pageLoading) return <LoadingBlock label="Loading sub-agent record…" />;

  const cancelTo = isEdit ? `/app/sub-agents/${id}` : '/app/sub-agents';

  return (
    <div>
      <PageHeader
        eyebrow={isEdit ? 'Sub-agent record' : 'Operations'}
        title={isEdit ? 'Edit sub-agent' : 'Add sub-agent'}
        subtitle={
          isEdit
            ? 'Update the organisation, its contact details and its operational status.'
            : 'Register an organisation that introduces pilgrims, so responsibility can be traced to it.'
        }
      />

      {(errors.length > 0 || dbError) && (
        <Alert tone="critical" title="This sub-agent could not be saved" className="mb-6">
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

      <form onSubmit={handleSubmit} className="max-w-3xl space-y-6" noValidate>
        <Panel title="Organisation">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field
              label="Organisation name"
              htmlFor="organisation-name"
              required
              className="sm:col-span-2"
              hint="The name used on contracts and CSV imports."
            >
              <Input
                id="organisation-name"
                value={form.organisation_name}
                onChange={(e) => update('organisation_name', e.target.value)}
                placeholder="e.g. Al-Noor Pilgrim Services"
                autoComplete="off"
              />
            </Field>

            {duplicates.length > 0 && (
              <div className="sm:col-span-2">
                <Alert
                  tone="warning"
                  title={`An organisation with this name already exists (${duplicates.length})`}
                >
                  Check whether this is the same organisation before creating a second record — duplicate
                  sub-agents split a single organisation&rsquo;s pilgrims across two rows.
                  <ul className="mt-2 space-y-1">
                    {duplicates.map((duplicate) => (
                      <li key={duplicate.id}>
                        <Link
                          to={`/app/sub-agents/${duplicate.id}`}
                          className="font-semibold underline"
                        >
                          {duplicate.organisation_name}
                        </Link>
                        <span className="text-amber-900/80">
                          {' '}
                          · {duplicate.country || 'no country recorded'} ·{' '}
                          {duplicate.active_status ? 'active' : 'inactive'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Alert>
              </div>
            )}

            <Field label="Contact person" htmlFor="contact-person" required>
              <Input
                id="contact-person"
                value={form.contact_person}
                onChange={(e) => update('contact_person', e.target.value)}
                placeholder="Full name"
                autoComplete="off"
              />
            </Field>
            <Field label="Country" htmlFor="country" required>
              <Input
                id="country"
                value={form.country}
                onChange={(e) => update('country', e.target.value)}
                placeholder="e.g. Nigeria"
                autoComplete="off"
              />
            </Field>
            <Field label="Email" htmlFor="agent-email">
              <Input
                id="agent-email"
                type="email"
                value={form.email || ''}
                onChange={(e) => update('email', e.target.value)}
                placeholder="contact@example.com"
              />
            </Field>
            <Field label="Phone number" htmlFor="agent-phone">
              <Input
                id="agent-phone"
                type="tel"
                value={form.phone_number || ''}
                onChange={(e) => update('phone_number', e.target.value)}
                placeholder="+234 800 000 0000"
              />
            </Field>
            <Field
              label="Operational status"
              htmlFor="active-status"
              hint="Inactive organisations stay on the platform but are not offered when assigning pilgrims."
              className="sm:col-span-2"
            >
              <Select
                id="active-status"
                value={form.active_status ? 'true' : 'false'}
                onChange={(e) => update('active_status', e.target.value === 'true')}
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </Select>
            </Field>
          </div>
        </Panel>

        <Panel title="Notes">
          <Field label="Internal notes" htmlFor="agent-notes">
            <Textarea
              id="agent-notes"
              rows={4}
              value={form.notes || ''}
              onChange={(e) => update('notes', e.target.value)}
              placeholder="Optional operational context about this organisation…"
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
            {isEdit ? 'Save changes' : 'Create sub-agent'}
          </Button>
        </div>
      </form>
    </div>
  );
}
