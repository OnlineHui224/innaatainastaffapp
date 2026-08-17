import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { AlertCircle, Building2, Calendar, CheckCircle2, Hotel, Loader2, Plus, User } from 'lucide-react';
import { SearchableCombobox } from './SearchableCombobox';
import { TransportPackageField } from './TransportPackageField';
import { useHotelSearch } from '@/hooks/useHotelSearch';
import { cn } from '@/lib/utils';
import type {
  TransportPackage,
  VisaCaseDetails, NewAgentEntry, CustomHotelEntry,
} from '@/types/visa';
import { normalizeAgentName } from '@/types/visa';
import type { ComboboxOption } from './SearchableCombobox';
import type { SubAgent } from '@/types';

interface CaseDetailsCardProps {
  details: VisaCaseDetails;
  onChange: (updates: Partial<VisaCaseDetails>) => void;
  agentOptions: ComboboxOption[];
  staffOptions: ComboboxOption[];
  errors: Record<string, string>;
  disabled: boolean;
  isAdmin: boolean;
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-sm font-medium text-slate-700 mb-1.5">
      {children}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}

const inputClass = 'w-full min-h-[44px] rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-500 focus:border-brand-600 transition-colors disabled:bg-slate-50 disabled:opacity-50 sm:min-h-0';

