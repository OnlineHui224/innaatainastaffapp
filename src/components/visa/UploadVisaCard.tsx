import { useRef, useState, useCallback } from 'react';
import {
  UploadCloud,
  FileText,
  Image as ImageIcon,
  X,
  Eye,
  RefreshCw,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface UploadVisaCardProps {
  file: File | null;
  onFileSelect: (file: File | null) => void;
  disabled: boolean;
  error?: string | null;
}

const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
const MAX_SIZE_MB = 10;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadVisaCard({ file, onFileSelect, disabled, error }: UploadVisaCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const validateAndSetFile = useCallback(
    (f: File | null) => {
      setLocalError(null);
      if (!f) {
        onFileSelect(null);
        setPreviewUrl(null);
        return;
      }

      if (!ACCEPTED_TYPES.includes(f.type)) {
        setLocalError('Unsupported file format. Please upload a PDF, JPG, JPEG, or PNG file.');
        return;
      }

      if (f.size > MAX_SIZE_BYTES) {
        setLocalError(`File exceeds the maximum size of ${MAX_SIZE_MB} MB.`);
        return;
      }

      onFileSelect(f);
      if (f.type.startsWith('image/')) {
        const url = URL.createObjectURL(f);
        setPreviewUrl(url);
      } else {
        setPreviewUrl(null);
      }
    },
    [onFileSelect],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      if (disabled) return;
      const droppedFile = e.dataTransfer.files?.[0];
      if (droppedFile) validateAndSetFile(droppedFile);
    },
    [disabled, validateAndSetFile],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0] ?? null;
      validateAndSetFile(selected);
    },
    [validateAndSetFile],
  );

  const handleRemove = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setLocalError(null);
    onFileSelect(null);
    if (inputRef.current) inputRef.current.value = '';
  }, [previewUrl, onFileSelect]);

  const handleReplace = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const isImage = file?.type.startsWith('image/');
  const isPdf = file?.type === 'application/pdf';
  const displayError = localError || error;

  return (
    <div className="rounded-lg border border-slate-300 bg-white">
      <div className="px-6 py-5 border-b border-slate-200">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display text-lg font-bold text-navy-900">B · Visa document</h2>
          <span className="text-xs text-slate-500">One document per record</span>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          A single issued visa. Nothing is read until you start extraction, and nothing is saved
          until you have reviewed what was read.
        </p>
      </div>

      <div className="px-6 py-5">
        {!file ? (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !disabled && inputRef.current?.click()}
            className={cn(
              'flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed py-12 px-6 cursor-pointer transition-colors',
              isDragging ? 'border-brand-400 bg-brand-50' : 'border-slate-300 hover:border-slate-300 hover:bg-slate-50',
              disabled && 'opacity-50 cursor-not-allowed',
            )}
          >
            <div className={cn(
              'flex h-14 w-14 items-center justify-center rounded-lg transition-colors',
              isDragging ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500',
            )}>
              <UploadCloud className="h-7 w-7" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-700">Drop the visa document here</p>
              <p className="mt-1 text-sm text-slate-500">
                A single issued visa. Replace it rather than adding a second file.
              </p>
              <p className="mt-1 text-sm text-slate-500">
                or <span className="font-medium text-brand-600">browse files</span>
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
            <p className="text-xs text-slate-500">Maximum size: {MAX_SIZE_MB} MB</p>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleFileInput}
              className="hidden"
              disabled={disabled}
            />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-4 rounded-md border border-slate-300 bg-slate-50 p-4">
              {/* Thumbnail or icon */}
              <div className="shrink-0">
                {isImage && previewUrl ? (
                  <img
                    src={previewUrl}
                    alt={file.name}
                    className="h-16 w-16 rounded-lg object-cover border border-slate-300"
                  />
                ) : isPdf ? (
                  <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-red-50">
                    <FileText className="h-8 w-8 text-red-600" />
                  </div>
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-slate-100">
                    <ImageIcon className="h-8 w-8 text-slate-500" />
                  </div>
                )}
              </div>

              {/* File info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate">{file.name}</p>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                  <span className="uppercase">{file.type.split('/')[1] || 'file'}</span>
                  <span className="text-slate-300">|</span>
                  <span>{formatFileSize(file.size)}</span>
                  <span className="text-slate-300">|</span>
                  <span className="flex items-center gap-1 text-emerald-700 font-medium">
                    <ShieldCheck className="h-3 w-3" /> Ready
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5 shrink-0">
                {isImage && previewUrl && (
                  <button
                    type="button"
                    onClick={() => window.open(previewUrl, '_blank')}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    <Eye className="h-3.5 w-3.5" /> Preview
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleReplace}
                  disabled={disabled}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Replace
                </button>
                <button
                  type="button"
                  onClick={handleRemove}
                  disabled={disabled}
                  className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" /> Remove
                </button>
              </div>
            </div>
          </div>
        )}

        {displayError && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
            <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{displayError}</p>
          </div>
        )}

        {/* AI Privacy Notice */}
        <div className="mt-4 flex items-start gap-2.5 rounded-md bg-slate-50 border border-slate-200 px-4 py-3">
          <ShieldCheck className="h-4 w-4 text-brand-500 shrink-0 mt-0.5" />
          <div className="text-xs text-slate-500 leading-relaxed">
            <p>
              This document will be securely processed by the configured AI extraction service.
              Extracted information must be reviewed before it is saved.
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-medium text-slate-600">Daily AI request cost: 1 request</span>
              <span className="text-slate-300">|</span>
              <span>The API key is never exposed to the browser</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
