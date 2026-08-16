import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Search, MapPin, Calendar, Building2, User, Hotel,
  Package, Plus, AlertCircle, Loader2, Bus, Calculator,
  DollarSign, Clock, ShieldAlert,
} from 'lucide-react';
import { SearchableCombobox } from './SearchableCombobox';
import { useHotelSearch } from '@/hooks/useHotelSearch';
import { useTransportData } from '@/hooks/useTransportData';
import { cn } from '@/lib/utils';
import type {
  VisaCaseDetails, TransportSelection, NewAgentEntry, CustomHotelEntry,
} from '@/types/visa';
import { normalizeAgentName } from '@/types/visa';
import type { ComboboxOption } from './SearchableCombobox';
import type { SubAgent } from '@/types';

interface CaseDetailsCardProps {
  details: VisaCaseDetails;
  onChange: (updates: Partial<VisaCaseDetails>) => void;
  pilgrimOptions: ComboboxOption[];
  pilgrimLoading: boolean;
  onPilgrimSearch: (query: string) => void;
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

const inputClass = 'w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-600  transition-colors disabled:bg-slate-50 disabled:opacity-50';

export function CaseDetailsCard({
  details,
  onChange,
  pilgrimOptions,
  pilgrimLoading,
  onPilgrimSearch,
  agentOptions,
  staffOptions,
  errors,
  disabled,
  isAdmin,
}: CaseDetailsCardProps) {
  const makkahSearch = useHotelSearch('Makkah');
  const madinahSearch = useHotelSearch('Madinah');
  const { routes, vehicleTypes, loading: transportLoading, getRate } = useTransportData();

  const [showNewAgent, setShowNewAgent] = useState(false);
  const [agentDuplicates, setAgentDuplicates] = useState<SubAgent[]>([]);
  const [agentChecking, setAgentChecking] = useState(false);
  const [showCustomMakkah, setShowCustomMakkah] = useState(false);
  const [showCustomMadinah, setShowCustomMadinah] = useState(false);
  const [showCustomRoute, setShowCustomRoute] = useState(false);
  const [rateLoading, setRateLoading] = useState(false);

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

  const routeOptions: ComboboxOption[] = routes.map((r) => ({
    value: r.id,
    label: r.route_name,
    secondary: r.route_code,
  }));

  const vehicleOptions: ComboboxOption[] = vehicleTypes.map((v) => ({
    value: v.id,
    label: v.vehicle_name,
  }));

  // ── Handlers ──
  const handlePilgrimSelect = useCallback(
    (value: string | null) => {
      const selected = pilgrimOptions.find((o) => o.value === value);
      onChange({
        pilgrimId: value,
        pilgrimName: selected?.label || '',
        passportNumber: selected?.secondary || details.passportNumber,
      });
    },
    [pilgrimOptions, onChange, details.passportNumber],
  );

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
  const updateTransport = useCallback(
    (updates: Partial<TransportSelection>) => {
      const current = details.transport;
      const next = { ...current, ...updates };
      // Recalculate total
      const effectivePrice = next.hasPriceOverride && next.agreedPrice != null ? next.agreedPrice : next.referencePrice;
      next.calculatedTotal = effectivePrice != null ? effectivePrice * next.numberOfVehicles : null;
      onChange({ transport: next });
    },
    [details.transport, onChange],
  );

  const handleRouteSelect = useCallback(
    async (value: string | null) => {
      const selected = routeOptions.find((o) => o.value === value);
      updateTransport({ routeId: value, routeName: selected?.label || '', isCustomRoute: false });

      // If vehicle already selected, fetch rate
      if (value && details.transport.vehicleTypeId) {
        setRateLoading(true);
        const rate = await getRate(value, details.transport.vehicleTypeId);
        updateTransport({
          referencePrice: rate?.price ?? null,
          hasPriceOverride: false,
          agreedPrice: null,
        });
        setRateLoading(false);
      } else {
        updateTransport({ referencePrice: null });
      }
    },
    [routeOptions, details.transport.vehicleTypeId, getRate, updateTransport],
  );

  const handleVehicleSelect = useCallback(
    async (value: string | null) => {
      const selected = vehicleOptions.find((o) => o.value === value);
      updateTransport({ vehicleTypeId: value, vehicleTypeName: selected?.label || '' });

      if (value && details.transport.routeId && !details.transport.isCustomRoute) {
        setRateLoading(true);
        const rate = await getRate(details.transport.routeId, value);
        updateTransport({
          referencePrice: rate?.price ?? null,
          hasPriceOverride: false,
          agreedPrice: null,
        });
        setRateLoading(false);
      } else {
        updateTransport({ referencePrice: null });
      }
    },
    [vehicleOptions, details.transport.routeId, details.transport.isCustomRoute, getRate, updateTransport],
  );

  const handleNumVehiclesChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const n = Math.max(1, parseInt(e.target.value, 10) || 1);
      updateTransport({ numberOfVehicles: n });
    },
    [updateTransport],
  );

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

  const effectivePrice = details.transport.hasPriceOverride && details.transport.agreedPrice != null
    ? details.transport.agreedPrice
    : details.transport.referencePrice;

  return (
    <div className="rounded-lg border border-slate-300 bg-white">
      <div className="px-6 py-5 border-b border-slate-200">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="font-display text-lg font-bold text-navy-900">A · Operational details</h3>
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
            <h4 className="text-sm font-semibold text-navy-900 uppercase tracking-wide">Responsibility</h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <FieldLabel>Existing Pilgrim</FieldLabel>
              <SearchableCombobox
                options={pilgrimOptions}
                value={details.pilgrimId}
                onChange={handlePilgrimSelect}
                onSearchChange={onPilgrimSearch}
                loading={pilgrimLoading}
                placeholder="Search by passenger name, passport number, or agent"
                emptyMessage="No pilgrims found"
                icon={Search}
                disabled={disabled}
                error={!!errors.pilgrimId}
              />
              {errors.pilgrimId && <p className="mt-1 text-xs text-red-600">{errors.pilgrimId}</p>}
              <p className="mt-1 text-xs text-slate-400">Search by passenger name, passport number, or agent name</p>
            </div>

            {/* Responsible Agent — with manual entry */}
            <div className="md:col-span-2">
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
                    className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors"
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
                      <ShieldAlert className="h-3.5 w-3.5" /> No duplicates found — safe to proceed.
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
              <p className="mt-1 text-xs text-slate-400">When applicable</p>
            </div>

            <div>
              <FieldLabel>Visa Company</FieldLabel>
              <input type="text" value={details.visaCompany} onChange={(e) => onChange({ visaCompany: e.target.value })} placeholder="Enter visa company name" disabled={disabled} className={inputClass} />
            </div>
          </div>
        </section>

        {/* ── Section B — Ground Transportation ── */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-50 text-brand-700">
              <span className="text-xs font-bold">B</span>
            </div>
            <h4 className="text-sm font-semibold text-navy-900 uppercase tracking-wide">Ground Transportation</h4>
          </div>

          {transportLoading ? (
            <div className="flex items-center justify-center py-6 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading transport routes...
            </div>
          ) : !showCustomRoute ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <FieldLabel>Transport Route</FieldLabel>
                <SearchableCombobox
                  options={routeOptions}
                  value={details.transport.routeId}
                  onChange={handleRouteSelect}
                  placeholder="Select a route"
                  emptyMessage="No routes found"
                  icon={Bus}
                  disabled={disabled}
                />
              </div>

              <div>
                <FieldLabel>Vehicle Type</FieldLabel>
                <SearchableCombobox
                  options={vehicleOptions}
                  value={details.transport.vehicleTypeId}
                  onChange={handleVehicleSelect}
                  placeholder="Select vehicle type"
                  emptyMessage="No vehicles found"
                  icon={Package}
                  disabled={disabled}
                />
              </div>

              {/* Reference price + override */}
              <div className="md:col-span-2">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-md bg-slate-50 border border-slate-200 p-4">
                  <div>
                    <p className="text-xs text-slate-400 font-medium mb-0.5">Reference Price</p>
                    <div className="flex items-center gap-1.5">
                      <DollarSign className="h-4 w-4 text-slate-500" />
                      {rateLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
                      ) : details.transport.referencePrice != null ? (
                        <span className="text-sm font-bold text-slate-800">SAR {details.transport.referencePrice.toFixed(2)}</span>
                      ) : (
                        <span className="text-sm text-slate-400">Select route & vehicle</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 font-medium mb-0.5">Number of Vehicles</p>
                    <input
                      type="number"
                      min={1}
                      value={details.transport.numberOfVehicles}
                      onChange={handleNumVehiclesChange}
                      disabled={disabled}
                      className="w-20 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:border-brand-600 transition-colors disabled:bg-slate-50"
                    />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 font-medium mb-0.5">Calculated Total</p>
                    <div className="flex items-center gap-1.5">
                      <Calculator className="h-4 w-4 text-brand-500" />
                      {effectivePrice != null ? (
                        <span className="text-sm font-bold text-brand-700">SAR {(effectivePrice * details.transport.numberOfVehicles).toFixed(2)}</span>
                      ) : (
                        <span className="text-sm text-slate-400">—</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Price override (admin only) */}
              {isAdmin && details.transport.referencePrice != null && (
                <div className="md:col-span-2">
                  <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={details.transport.hasPriceOverride}
                      onChange={(e) => updateTransport({ hasPriceOverride: e.target.checked, agreedPrice: e.target.checked ? details.transport.agreedPrice : null })}
                      disabled={disabled}
                      className="rounded border-slate-300 text-brand-500 focus:ring-brand-200"
                    />
                    Override reference rate for this booking
                  </label>
                  {details.transport.hasPriceOverride && (
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-md border border-amber-200 bg-amber-50/40 p-3">
                      <div>
                        <FieldLabel required>New Agreed Price (SAR)</FieldLabel>
                        <input type="number" min={0} step="0.01" value={details.transport.agreedPrice ?? ''} onChange={(e) => updateTransport({ agreedPrice: parseFloat(e.target.value) || 0 })} disabled={disabled} className={inputClass} />
                      </div>
                      <div>
                        <FieldLabel required>Reason</FieldLabel>
                        <input type="text" value={details.transport.overrideReason} onChange={(e) => updateTransport({ overrideReason: e.target.value })} placeholder="Reason for override" disabled={disabled} className={inputClass} />
                      </div>
                      <div>
                        <FieldLabel required>Approving Staff</FieldLabel>
                        <SearchableCombobox
                          options={staffOptions}
                          value={details.transport.overrideApproverId}
                          onChange={(v) => {
                            const s = staffOptions.find((o) => o.value === v);
                            updateTransport({ overrideApproverId: v, overrideApproverName: s?.label || '' });
                          }}
                          placeholder="Select approver"
                          emptyMessage="No staff found"
                          icon={User}
                          disabled={disabled}
                        />
                      </div>
                      <div className="sm:col-span-3 flex items-center gap-4 text-xs">
                        <span className="text-slate-500">Reference: <span className="font-semibold text-slate-700">SAR {details.transport.referencePrice?.toFixed(2)}</span></span>
                        <span className="text-amber-700">Agreed: <span className="font-semibold">SAR {details.transport.agreedPrice?.toFixed(2)}</span></span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div>
                <FieldLabel>Transport Provider</FieldLabel>
                <input type="text" value={details.transport.transportProvider} onChange={(e) => updateTransport({ transportProvider: e.target.value })} placeholder="Optional" disabled={disabled} className={inputClass} />
              </div>

              <div>
                <FieldLabel>Pickup Date</FieldLabel>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none z-10" />
                  <input type="date" value={details.transport.pickupDate} onChange={(e) => updateTransport({ pickupDate: e.target.value })} disabled={disabled} className={cn(inputClass, 'pl-10')} />
                </div>
              </div>

              <div>
                <FieldLabel>Pickup Time</FieldLabel>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none z-10" />
                  <input type="time" value={details.transport.pickupTime} onChange={(e) => updateTransport({ pickupTime: e.target.value })} disabled={disabled} className={cn(inputClass, 'pl-10')} />
                </div>
              </div>

              <div className="md:col-span-2">
                <FieldLabel>Internal Notes</FieldLabel>
                <textarea value={details.transport.internalNotes} onChange={(e) => updateTransport({ internalNotes: e.target.value })} placeholder="Optional transport notes" disabled={disabled} rows={2} className={cn(inputClass, 'resize-none')} />
              </div>

              <div className="md:col-span-2">
                <button type="button" onClick={() => { setShowCustomRoute(true); updateTransport({ isCustomRoute: true, routeId: null, routeName: '', referencePrice: null }); }} disabled={disabled} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors">
                  <Plus className="h-3 w-3" /> Route not listed? Enter a custom route
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3 rounded-md border border-brand-200 bg-brand-50/40 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-brand-700">Custom Route (CUSTOM_ROUTE)</span>
                <button type="button" onClick={() => { setShowCustomRoute(false); updateTransport({ isCustomRoute: false, customOrigin: '', customDestination: '', routeName: '' }); }} className="text-xs text-slate-500 hover:text-slate-700">Cancel</button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <FieldLabel required>Origin</FieldLabel>
                  <input type="text" value={details.transport.customOrigin} onChange={(e) => updateTransport({ customOrigin: e.target.value, routeName: `${e.target.value} → ${details.transport.customDestination || '...'}` })} placeholder="Pickup location" disabled={disabled} className={inputClass} />
                </div>
                <div>
                  <FieldLabel required>Destination</FieldLabel>
                  <input type="text" value={details.transport.customDestination} onChange={(e) => updateTransport({ customDestination: e.target.value, routeName: `${details.transport.customOrigin || '...'} → ${e.target.value}` })} placeholder="Drop-off location" disabled={disabled} className={inputClass} />
                </div>
                <div>
                  <FieldLabel>Vehicle Type</FieldLabel>
                  <SearchableCombobox options={vehicleOptions} value={details.transport.vehicleTypeId} onChange={handleVehicleSelect} placeholder="Select vehicle type" emptyMessage="No vehicles found" icon={Package} disabled={disabled} />
                </div>
                <div>
                  <FieldLabel required>Agreed Price (SAR)</FieldLabel>
                  <input type="number" min={0} step="0.01" value={details.transport.agreedPrice ?? ''} onChange={(e) => updateTransport({ agreedPrice: parseFloat(e.target.value) || 0, referencePrice: parseFloat(e.target.value) || 0 })} placeholder="Agreed price" disabled={disabled} className={inputClass} />
                </div>
                <div className="sm:col-span-2">
                  <FieldLabel>Notes</FieldLabel>
                  <input type="text" value={details.transport.internalNotes} onChange={(e) => updateTransport({ internalNotes: e.target.value })} placeholder="Optional notes" disabled={disabled} className={inputClass} />
                </div>
              </div>
              <div className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
                Custom routes are marked CUSTOM_ROUTE and will not be added to the permanent price list. An administrator may promote them later.
              </div>
            </div>
          )}
        </section>

        {/* ── Section C — Hotels ── */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-50 text-brand-700">
              <span className="text-xs font-bold">C</span>
            </div>
            <h4 className="text-sm font-semibold text-navy-900 uppercase tracking-wide">Hotels</h4>
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
                  <button type="button" onClick={() => setShowCustomMakkah(true)} disabled={disabled} className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors">
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
                  <p className="text-xs text-slate-400">City: Makkah (fixed)</p>
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
                  <button type="button" onClick={() => setShowCustomMadinah(true)} disabled={disabled} className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors">
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
                  <p className="text-xs text-slate-400">City: Madinah (fixed)</p>
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
            <h4 className="text-sm font-semibold text-navy-900 uppercase tracking-wide">Planned Dates</h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <FieldLabel>Planned Outbound Date</FieldLabel>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none z-10" />
                <input type="date" value={details.plannedOutboundDate} onChange={handleDateChange('plannedOutboundDate')} disabled={disabled} className={cn(inputClass, 'pl-10')} />
              </div>
              <p className="mt-1 text-xs text-slate-400">Planned date only — does not confirm actual arrival</p>
            </div>
            <div>
              <FieldLabel>Expected Return Date</FieldLabel>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none z-10" />
                <input type="date" value={details.expectedReturnDate} onChange={handleDateChange('expectedReturnDate')} disabled={disabled} className={cn(inputClass, 'pl-10')} />
              </div>
              <p className="mt-1 text-xs text-slate-400">Planned date only — does not confirm actual departure</p>
            </div>
          </div>
          {(dateError || errors.dateError) && (
            <div className="mt-3 flex items-center gap-2 text-xs text-red-600">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              {dateError || errors.dateError}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
