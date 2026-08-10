import { useState, useCallback, useRef } from 'react';
import {
  UploadCloud,
  FileText,
  Table,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Building,
  XCircle,
  ChevronRight,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { logAudit } from '@/lib/audit';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { cn } from '@/lib/utils';

interface ParsedHotel {
  id?: string;
  city: string;
  name_en: string;
  name_ar?: string;
  classification?: string;
  licence_number?: string;
  district?: string;
  rowNumber: number;
  matchType: 'new' | 'update_existing';
  matchField?: string;
  errors: string[];
}

interface ParseSummary {
  filename: string;
  totalRows: number;
  makkahCount: number;
  madinahCount: number;
  newHotels: number;
  existingMatched: number;
  toUpdate: number;
  duplicateIds: number;
  duplicateNames: number;
  invalidRecords: number;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        cells.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    cells.push(current);
    rows.push(cells);
  }
  return rows;
}

function normalizeHotelName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

export default function HotelImportPage() {
  const { profile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsedHotels, setParsedHotels] = useState<ParsedHotel[]>([]);
  const [summary, setSummary] = useState<ParseSummary | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<{ added: number; updated: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(async (file: File) => {
    setParsing(true);
    setError(null);
    setResult(null);
    setParsedHotels([]);
    setSummary(null);

    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length < 2) {
        setError('CSV file appears to be empty or has only a header row.');
        setParsing(false);
        return;
      }

      const header = rows[0].map((h) => h.trim().toLowerCase());
      const findCol = (...names: string[]): number => {
        for (const name of names) {
          const idx = header.indexOf(name);
          if (idx >= 0) return idx;
        }
        return -1;
      };

      const idCol = findCol('id', 'hotel_id');
      const cityCol = findCol('city', 'city_scope');
      const nameEnCol = findCol('name_en', 'hotel_name', 'name', 'english_name');
      const nameArCol = findCol('name_ar', 'arabic_name');
      const classCol = findCol('classification', 'class', 'star_rating', 'category');
      const licCol = findCol('licence_number', 'license_number', 'licence');
      const districtCol = findCol('district', 'area');

      if (nameEnCol < 0) {
        setError('CSV must contain at least a "name_en" or "hotel_name" column.');
        setParsing(false);
        return;
      }

      // Fetch existing hotels for matching
      const { data: existing } = await supabase
        .from('hotel_references')
        .select('id, city, name_en, licence_number')
        .order('name_en');

      const existingById = new Map<string, Record<string, unknown>>();
      const existingByLicence = new Map<string, Record<string, unknown>>();
      const existingByNameCity = new Map<string, Record<string, unknown>>();
      const seenIds = new Set<string>();
      const seenNormalizedNames = new Set<string>();

      (existing || []).forEach((h: Record<string, unknown>) => {
        if (h.id) existingById.set(h.id as string, h);
        if (h.licence_number) existingByLicence.set(h.licence_number as string, h);
        const normKey = `${normalizeHotelName(h.name_en as string)}|${h.city}`;
        existingByNameCity.set(normKey, h);
      });

      const hotels: ParsedHotel[] = [];
      let duplicateIds = 0;
      let duplicateNames = 0;
      let invalidRecords = 0;

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const rowErrors: string[] = [];

        const city = cityCol >= 0 ? (row[cityCol] || '').trim() : '';
        const nameEn = nameEnCol >= 0 ? (row[nameEnCol] || '').trim() : '';
        const hotelId = idCol >= 0 ? (row[idCol] || '').trim() : '';
        const licence = licCol >= 0 ? (row[licCol] || '').trim() : '';

        if (!nameEn) rowErrors.push('Missing hotel name');
        if (!city) rowErrors.push('Missing city');
        if (city && !['makkah', 'madinah'].includes(city.toLowerCase())) {
          rowErrors.push(`Invalid city: ${city} (must be Makkah or Madinah)`);
        }

        if (rowErrors.length > 0) {
          invalidRecords++;
          hotels.push({
            city,
            name_en: nameEn,
            rowNumber: i + 1,
            matchType: 'new',
            errors: rowErrors,
          });
          continue;
        }

        // Check for duplicates within the file itself
        if (hotelId) {
          if (seenIds.has(hotelId)) {
            duplicateIds++;
            rowErrors.push('Duplicate Hotel ID within file');
          }
          seenIds.add(hotelId);
        }
        const normName = `${normalizeHotelName(nameEn)}|${city.toLowerCase()}`;
        if (seenNormalizedNames.has(normName)) {
          duplicateNames++;
          rowErrors.push('Duplicate normalized name+city within file');
        }
        seenNormalizedNames.add(normName);

        // Match against existing database
        let matchType: 'new' | 'update_existing' = 'new';
        let matchField = '';

        if (hotelId && existingById.has(hotelId)) {
          matchType = 'update_existing';
          matchField = 'Hotel ID';
        } else if (licence && existingByLicence.has(licence)) {
          matchType = 'update_existing';
          matchField = 'Licence number';
        } else if (existingByNameCity.has(normName)) {
          matchType = 'update_existing';
          matchField = 'Normalized name + city';
        }

        hotels.push({
          id: hotelId || undefined,
          city: city,
          name_en: nameEn,
          name_ar: nameArCol >= 0 ? (row[nameArCol] || '').trim() || undefined : undefined,
          classification: classCol >= 0 ? (row[classCol] || '').trim() || undefined : undefined,
          licence_number: licence || undefined,
          district: districtCol >= 0 ? (row[districtCol] || '').trim() || undefined : undefined,
          rowNumber: i + 1,
          matchType,
          matchField,
          errors: rowErrors,
        });
      }

      const makkahCount = hotels.filter((h) => h.city.toLowerCase() === 'makkah').length;
      const madinahCount = hotels.filter((h) => h.city.toLowerCase() === 'madinah').length;
      const newHotels = hotels.filter((h) => h.matchType === 'new' && h.errors.length === 0).length;
      const existingMatched = hotels.filter((h) => h.matchType === 'update_existing').length;
      const toUpdate = existingMatched;
      setParsedHotels(hotels);
      setSummary({
        filename: file.name,
        totalRows: hotels.length,
        makkahCount,
        madinahCount,
        newHotels,
        existingMatched,
        toUpdate,
        duplicateIds,
        duplicateNames,
        invalidRecords,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to parse CSV file.');
    } finally {
      setParsing(false);
    }
  }, []);

  const handleImport = useCallback(async () => {
    if (!summary) return;
    setImporting(true);
    setConfirmOpen(false);

    try {
      let added = 0;
      let updated = 0;

      const validHotels = parsedHotels.filter((h) => h.errors.length === 0);

      for (const hotel of validHotels) {
        const cityCapitalized = hotel.city.charAt(0).toUpperCase() + hotel.city.slice(1).toLowerCase();
        const data: Record<string, unknown> = {
          city: cityCapitalized,
          name_en: hotel.name_en,
          name_ar: hotel.name_ar || null,
          classification: hotel.classification || null,
          licence_number: hotel.licence_number || null,
          district: hotel.district || null,
          source: 'REFERENCE',
        };

        if (hotel.matchType === 'update_existing' && hotel.id) {
          const { error } = await supabase
            .from('hotel_references')
            .update(data)
            .eq('id', hotel.id);
          if (!error) updated++;
        } else {
          const { error } = await supabase
            .from('hotel_references')
            .insert(data);
          if (!error) added++;
        }
      }

      await logAudit({
        action: 'hotel_reference_imported',
        recordType: 'hotel_references',
        recordLabel: summary.filename,
        newValue: { added, updated, total: validHotels.length },
        performedBy: profile?.id ?? null,
        performedByName: profile?.full_name ?? '',
      });

      setResult({ added, updated });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed.');
    } finally {
      setImporting(false);
    }
  }, [summary, parsedHotels, profile]);

  const summaryCards = summary ? [
    { label: 'Total Rows', value: summary.totalRows, icon: Table, color: 'text-slate-700' },
    { label: 'Makkah', value: summary.makkahCount, icon: Building, color: 'text-brand-700' },
    { label: 'Madinah', value: summary.madinahCount, icon: Building, color: 'text-brand-700' },
    { label: 'New Hotels', value: summary.newHotels, icon: CheckCircle2, color: 'text-green-700' },
    { label: 'Existing Matched', value: summary.existingMatched, icon: Table, color: 'text-blue-700' },
    { label: 'Duplicate IDs', value: summary.duplicateIds, icon: AlertCircle, color: 'text-amber-700' },
    { label: 'Duplicate Names', value: summary.duplicateNames, icon: AlertCircle, color: 'text-amber-700' },
    { label: 'Invalid Records', value: summary.invalidRecords, icon: XCircle, color: 'text-red-700' },
  ] : [];

  return (
    <div className="max-w-[1200px] mx-auto">
      <div className="mb-6">
        <nav className="text-xs text-slate-400 mb-2" aria-label="Breadcrumb">
          <span>Automation Settings</span>
          <ChevronRight className="inline h-3 w-3 mx-1" />
          <span className="text-slate-600 font-medium">Hotel Reference Import</span>
        </nav>
        <h1 className="font-display font-bold text-2xl text-navy-900">Hotel Reference Import</h1>
        <p className="mt-1 text-sm text-slate-500 max-w-2xl">
          Import hotel reference data from CSV files. Existing hotels are matched by Hotel ID, licence number, or normalized name. New hotels are added without deleting current records.
        </p>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border bg-red-50 border-red-200 px-4 py-3">
          <XCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
          <p className="text-sm text-red-800 flex-1">{error}</p>
        </div>
      )}

      {result && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border bg-green-50 border-green-200 px-4 py-3">
          <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
          <div className="text-sm text-green-800">
            <p className="font-semibold">Import complete: {result.added} hotels added, {result.updated} hotels updated.</p>
            <p className="text-green-700 mt-0.5">Existing hotel records that were absent from this file were not deleted.</p>
          </div>
        </div>
      )}

      {/* Upload area */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm mb-6">
        <div className="px-6 py-5 border-b border-slate-100">
          <h3 className="font-display font-bold text-base text-navy-900">Upload CSV File</h3>
          <p className="mt-0.5 text-xs text-slate-500">Accepted columns: id, city, name_en, name_ar, classification, licence_number, district</p>
        </div>
        <div className="px-6 py-5">
          <div
            onClick={() => !parsing && fileInputRef.current?.click()}
            className={cn(
              'flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 hover:border-slate-300 hover:bg-slate-50 py-10 px-6 cursor-pointer transition-all',
              parsing && 'opacity-50 cursor-not-allowed',
            )}
          >
            {parsing ? (
              <Loader2 className="h-10 w-10 text-brand-500 animate-spin" />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                <UploadCloud className="h-6 w-6" />
              </div>
            )}
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-700">
                {parsing ? 'Parsing file...' : 'Drop or choose a CSV file to import'}
              </p>
              <p className="mt-1 text-xs text-slate-400">No code rebuild required — new files are processed at upload time</p>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
        </div>
      </div>

      {/* Summary cards */}
      {summary && (
        <>
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="h-4 w-4 text-slate-500" />
              <span className="text-sm font-semibold text-slate-700">{summary.filename}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {summaryCards.map((card) => {
                const Icon = card.icon;
                return (
                  <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex items-center gap-1.5">
                      <Icon className={cn('h-3.5 w-3.5', card.color)} />
                      <span className="text-xs text-slate-500 font-medium">{card.label}</span>
                    </div>
                    <p className={cn('text-xl font-bold mt-1', card.color)}>{card.value}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Preview table */}
          {parsedHotels.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden mb-6">
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="font-display font-bold text-base text-navy-900">Preview ({parsedHotels.length} rows)</h3>
              </div>
              <div className="overflow-x-auto max-h-96 scrollbar-thin">
                <table className="w-full">
                  <thead className="sticky top-0 bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">Row</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">City</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">Hotel Name</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">Licence</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">Match</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {parsedHotels.slice(0, 100).map((h) => (
                      <tr key={h.rowNumber} className="hover:bg-slate-50/50">
                        <td className="px-4 py-2 text-xs text-slate-400">{h.rowNumber}</td>
                        <td className="px-4 py-2 text-sm text-slate-700">{h.city}</td>
                        <td className="px-4 py-2 text-sm font-medium text-slate-800">{h.name_en}</td>
                        <td className="px-4 py-2 text-sm text-slate-600">{h.licence_number || '—'}</td>
                        <td className="px-4 py-2 text-xs">
                          {h.matchType === 'update_existing' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 px-2 py-0.5 font-medium">
                              {h.matchField}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-green-50 text-green-700 px-2 py-0.5 font-medium">
                              New
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-xs">
                          {h.errors.length > 0 ? (
                            <span className="text-red-600">{h.errors.join(', ')}</span>
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parsedHotels.length > 100 && (
                <div className="px-4 py-2 text-xs text-slate-400 text-center bg-slate-50 border-t border-slate-100">
                  Showing first 100 of {parsedHotels.length} rows
                </div>
              )}
            </div>
          )}

          {/* Import action */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              {summary.newHotels} new + {summary.toUpdate} updates = {summary.newHotels + summary.toUpdate} records to import
            </p>
            <button
              onClick={() => setConfirmOpen(true)}
              disabled={importing || (summary.newHotels + summary.toUpdate) === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 transition-all disabled:opacity-40"
            >
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Confirm and Import
            </button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Confirm Hotel Reference Import"
        message={`This will add ${summary?.newHotels ?? 0} new hotels and update ${summary?.toUpdate ?? 0} existing hotels. Hotels absent from this file will not be deleted. Do you want to proceed?`}
        confirmLabel="Confirm Import"
        onConfirm={handleImport}
        onCancel={() => setConfirmOpen(false)}
        loading={importing}
      />
    </div>
  );
}
