import { useCallback, useRef, useState, type DragEvent } from 'react';
import { AlertCircle, Check, FileUp, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  documentKind,
  formatBytes,
  isReadableExtension,
  type SourceDocument,
} from '@/types/flightOps';

interface DocumentUploadWorkspaceProps {
  documents: SourceDocument[];
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onLoadSample: () => void;
  disabled?: boolean;
}

const GRID = 'grid grid-cols-[minmax(min(150px,100%),1fr)_76px_92px_172px_40px] gap-3 min-w-[560px]';

/**
 * Multi-file ticket upload.
 *
 * Several documents routinely describe ONE continuous journey — an outbound
 * confirmation, a return, a photographed page — so this is a genuine multi-file
 * workspace, and the files are read together rather than one at a time.
 *
 * Unreadable files stay in the list and are marked, never silently dropped:
 * staff need to see that a file they added will not contribute.
 *
 * Below 431px each row becomes a stacked card (`max-xs:`), so the file list
 * never scrolls sideways on a phone.
 */
export function DocumentUploadWorkspace({
  documents,
  onAdd,
  onRemove,
  onClear,
  onLoadSample,
  disabled = false,
}: DocumentUploadWorkspaceProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragging(false);
      if (disabled) return;
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length) onAdd(files);
    },
    [disabled, onAdd],
  );

  const readable = documents.filter((doc) => isReadableExtension(doc.ext)).length;

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={cn(
        'rounded-md border bg-white transition-colors',
        dragging ? 'border-brand-500 ring-2 ring-brand-200' : 'border-slate-300',
      )}
    >
      {/* Drop target */}
      <div className="m-3.5 flex flex-wrap items-center gap-4 rounded-md border border-dashed border-slate-400 bg-slate-50 p-5">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-brand-200 bg-brand-50 text-brand-700"
          aria-hidden="true"
        >
          <FileUp className="h-[19px] w-[19px]" />
        </span>

        <div className="min-w-0 flex-1 basis-60">
          <p className="text-[0.9375rem] font-extrabold text-navy-900">
            Drop travel ticket documents here
          </p>
          <p className="mt-0.5 text-[0.8125rem] text-slate-600">
            One or more files may belong to the same continuous journey — they are read together.
          </p>
        </div>

        <div className="flex items-center gap-1.5" aria-hidden="true">
          {['PDF', 'JPG', 'PNG'].map((label) => (
            <span
              key={label}
              className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-2xs font-bold tracking-wide text-slate-600"
            >
              {label}
            </span>
          ))}
        </div>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          className={cn(
            'inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-md px-4 py-2.5',
            'bg-navy-800 text-[0.8125rem] font-extrabold text-white transition-colors',
            'hover:bg-navy-900 disabled:cursor-not-allowed disabled:opacity-45',
          )}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span className="whitespace-nowrap">Browse files</span>
        </button>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          className="sr-only"
          disabled={disabled}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            if (files.length) onAdd(files);
            // Reset so re-picking the same filename fires change again.
            event.target.value = '';
          }}
        />
      </div>

      {documents.length > 0 ? (
        <div className="overflow-x-auto max-xs:overflow-x-visible">
          <div
            className={cn(
              GRID,
              'max-xs:hidden border-y border-slate-200 bg-slate-50 px-[1.125rem] py-2.5',
              'text-2xs font-bold uppercase tracking-wider text-slate-500',
            )}
          >
            <div>Filename</div>
            <div>Type</div>
            <div>Size</div>
            <div>Status</div>
            <div />
          </div>

          <ul>
            {documents.map((doc) => {
              const ok = isReadableExtension(doc.ext);

              return (
                <li
                  key={doc.id}
                  className={cn(
                    GRID,
                    'items-center border-b border-slate-100 px-[1.125rem] py-2.5',
                    /* Phone: two columns, three rows — a card, not a table row. */
                    'max-xs:!grid-cols-[1fr_auto] max-xs:!min-w-0 max-xs:!gap-x-3 max-xs:!gap-y-1.5 max-xs:px-3.5 max-xs:py-3',
                  )}
                >
                  <div className="flex min-w-0 items-center gap-2.5 max-xs:col-start-1 max-xs:row-start-1">
                    <span
                      className={cn(
                        'flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded border text-[8px] font-bold',
                        ok
                          ? 'border-slate-300 bg-slate-50 text-slate-600'
                          : 'border-red-300 bg-red-50 text-red-700',
                      )}
                      aria-hidden="true"
                    >
                      {doc.ext}
                    </span>
                    <span className="truncate text-[0.8125rem] text-slate-900" title={doc.name}>
                      {doc.name}
                    </span>
                  </div>

                  <div className="text-xs text-slate-600 max-xs:col-start-1 max-xs:row-start-2">
                    {documentKind(doc.ext)}
                  </div>

                  <div className="text-xs tabular-nums text-slate-600 max-xs:col-start-2 max-xs:row-start-2 max-xs:whitespace-nowrap max-xs:text-right">
                    {formatBytes(doc.bytes)}
                  </div>

                  <div className="max-xs:col-span-2 max-xs:col-start-1 max-xs:row-start-3">
                    {ok ? (
                      <span className="inline-flex items-center gap-1.5 rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-2xs font-bold uppercase tracking-wide text-emerald-800">
                        <Check className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                        Ready to read
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded border border-red-300 bg-red-50 px-2 py-1 text-2xs font-bold uppercase tracking-wide text-red-700">
                        <AlertCircle className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                        Unsupported
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    aria-label={`Remove ${doc.name}`}
                    title={`Remove ${doc.name}`}
                    onClick={() => onRemove(doc.id)}
                    disabled={disabled}
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded border border-transparent text-slate-500 transition-colors',
                      'hover:border-red-300 hover:bg-red-50 hover:text-red-700',
                      'disabled:cursor-not-allowed disabled:opacity-40',
                      'max-xs:col-start-2 max-xs:row-start-1 max-xs:h-11 max-xs:w-11',
                    )}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="flex items-center justify-between gap-3 bg-slate-50 px-[1.125rem] py-2.5">
            <p className="text-xs text-slate-600">
              {readable} {readable === 1 ? 'document' : 'documents'} will be read as one continuous
              journey
            </p>
            <button
              type="button"
              onClick={onClear}
              disabled={disabled}
              className="min-h-[36px] whitespace-nowrap rounded px-2 py-1 text-xs font-bold text-brand-700 transition-colors hover:text-brand-800 disabled:opacity-40"
            >
              Clear all
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3.5 border-t border-slate-100 px-[1.125rem] pb-4 pt-3.5">
          <p className="text-[0.8125rem] text-slate-600">No documents selected yet.</p>
          <button
            type="button"
            onClick={onLoadSample}
            disabled={disabled}
            className="min-h-[36px] rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 hover:text-navy-900 disabled:opacity-40"
          >
            Load sample documents
          </button>
        </div>
      )}
    </div>
  );
}