export function CaseDetailsCard({
  details,
  onChange,
  agentOptions,
  staffOptions,
  errors,
  disabled,
  isAdmin,
}: CaseDetailsCardProps) {
  const makkahSearch = useHotelSearch('Makkah');
  const madinahSearch = useHotelSearch('Madinah');

  const [showNewAgent, setShowNewAgent] = useState(false);
  const [agentDuplicates, setAgentDuplicates] = useState<SubAgent[]>([]);
  const [agentChecking, setAgentChecking] = useState(false);
  const [showCustomMakkah, setShowCustomMakkah] = useState(false);
  const [showCustomMadinah, setShowCustomMadinah] = useState(false);

  // ── Hotel options ──
  const makkahHotelOptions: ComboboxOption[] = makkahSearch.results.map((h) => ({
    value: h.id,
    label: h.name_en,
    secondary: h.name_ar || '',
    tertiary: `${h.classification || ''} ${h.licence_number ? `Lic: ${h.licence_number}` : ''}`.trim(),
  }));

  const madinahHotelOptions: ComboboxOption[] = madinahSearch.results.map((h) => ({
    value: h.id,
    label: h.name_en,
    secondary: h.name_ar || '',
    tertiary: `${h.classification || ''} ${h.licence_number ? `Lic: ${h.licence_number}` : ''}`.trim(),
  }));



  // ── Handlers ──

  // Agent selection
  const handleAgentSelect = useCallback(
    (value: string | null) => {
      const selected = agentOptions.find((o) => o.value === value);
      onChange({
        agentId: value,
        agentName: selected?.label || '',
        agentIsProposed: false,
        newAgent: null,
      });
      setShowNewAgent(false);
      setAgentDuplicates([]);
    },
    [agentOptions, onChange],
  );

  // New agent — check for duplicates
  const checkAgentDuplicates = useCallback(
    async (name: string) => {
      const normalized = normalizeAgentName(name);
      if (!normalized) {
        setAgentDuplicates([]);
        return;
      }
      setAgentChecking(true);
      try {
        const { data } = await supabase
          .from('sub_agents')
          .select('id, organisation_name, country, active_status')
          .ilike('organisation_name', `%${name.trim()}%`)
          .limit(5);
        const matches = (data || []).filter((a: Record<string, unknown>) =>
          normalizeAgentName(a.organisation_name as string) === normalized,
        );
        setAgentDuplicates(matches as unknown as SubAgent[]);
      } catch {
        setAgentDuplicates([]);
      } finally {
        setAgentChecking(false);
      }
    },
    [],
  );

  const handleNewAgentNameChange = useCallback(
    (name: string) => {
      const updated: NewAgentEntry = { ...(details.newAgent || { organisationName: '', contactPerson: '', phoneNumber: '', email: '', internalNote: '' }), organisationName: name };
      onChange({ newAgent: updated, agentName: name, agentIsProposed: true, agentId: null });
      checkAgentDuplicates(name);
    },
    [details.newAgent, onChange, checkAgentDuplicates],
  );

  const handleNewAgentFieldChange = useCallback(
    (field: keyof NewAgentEntry, value: string) => {
      const current = details.newAgent || { organisationName: '', contactPerson: '', phoneNumber: '', email: '', internalNote: '' };
      onChange({ newAgent: { ...current, [field]: value } });
    },
    [details.newAgent, onChange],
  );

  // Hotel handlers
  const handleMakkahHotelSelect = useCallback(
    (value: string | null) => {
      const selected = makkahHotelOptions.find((o) => o.value === value);
      onChange({
        makkahHotelId: value,
        makkahHotelName: selected?.label || '',
        makkahHotelIsCustom: false,
        makkahCustomHotel: null,
      });
      setShowCustomMakkah(false);
    },
    [makkahHotelOptions, onChange],
  );

  const handleMadinahHotelSelect = useCallback(
    (value: string | null) => {
      const selected = madinahHotelOptions.find((o) => o.value === value);
      onChange({
        madinahHotelId: value,
        madinahHotelName: selected?.label || '',
        madinahHotelIsCustom: false,
        madinahCustomHotel: null,
      });
      setShowCustomMadinah(false);
    },
    [madinahHotelOptions, onChange],
  );

  const handleCustomMakkahChange = useCallback(
    (field: keyof CustomHotelEntry, value: string) => {
      const current = details.makkahCustomHotel || { name: '', city: 'Makkah' as const, nameAr: '', licenceNumber: '', internalNote: '' };
      const updated = { ...current, [field]: value };
      onChange({
        makkahCustomHotel: updated,
        makkahHotelName: updated.name,
        makkahHotelIsCustom: true,
        makkahHotelId: null,
      });
    },
    [details.makkahCustomHotel, onChange],
  );

  const handleCustomMadinahChange = useCallback(
    (field: keyof CustomHotelEntry, value: string) => {
      const current = details.madinahCustomHotel || { name: '', city: 'Madinah' as const, nameAr: '', licenceNumber: '', internalNote: '' };
      const updated = { ...current, [field]: value };
      onChange({
        madinahCustomHotel: updated,
        madinahHotelName: updated.name,
        madinahHotelIsCustom: true,
        madinahHotelId: null,
      });
    },
    [details.madinahCustomHotel, onChange],
  );

  // Transport handlers




  const handleDateChange = useCallback(
    (field: 'plannedOutboundDate' | 'expectedReturnDate') => (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange({ [field]: e.target.value });
    },
    [onChange],
  );

  const dateError = details.plannedOutboundDate && details.expectedReturnDate &&
    details.expectedReturnDate < details.plannedOutboundDate
    ? 'Expected return date must be on or after the planned outbound date'
    : null;


  return (
    <div className="rounded-lg border border-slate-300 bg-white">
      <div className="px-6 py-5 border-b border-slate-200">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display text-lg font-bold text-navy-900">A · Operational details</h2>
          <span className="text-xs text-slate-500">Entered by staff — not AI</span>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Select the operational information connected to this visa document.
        </p>
      </div>

      <div className="px-6 py-5 space-y-8">
        {/* ── Section A — Responsibility ── */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-50 text-brand-700">
              <span className="text-xs font-bold">A</span>
            </div>
            <h3 className="text-sm font-semibold text-navy-900 uppercase tracking-wide">Responsibility</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* An Existing Pilgrim is deliberately NOT selected here.
                The visa identity is extracted or entered first, reviewed, and
                only then matched to a HajjERP pilgrim by passport number. */}

            {/* Client source.
                Inna Ataina carries the exposure either way — it issued the visa
                — but direct clients and Sub-Agent clients aggregate differently
                for accountability, so the record states which it is. A direct
                client carries no Sub-Agent; no placeholder agent is invented to
                stand in for the company. */}
            <div className="md:col-span-2">
              <FieldLabel>Client Source</FieldLabel>
              <div role="radiogroup" aria-label="Client source" className="flex flex-wrap gap-2">
                {(
                  [
                    ['sub_agent', 'Sub-Agent client', 'Introduced by a Sub-Agent.'],
                    ['direct', 'Inna Ataina direct client', 'No Sub-Agent involved.'],
                  ] as const
                ).map(([value, label, help]) => {
                  const active = details.clientSource === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      disabled={disabled}
                      onClick={() =>
                        onChange(
                          value === 'direct'
                            ? /* A direct client must not also carry an agent —
                                 the database refuses that combination. */
                              {
                                clientSource: 'direct',
                                agentId: null,
                                agentName: '',
                                agentIsProposed: false,
                                newAgent: null,
                              }
                            : { clientSource: 'sub_agent' },
                        )
                      }
                      className={cn(
                        'min-h-[44px] flex-1 rounded-md border px-3.5 py-2.5 text-left transition-colors sm:min-h-0 sm:flex-none',
                        active
                          ? 'border-brand-600 bg-brand-50'
                          : 'border-slate-300 bg-white hover:bg-slate-50',
                        disabled && 'opacity-50',
                      )}
                    >
                      <span
                        className={cn(
                          'block text-sm font-semibold',
                          active ? 'text-brand-800' : 'text-slate-700',
                        )}
                      >
                        {label}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500">{help}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Responsible Agent — with manual entry.
                Hidden for a direct client, because there is no agent to name. */}
            <div className={cn('md:col-span-2', details.clientSource === 'direct' && 'hidden')}>
              <FieldLabel>Responsible Agent</FieldLabel>
              {!showNewAgent ? (
                <>
                  <SearchableCombobox
                    options={agentOptions}
                    value={details.agentId}
                    onChange={handleAgentSelect}
                    placeholder="Search existing agents..."
                    emptyMessage="No agents found"
                    icon={Building2}
                    disabled={disabled}
                    error={!!errors.agentId}
                  />
                  {errors.agentId && <p className="mt-1 text-xs text-red-600">{errors.agentId}</p>}
                  <button
                    type="button"
                    onClick={() => { setShowNewAgent(true); onChange({ agentId: null, agentIsProposed: true, newAgent: { organisationName: '', contactPerson: '', phoneNumber: '', email: '', internalNote: '' } }); }}
                    disabled={disabled}
                    className="mt-1.5 inline-flex min-h-[44px] items-center gap-1 rounded text-xs font-medium text-brand-600 transition-colors hover:text-brand-700 sm:min-h-0"
                  >
                    <Plus className="h-3 w-3" /> Agent not found? Enter a new agent
                  </button>
                </>
              ) : (
                <div className="space-y-3 rounded-md border border-brand-200 bg-brand-50/40 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-brand-700">New Agent Entry</span>
                    <button
                      type="button"
                      onClick={() => { setShowNewAgent(false); onChange({ agentIsProposed: false, newAgent: null, agentName: '' }); setAgentDuplicates([]); }}
                      className="text-xs text-slate-500 hover:text-slate-700"
                    >
                      Cancel
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <FieldLabel required>Agent Name</FieldLabel>
                      <input
                        type="text"
                        value={details.newAgent?.organisationName || ''}
                        onChange={(e) => handleNewAgentNameChange(e.target.value)}
                        placeholder="Enter agent organisation name"
                        disabled={disabled}
                        className={inputClass}
                        autoFocus
                      />
                    </div>
                    <div>
                      <FieldLabel>Phone Number</FieldLabel>
                      <input type="text" value={details.newAgent?.phoneNumber || ''} onChange={(e) => handleNewAgentFieldChange('phoneNumber', e.target.value)} placeholder="Optional" disabled={disabled} className={inputClass} />
                    </div>
                    <div>
                      <FieldLabel>Email</FieldLabel>
                      <input type="email" value={details.newAgent?.email || ''} onChange={(e) => handleNewAgentFieldChange('email', e.target.value)} placeholder="Optional" disabled={disabled} className={inputClass} />
                    </div>
                    <div className="sm:col-span-2">
                      <FieldLabel>Internal Note</FieldLabel>
                      <input type="text" value={details.newAgent?.internalNote || ''} onChange={(e) => handleNewAgentFieldChange('internalNote', e.target.value)} placeholder="Optional" disabled={disabled} className={inputClass} />
                    </div>
                  </div>

                  {/* Duplicate check */}
                  {agentChecking && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Loader2 className="h-3 w-3 animate-spin" /> Checking for duplicate agents...
                    </div>
                  )}
                  {!agentChecking && agentDuplicates.length > 0 && (
                    <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 mb-1">
                        <AlertCircle className="h-3.5 w-3.5" /> Possible duplicates found:
                      </div>
                      <ul className="space-y-1">
                        {agentDuplicates.map((dup) => (
                          <li key={dup.id} className="flex items-center justify-between text-xs text-amber-800">
                            <span>{dup.organisation_name} ({dup.country})</span>
                            <button type="button" onClick={() => handleAgentSelect(dup.id)} className="font-medium text-brand-600 hover:underline">Select this agent</button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {!agentChecking && details.newAgent?.organisationName && agentDuplicates.length === 0 && (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" /> No duplicates found — safe to proceed.
                    </div>
                  )}

                  <div className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
                    {isAdmin
                      ? 'As an administrator, you can create this as a permanent agent immediately.'
                      : 'As operational staff, this agent will be saved as a proposed agent pending administrator approval. The current workflow can continue.'}
                  </div>
                </div>
              )}
            </div>

            <div>
              <FieldLabel>Assigned Staff Member</FieldLabel>
              <SearchableCombobox
                options={staffOptions}
                value={details.assignedStaffId}
                onChange={(v) => onChange({ assignedStaffId: v })}
                placeholder="Select staff member (optional)"
                emptyMessage="No staff found"
                icon={User}
                disabled={disabled}
              />
              <p className="mt-1 text-xs text-slate-500">When applicable</p>
            </div>

            <div>
              <FieldLabel>Visa Company</FieldLabel>
              <input type="text" value={details.visaCompany} onChange={(e) => onChange({ visaCompany: e.target.value })} aria-label="Visa company name" placeholder="Enter visa company name" disabled={disabled} className={inputClass} />
            </div>
          </div>
        </section>

        {/* ── Section B — Transportation ──
            Business-level entitlement only. Route, vehicle, pricing, provider,
            pickup and approval are transport CONTRACT concerns and belong to the
            future Ground Transport Contracts module; the richer
            `TransportSelection` model and its reference tables are untouched. */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-50 text-brand-700">
              <span className="text-xs font-bold">B</span>
            </div>
            <h3 className="text-sm font-semibold text-navy-900 uppercase tracking-wide">Transportation</h3>
            <span className="text-xs text-slate-500">What the traveller is entitled to</span>
          </div>
          <TransportPackageField
            value={details.transportPackage}
            onChange={(transportPackage: TransportPackage) => onChange({ transportPackage })}
            error={errors.transportPackage}
            disabled={disabled}
          />
        </section>

        {/* ── Section C — Hotels ── */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-50 text-brand-700">
              <span className="text-xs font-bold">C</span>
            </div>
            <h3 className="text-sm font-semibold text-navy-900 uppercase tracking-wide">Hotels</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Makkah Hotel */}
            <div>
              <FieldLabel>Makkah Hotel</FieldLabel>
              {!showCustomMakkah ? (
                <>
                  <SearchableCombobox
                    options={makkahHotelOptions}
                    value={details.makkahHotelId}
                    onChange={handleMakkahHotelSelect}
                    onSearchChange={makkahSearch.search}
                    loading={makkahSearch.loading}
                    placeholder="Search Makkah hotels..."
                    emptyMessage="No Makkah hotels found"
                    icon={Hotel}
                    disabled={disabled}
                    error={!!errors.makkahHotelId}
                  />
                  {errors.makkahHotelId && <p className="mt-1 text-xs text-red-600">{errors.makkahHotelId}</p>}
                  <button type="button" onClick={() => setShowCustomMakkah(true)} disabled={disabled} className="mt-1.5 inline-flex min-h-[44px] items-center gap-1 rounded text-xs font-medium text-brand-600 transition-colors hover:text-brand-700 sm:min-h-0">
                    <Plus className="h-3 w-3" /> Hotel not found? Enter hotel manually
                  </button>
                </>
              ) : (
                <div className="space-y-2 rounded-md border border-brand-200 bg-brand-50/40 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-brand-700">Manual Hotel (CUSTOM_ITINERARY_HOTEL)</span>
                    <button type="button" onClick={() => { setShowCustomMakkah(false); onChange({ makkahHotelIsCustom: false, makkahCustomHotel: null, makkahHotelName: '' }); }} className="text-xs text-slate-500 hover:text-slate-700">Cancel</button>
                  </div>
                  <div>
                    <FieldLabel required>Hotel Name</FieldLabel>
                    <input type="text" value={details.makkahCustomHotel?.name || ''} onChange={(e) => handleCustomMakkahChange('name', e.target.value)} placeholder="Enter hotel name" disabled={disabled} className={inputClass} autoFocus />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <FieldLabel>Arabic Name</FieldLabel>
                      <input type="text" value={details.makkahCustomHotel?.nameAr || ''} onChange={(e) => handleCustomMakkahChange('nameAr', e.target.value)} placeholder="Optional" disabled={disabled} className={inputClass} dir="rtl" />
                    </div>
                    <div>
                      <FieldLabel>Licence Number</FieldLabel>
                      <input type="text" value={details.makkahCustomHotel?.licenceNumber || ''} onChange={(e) => handleCustomMakkahChange('licenceNumber', e.target.value)} placeholder="Optional" disabled={disabled} className={inputClass} />
                    </div>
                  </div>
                  <div>
                    <FieldLabel>Internal Note</FieldLabel>
                    <input type="text" value={details.makkahCustomHotel?.internalNote || ''} onChange={(e) => handleCustomMakkahChange('internalNote', e.target.value)} placeholder="Optional" disabled={disabled} className={inputClass} />
                  </div>
                  <p className="text-xs text-slate-500">City: Makkah (fixed)</p>
                </div>
              )}
            </div>

            {/* Madinah Hotel */}
            <div>
              <FieldLabel>Madinah Hotel</FieldLabel>
              {!showCustomMadinah ? (
                <>
                  <SearchableCombobox
                    options={madinahHotelOptions}
                    value={details.madinahHotelId}
                    onChange={handleMadinahHotelSelect}
                    onSearchChange={madinahSearch.search}
                    loading={madinahSearch.loading}
                    placeholder="Search Madinah hotels..."
                    emptyMessage="No Madinah hotels found"
                    icon={Hotel}
                    disabled={disabled}
                    error={!!errors.madinahHotelId}
                  />
                  {errors.madinahHotelId && <p className="mt-1 text-xs text-red-600">{errors.madinahHotelId}</p>}
                  <button type="button" onClick={() => setShowCustomMadinah(true)} disabled={disabled} className="mt-1.5 inline-flex min-h-[44px] items-center gap-1 rounded text-xs font-medium text-brand-600 transition-colors hover:text-brand-700 sm:min-h-0">
                    <Plus className="h-3 w-3" /> Hotel not found? Enter hotel manually
                  </button>
                </>
              ) : (
                <div className="space-y-2 rounded-md border border-brand-200 bg-brand-50/40 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-brand-700">Manual Hotel (CUSTOM_ITINERARY_HOTEL)</span>
                    <button type="button" onClick={() => { setShowCustomMadinah(false); onChange({ madinahHotelIsCustom: false, madinahCustomHotel: null, madinahHotelName: '' }); }} className="text-xs text-slate-500 hover:text-slate-700">Cancel</button>
                  </div>
                  <div>
                    <FieldLabel required>Hotel Name</FieldLabel>
                    <input type="text" value={details.madinahCustomHotel?.name || ''} onChange={(e) => handleCustomMadinahChange('name', e.target.value)} placeholder="Enter hotel name" disabled={disabled} className={inputClass} autoFocus />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <FieldLabel>Arabic Name</FieldLabel>
                      <input type="text" value={details.madinahCustomHotel?.nameAr || ''} onChange={(e) => handleCustomMadinahChange('nameAr', e.target.value)} placeholder="Optional" disabled={disabled} className={inputClass} dir="rtl" />
                    </div>
                    <div>
                      <FieldLabel>Licence Number</FieldLabel>
                      <input type="text" value={details.madinahCustomHotel?.licenceNumber || ''} onChange={(e) => handleCustomMadinahChange('licenceNumber', e.target.value)} placeholder="Optional" disabled={disabled} className={inputClass} />
                    </div>
                  </div>
                  <div>
                    <FieldLabel>Internal Note</FieldLabel>
                    <input type="text" value={details.madinahCustomHotel?.internalNote || ''} onChange={(e) => handleCustomMadinahChange('internalNote', e.target.value)} placeholder="Optional" disabled={disabled} className={inputClass} />
                  </div>
                  <p className="text-xs text-slate-500">City: Madinah (fixed)</p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── Section D — Planned Dates ── */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-50 text-brand-700">
              <span className="text-xs font-bold">D</span>
            </div>
            <h3 className="text-sm font-semibold text-navy-900 uppercase tracking-wide">Planned Dates</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <FieldLabel>Planned Outbound Date</FieldLabel>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none z-10" />
                <input aria-label="Planned outbound date" type="date" value={details.plannedOutboundDate} onChange={handleDateChange('plannedOutboundDate')} disabled={disabled} className={cn(inputClass, 'pl-10')} />
              </div>
              <p className="mt-1 text-xs text-slate-500">Planned date only — does not confirm actual arrival</p>
            </div>
            <div>
              <FieldLabel>Expected Return Date</FieldLabel>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none z-10" />
                <input aria-label="Expected return date" type="date" value={details.expectedReturnDate} onChange={handleDateChange('expectedReturnDate')} disabled={disabled} className={cn(inputClass, 'pl-10')} />
              </div>
              <p className="mt-1 text-xs text-slate-500">Planned date only — does not confirm actual departure</p>
            </div>
            <div>
              <FieldLabel>Arrival Port</FieldLabel>
              <input
                type="text"
                value={details.arrivalPort}
                onChange={(e) => onChange({ arrivalPort: e.target.value })}
                aria-label="Planned arrival port"
                placeholder="e.g. Jeddah"
                disabled={disabled}
                className={inputClass}
              />
              <p className="mt-1 text-xs text-slate-500">
                Planned port of entry — the actual arrival is confirmed separately
              </p>
            </div>
          </div>
          {(dateError || errors.dateError) && (
            <div className="mt-3 flex items-center gap-2 text-xs text-red-600">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {dateError || errors.dateError}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
