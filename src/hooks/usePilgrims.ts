import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { calculateJourneyStatus } from '@/lib/status';
import type { Pilgrim, SubAgent } from '@/types';

export interface PilgrimWithAgent extends Pilgrim {
  sub_agents: SubAgent | null;
}

interface UsePilgrimsOpts {
  search?: string;
  statusFilter?: string;
  subAgentFilter?: string;
  nationalityFilter?: string;
  page?: number;
  pageSize?: number;
}

export function usePilgrims(opts: UsePilgrimsOpts = {}) {
  const { search, statusFilter, subAgentFilter, nationalityFilter, page = 1, pageSize = 20 } = opts;
  const [pilgrims, setPilgrims] = useState<PilgrimWithAgent[]>([]);
  const [allPilgrims, setAllPilgrims] = useState<PilgrimWithAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('pilgrims')
        .select('*, sub_agents!pilgrims_sub_agent_id_fkey(*)', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (search) {
        query = query.or(
          `full_name.ilike.%${search}%,passport_number.ilike.%${search}%,nationality.ilike.%${search}%,phone_number.ilike.%${search}%`
        );
      }
      if (subAgentFilter && subAgentFilter !== 'all') {
        if (subAgentFilter === 'unassigned') {
          query = query.is('sub_agent_id', null);
        } else {
          query = query.eq('sub_agent_id', subAgentFilter);
        }
      }
      if (nationalityFilter && nationalityFilter !== 'all') {
        query = query.ilike('nationality', nationalityFilter);
      }

      const { data, error: err } = await query;
      if (err) throw err;

      const rows = (data || []) as unknown as PilgrimWithAgent[];
      setAllPilgrims(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load pilgrims');
    } finally {
      setLoading(false);
    }
  }, [search, subAgentFilter, nationalityFilter]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    let filtered = allPilgrims;
    if (statusFilter && statusFilter !== 'all') {
      filtered = allPilgrims.filter((p) => calculateJourneyStatus(p) === statusFilter);
    }
    setTotal(filtered.length);
    const start = (page - 1) * pageSize;
    setPilgrims(filtered.slice(start, start + pageSize));
  }, [allPilgrims, statusFilter, page, pageSize]);

  return { pilgrims, allPilgrims, loading, error, total, refetch: fetchAll };
}
