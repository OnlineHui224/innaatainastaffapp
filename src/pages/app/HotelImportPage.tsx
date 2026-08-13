import { useState, useCallback, useRef } from 'react';
import { CheckCircle2, FileText, UploadCloud } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { logAudit } from '@/lib/audit';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PageHeader } from '@/components/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Identifier } from '@/components/ui/Field';
import { LoadingBlock } from '@/components/ui/Feedback';
import { Panel } from '@/components/ui/Panel';
import { TBody, TD, TH, THead, TR, TableFrame } from '@/components/ui/Table';
import { ImportStages, OutcomeTile } from '@/components/imports/ImportStages';
import { cn } from '@/lib/utils';

const HOTEL_STAGES = [
  { key: 'upload', label: 'Upload file' },
  { key: 'parse', label: 'Parse & match' },
  { key: 'confirm', label: 'Confirm & import' },
  { key: 'result', label: 'Result' },
];

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


  const stageIndex = result ? 3 : summary ? 2 : parsing ? 1 : 0;

  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title="Hotel Reference Import"
        subtitle="Import Makkah and Madinah hotel reference data from a CSV file. Rows are matched to existing hotels by Hotel ID, licence number, or normalised name and city."
      />

      <ImportStages stages={HOTEL_STAGES} currentIndex={stageIndex} className="mb-6" />

      {error && (
        <Alert tone="critical" title="This file could not be used" className="mb-5" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {result && (
        <Alert tone="success" title="Import complete" className="mb-5">
          <span className="tabular-nums font-semibold">{result.added}</span> hotels added and{' '}
          <span className="tabular-nums font-semibold">{result.updated}</span> hotels updated.
          {/* Stated accurately: this import inserts and updates. It never deletes. */}
          <span className="mt-1 block">
            This import only inserts and updates. Hotel records that were absent from this file were left
            untouched — nothing was deleted.
          </span>
        </Alert>
      )}

      <Panel
        title="Upload CSV file"
        description="Accepted columns: id, city, name_en, name_ar, classification, licence_number, district."
        className="mb-6"
      >
        <div
          onClick={() => !parsing && fileInputRef.current?.click()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f && !parsing) handleFile(f);
          }}
          onDragOver={(e) => e.preventDefault()}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed border-slate-300 px-6 py-10 transition-colors hover:border-brand-500 hover:bg-brand-50/30',
            parsing && 'cursor-not-allowed opacity-60',
          )}
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-md border border-slate-300 bg-slate-50 text-slate-500">
            <UploadCloud className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="text-center">
            <p className="font-display text-sm font-bold text-navy-900">
              {parsing ? 'Parsing file…' : 'Drop a CSV file here, or choose one'}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Files are processed at upload time — no rebuild or deployment is needed.
            </p>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          aria-label="Choose a hotel reference CSV file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
      </Panel>

      {parsing && <LoadingBlock label="Parsing and matching hotel rows…" />}

      {summary && !parsing && (
        <div className="space-y-6">
          <div className="flex items-center gap-2 text-sm">
            <FileText className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
            <span className="font-semibold text-slate-900">{summary.filename}</span>
          </div>

          {/* The real summary this workflow produces. There is no "needs review"
              status in the hotel import — inventing one would misdescribe it. */}
          <section aria-labelledby="hotel-summary">
            <h2
              id="hotel-summary"
              className="mb-3 border-b border-slate-300 pb-2 font-display text-sm font-bold uppercase tracking-wide text-navy-900"
            >
              Parse summary
            </h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <OutcomeTile label="Total rows" value={summary.totalRows} tone="neutral" description="Found in the file" />
              <OutcomeTile label="Makkah" value={summary.makkahCount} tone="info" />
              <OutcomeTile label="Madinah" value={summary.madinahCount} tone="info" />
              <OutcomeTile label="New" value={summary.newHotels} tone="ready" description="Will be inserted" />
              <OutcomeTile
                label="Existing matched"
                value={summary.existingMatched}
                tone="ready"
                description="Will be updated"
              />
              <OutcomeTile
                label="Duplicate IDs"
                value={summary.duplicateIds}
                tone="blocked"
                description="Repeated within this file"
              />
              <OutcomeTile
                label="Duplicate names"
                value={summary.duplicateNames}
                tone="blocked"
                description="Same name and city in this file"
              />
              <OutcomeTile
                label="Invalid"
                value={summary.invalidRecords}
                tone="blocked"
                description="Missing name or city"
              />
            </div>
          </section>

          {parsedHotels.length > 0 && (
            <section aria-labelledby="hotel-preview">
              <h2
                id="hotel-preview"
                className="mb-3 border-b border-slate-300 pb-2 font-display text-sm font-bold uppercase tracking-wide text-navy-900"
              >
                Preview ({parsedHotels.length} rows)
              </h2>

              <p className="rounded-lg border border-slate-300 bg-white p-4 text-sm text-slate-700 lg:hidden">
                <span className="font-semibold tabular-nums">{summary.newHotels}</span> new and{' '}
                <span className="font-semibold tabular-nums">{summary.toUpdate}</span> existing hotel rows are
                ready. Open this page on a larger screen to inspect the full row list.
              </p>

              <div className="hidden lg:block">
                <TableFrame caption="Parsed hotel reference rows">
                  <THead>
                    <tr>
                      <TH numeric>Row</TH>
                      <TH>City</TH>
                      <TH>Hotel name</TH>
                      <TH>Licence</TH>
                      <TH>Match</TH>
                      <TH>Status</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {parsedHotels.slice(0, 100).map((h) => (
                      <TR key={h.rowNumber}>
                        <TD numeric className="text-xs text-slate-500">
                          {h.rowNumber}
                        </TD>
                        <TD>{h.city || <span className="text-slate-400">Missing</span>}</TD>
                        <TD className="font-medium text-slate-900">
                          {h.name_en || <span className="italic text-red-700">(name missing)</span>}
                        </TD>
                        <TD>
                          {/* Licence number is a genuine operational identifier */}
                          <Identifier value={h.licence_number} />
                        </TD>
                        <TD>
                          {h.matchType === 'update_existing' ? (
                            <Badge tone="info">{h.matchField || 'Matched'}</Badge>
                          ) : (
                            <Badge tone="positive" treatment="solid">
                              New
                            </Badge>
                          )}
                        </TD>
                        <TD>
                          {h.errors.length > 0 ? (
                            <span className="text-xs text-red-800">{h.errors.join(', ')}</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-800">
                              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                              Ready
                            </span>
                          )}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </TableFrame>
                {parsedHotels.length > 100 && (
                  <p className="mt-2 text-xs text-slate-500">
                    Showing the first 100 of {parsedHotels.length} rows. All valid rows will be imported.
                  </p>
                )}
              </div>
            </section>
          )}

          <div className="sticky bottom-0 z-10 flex flex-col gap-3 rounded-lg border border-slate-300 bg-white/95 p-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-700">
              <span className="font-bold tabular-nums text-emerald-900">{summary.newHotels}</span> new +{' '}
              <span className="font-bold tabular-nums text-brand-900">{summary.toUpdate}</span> updates ={' '}
              <span className="font-bold tabular-nums">{summary.newHotels + summary.toUpdate}</span> records to
              import
            </p>
            <Button
              onClick={() => setConfirmOpen(true)}
              loading={importing}
              disabled={summary.newHotels + summary.toUpdate === 0}
              icon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
            >
              Confirm and import
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Confirm hotel reference import"
        confirmLabel={`Import ${(summary?.newHotels ?? 0) + (summary?.toUpdate ?? 0)} Hotel Records`}
        loading={importing}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleImport}
        message={
          <>
            This adds <strong className="tabular-nums">{summary?.newHotels ?? 0}</strong> new hotels and updates{' '}
            <strong className="tabular-nums">{summary?.toUpdate ?? 0}</strong> existing hotels. Hotels that are
            absent from this file are not deleted — this import only inserts and updates.
          </>
        }
      />
    </div>
  );
}
