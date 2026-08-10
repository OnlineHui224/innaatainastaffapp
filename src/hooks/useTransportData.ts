import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { TransportRoute, TransportVehicleType, TransportReferenceRate } from '@/types/visa';

interface UseTransportDataResult {
  routes: TransportRoute[];
  vehicleTypes: TransportVehicleType[];
  loading: boolean;
  error: string | null;
  getRate: (routeId: string, vehicleTypeId: string) => Promise<TransportReferenceRate | null>;
}

export function useTransportData(): UseTransportDataResult {
  const [routes, setRoutes] = useState<TransportRoute[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<TransportVehicleType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [routesRes, vehiclesRes] = await Promise.all([
          supabase
            .from('transport_routes')
            .select('*')
            .eq('status', 'active')
            .order('route_name'),
          supabase
            .from('transport_vehicle_types')
            .select('*')
            .eq('status', 'active')
            .order('vehicle_name'),
        ]);

        if (routesRes.error) throw routesRes.error;
        if (vehiclesRes.error) throw vehiclesRes.error;

        setRoutes((routesRes.data || []) as TransportRoute[]);
        setVehicleTypes((vehiclesRes.data || []) as TransportVehicleType[]);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load transport data');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const getRate = useCallback(
    async (routeId: string, vehicleTypeId: string): Promise<TransportReferenceRate | null> => {
      try {
        const { data, error: err } = await supabase
          .from('transport_reference_rates')
          .select('*')
          .eq('route_id', routeId)
          .eq('vehicle_type_id', vehicleTypeId)
          .eq('status', 'active')
          .maybeSingle();

        if (err) throw err;
        return (data as TransportReferenceRate) || null;
      } catch {
        return null;
      }
    },
    [],
  );

  return { routes, vehicleTypes, loading, error, getRate };
}
