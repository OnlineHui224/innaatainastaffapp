import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { HotelReference } from '@/types/visa';

interface UseHotelSearchResult {
  results: HotelReference[];
  loading: boolean;
  error: string | null;
  search: (query: string) => void;
  clear: () => void;
}

export function useHotelSearch(city: 'Makkah' | 'Madinah'): UseHotelSearchResult {
  const [results, setResults] = useState<HotelReference[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(
    (query: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);

      const trimmed = query.trim();
      if (!trimmed) {
        setResults([]);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);

      debounceRef.current = setTimeout(async () => {
        try {
          // Use ilike with % wildcards on both sides for partial matching.
          // ilike is case-insensitive in Postgres.
          // Search across name_en, name_ar, licence_number, district.
          // City filter is always applied so Makkah never returns Madinah.
          const { data, error: err } = await supabase
            .from('hotel_references')
            .select('id, city, name_en, name_ar, classification, licence_number, district, is_active, source')
            .eq('city', city)
            .eq('is_active', true)
            .or(`name_en.ilike.%${trimmed}%,name_ar.ilike.%${trimmed}%,licence_number.ilike.%${trimmed}%,district.ilike.%${trimmed}%`)
            .order('name_en')
            .range(0, 24);

          if (err) throw err;
          setResults((data || []) as HotelReference[]);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Search failed');
          setResults([]);
        } finally {
          setLoading(false);
        }
      }, 300);
    },
    [city],
  );

  const clear = useCallback(() => {
    setResults([]);
    setError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return { results, loading, error, search, clear };
}
