import { useCallback, useRef, useState, type DragEvent } from 'react';
import { AlertCircle, FileText, Image as ImageIcon, Plus, UploadCloud, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, IconButton } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Feedback';
import {
  ACCEPTED_DOCUMENT_LABEL,
  ACCEPTED_DOCUMENT_TYPES,
  DOCUMENT_STATUS_LABELS,
  MAX_DOCUMENT_SIZE_MB,
  formatFileSize,
  type SourceDocument,
} from '@/types/flightOps';

interface DocumentUploadWorkspaceProps {
  documents: SourceDocument[];
  onAdd: (files: FileList | File[]) => void;
  onRemove: (id: string) => void;
  disabled?: boolean;
}

function documentIcon(mimeType: string) {
  return mimeType === 'application/pdf' ? FileText : ImageIcon;
}

function shortType(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType === 'image/png') return 'PNG';
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return 'JPG';
  return mimeType.split('/')[1]?.toUpperCase() || 'FILE';
}

/**
 * Multi-file ticket upload.
 *
 * Several documents routinely describe ONE continuous journey — an outbound
 * confirmation and a return confirmation, or one file per sector — so this is a
 * genuine multi-file workspace rather than a repeated single-file control.
 *
 * Unreadable files are kept in the list and marked, not silently dropped: staff
 * need to see that a file they added will not contribute to the extraction.
 */
export function DocumentUploadWorkspace({
  documents,
  onAdd,
  onRemove,
  disabled = false,
}: DocumentUploadWorkspaceProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      if (disabled) return;
      if (event.dataTransfer.files?.length) onAdd(event.dataTransfer.files);
    },
    [disabled, onAdd],
  );

  const openPicker = useCallback(() => inputRef.current?.click(), []);

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_DOCUMENT_TYPES.join(',')}
        className="sr-only"
        disabled={disabled}
        onChange={(event) => {
          if (event.target.files?.length) onAdd(event.target.files);
          // Reset so re-picking the same filename fires a change event again.
          event.target.value = '';
        }}
      />

      {documents.length === 0 ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={cn('rounded-lg transition-colors', isDragging && 'ring-2 ring-brand-400')}
        >
          <EmptyState
            icon={<UploadCloud className="h-5 w-5" aria-hidden="true" />}
            title="Add travel ticket documents"
            description={
              <>
                Drag files here, or browse to select them. {ACCEPTED_DOCUMENT_LABEL} up to{' '}
                {MAX_DOCUMENT_SIZE_MB} MB each.
                <br />
                Add every document for the journey — they are read together as one trip.
              </>
            }
            action={
              <Button
                variant="secondary"
                icon={<Plus className="h-4 w-4" aria-hidden="true" />}
                onClick={openPicker}
                disabled={disabled}
              >
                Browse files
              </Button>
            }
            className={cn(isDragging && 'border-brand-500 bg-brand-50/60')}
          />
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={cn(
            'overflow-hidden rounded-lg border border-slate-300 bg-white transition-colors',
            isDragging && 'border-brand-500 ring-2 ring-brand-200',
          )}
        >
          <ul className="divide-y divide-slate-200">
            {documents.map((doc) => {
              const Icon = documentIcon(doc.mimeType);
              const isProblem = doc.status !== 'ready';

              return (
                <li
                  key={doc.id}
                  className={cn(
                    'flex items-start gap-3 px-3 py-2.5 sm:items-center',
                    isProblem && 'bg-amber-50/60',
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border sm:mt-0',
                      isProblem
                        ? 'border-amber-300 bg-white text-amber-700'
                        : 'border-slate-300 bg-slate-50 text-slate-600',
                    )}
                    aria-hidden="true"
                  >
                    {isProblem ? <AlertCircle className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.8125rem] font-semibold text-slate-900" title={doc.name}>
                      {doc.name}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-slate-500">
                      <span className="font-semibold uppercase tracking-wide">{shortType(doc.mimeType)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{formatFileSize(doc.sizeBytes)}</span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={cn(
                          'font-semibold uppercase tracking-wide',
                          isProblem ? 'text-amber-800' : 'text-emerald-700',
                        )}
                      >
                        {DOCUMENT_STATUS_LABELS[doc.status]}
                      </span>
                    </p>
                    {doc.message && (
                      <p className="mt-1 text-xs leading-snug text-amber-900">{doc.message}</p>
                    )}
                  </div>

                  <IconButton
                    label={`Remove ${doc.name}`}
                    icon={<X className="h-4 w-4" aria-hidden="true" />}
                    variant="danger"
                    size="sm"
                    onClick={() => onRemove(doc.id)}
                    disabled={disabled}
                    className="shrink-0"
                  />
                </li>
              );
            })}
          </ul>

          <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-2xs text-slate-600">
              {documents.length} {documents.length === 1 ? 'document' : 'documents'} · read together as
              one journey
            </p>
            <Button
              variant="secondary"
              size="sm"
              icon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}
              onClick={openPicker}
              disabled={disabled}
            >
              Add another file
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
