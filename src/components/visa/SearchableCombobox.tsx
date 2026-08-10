import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown, Search, X, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ComboboxOption {
  value: string;
  label: string;
  secondary?: string;
  tertiary?: string;
}

interface SearchableComboboxProps {
  options: ComboboxOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  loading?: boolean;
  emptyMessage?: string;
  onSearchChange?: (query: string) => void;
  disabled?: boolean;
  error?: string;
  icon?: typeof Search;
}

export function SearchableCombobox({
  options,
  value,
  onChange,
  placeholder = 'Search...',
  loading = false,
  emptyMessage = 'No results found',
  onSearchChange,
  disabled = false,
  error = false,
  icon: Icon = Search,
}: SearchableComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setQuery(val);
      setHighlightedIndex(-1);
      onSearchChange?.(val);
    },
    [onSearchChange],
  );

  const handleSelect = useCallback(
    (option: ComboboxOption) => {
      onChange(option.value);
      setOpen(false);
      setQuery('');
      setHighlightedIndex(-1);
    },
    [onChange],
  );

  const handleClear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onChange(null);
      setQuery('');
    },
    [onChange],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === 'ArrowDown') {
        setOpen(true);
        e.preventDefault();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.min(prev + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && highlightedIndex >= 0 && options[highlightedIndex]) {
      e.preventDefault();
      handleSelect(options[highlightedIndex]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setHighlightedIndex(-1);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div
        onClick={() => !disabled && setOpen(true)}
        className={cn(
          'flex items-center gap-2 rounded-xl border bg-white px-3 py-2.5 cursor-pointer transition-all',
          disabled && 'opacity-50 cursor-not-allowed bg-slate-50',
          error ? 'border-red-400 ring-1 ring-red-100' : 'border-slate-200',
          !disabled && !error && 'hover:border-slate-300',
          open && !disabled && !error && 'border-brand-400 ring-2 ring-brand-100',
          open && !disabled && error && 'border-red-400 ring-2 ring-red-100',
        )}
      >
        <Icon className={cn('h-4 w-4 shrink-0', error ? 'text-red-400' : 'text-slate-400')} />
        {open ? (
          <input
            ref={inputRef}
            autoFocus
            type="text"
            value={query}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="flex-1 min-w-0 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 outline-none"
            disabled={disabled}
          />
        ) : (
          <span
            className={cn(
              'flex-1 min-w-0 text-sm truncate',
              selected ? 'text-slate-900 font-medium' : 'text-slate-400',
            )}
          >
            {selected ? selected.label : placeholder}
          </span>
        )}
        {selected && !open && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="text-slate-400 hover:text-slate-600 shrink-0"
            aria-label="Clear selection"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand-500" />}
        {!loading && !open && (
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform')} />
        )}
      </div>

      {open && !disabled && (
        <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl scrollbar-thin">
          {loading ? (
            <div className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching...
            </div>
          ) : options.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-slate-400">{emptyMessage}</div>
          ) : (
            <ul role="listbox" className="py-1">
              {options.map((option, index) => (
                <li
                  key={option.value}
                  role="option"
                  aria-selected={option.value === value}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelect(option);
                  }}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={cn(
                    'flex flex-col gap-0.5 px-3 py-2.5 cursor-pointer transition-colors',
                    highlightedIndex === index ? 'bg-brand-50' : 'hover:bg-slate-50',
                    option.value === value && 'bg-brand-50',
                  )}
                >
                  <div className="flex items-center gap-2">
                    {option.value === value && <Check className="h-3.5 w-3.5 text-brand-600 shrink-0" />}
                    <span className="text-sm font-medium text-slate-900 truncate">{option.label}</span>
                  </div>
                  {(option.secondary || option.tertiary) && (
                    <div className="flex items-center gap-2 text-xs text-slate-500 pl-5">
                      {option.secondary && <span>{option.secondary}</span>}
                      {option.secondary && option.tertiary && <span className="text-slate-300">|</span>}
                      {option.tertiary && <span>{option.tertiary}</span>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
