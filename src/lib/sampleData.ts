import { supabase, isProdMode } from './supabase';
import { addDays, todayStr } from './status';
import type { PilgrimInput, SubAgentInput } from '@/types';

/**
 * Sample data definitions — 10 fictional pilgrims across 3 fictional sub-agents.
 * Dates are computed relative to today (never hard-coded).
 *
 * After loading, dashboard acceptance values:
 *   Total: 10, In Saudi Arabia: 8, Departing in 3 Days: 3,
 *   Overdue: 2, Unconfirmed: 8
 */

interface SamplePilgrimDef {
  key: string;
  full_name: string;
  passport_number: string;
  nationality: string;
  phone_number: string;
  gender: 'male' | 'female';
  arrivalOffset: number | null; // null = not arrived
  expectedDepartureOffset: number; // days from today
  actualDepartureOffset: number | null;
  subAgentKey: string;
}

const subAgents: Record<string, SubAgentInput & { key: string }> = {
  sa1: {
    key: 'SA-SAMPLE-001',
    organisation_name: 'Al-Noor Pilgrim Services',
    contact_person: 'Khalid Rahman',
    country: 'Nigeria',
    email: 'contact@alnoor-services.example',
    phone_number: '+234 700 111 2222',
    active_status: true,
    notes: 'Fictional sample sub-agent.',
  },
  sa2: {
    key: 'SA-SAMPLE-002',
    organisation_name: 'Safa Travels & Tours',
    contact_person: 'Aisha Bello',
    country: 'Ghana',
    email: 'info@safatravels.example',
    phone_number: '+233 200 333 4444',
    active_status: true,
    notes: 'Fictional sample sub-agent.',
  },
  sa3: {
    key: 'SA-SAMPLE-003',
    organisation_name: 'Barakah Pilgrim Care',
    contact_person: 'Yusuf Okafor',
    country: 'Kenya',
    email: 'help@barakahcare.example',
    phone_number: '+254 700 555 6666',
    active_status: true,
    notes: 'Fictional sample sub-agent.',
  },
};

const pilgrimDefs: SamplePilgrimDef[] = [
  {
    key: 'PG-SAMPLE-01',
    full_name: 'Ahmed Ibrahim',
    passport_number: 'PG000001',
    nationality: 'Nigeria',
    phone_number: '+234 801 111 1111',
    gender: 'male',
    arrivalOffset: -10,
    expectedDepartureOffset: 0, // today -> departing_soon
    actualDepartureOffset: null,
    subAgentKey: 'sa1',
  },
  {
    key: 'PG-SAMPLE-02',
    full_name: 'Fatimah Bello',
    passport_number: 'PG000002',
    nationality: 'Nigeria',
    phone_number: '+234 802 222 2222',
    gender: 'female',
    arrivalOffset: -8,
    expectedDepartureOffset: 1, // tomorrow -> departing_soon
    actualDepartureOffset: null,
    subAgentKey: 'sa1',
  },
  {
    key: 'PG-SAMPLE-03',
    full_name: 'Mohammed Sani',
    passport_number: 'PG000003',
    nationality: 'Ghana',
    phone_number: '+233 201 333 3333',
    gender: 'male',
    arrivalOffset: -6,
    expectedDepartureOffset: 3, // +3 days -> departing_soon
    actualDepartureOffset: null,
    subAgentKey: 'sa2',
  },
  {
    key: 'PG-SAMPLE-04',
    full_name: 'Aminah Yusuf',
    passport_number: 'PG000004',
    nationality: 'Ghana',
    phone_number: '+233 202 444 4444',
    gender: 'female',
    arrivalOffset: -15,
    expectedDepartureOffset: -5, // 5 days ago -> overdue
    actualDepartureOffset: null,
    subAgentKey: 'sa2',
  },
  {
    key: 'PG-SAMPLE-05',
    full_name: 'Maryam Adamu',
    passport_number: 'PG000005',
    nationality: 'Kenya',
    phone_number: '+254 701 555 5555',
    gender: 'female',
    arrivalOffset: -20,
    expectedDepartureOffset: -8, // 8 days ago -> overdue
    actualDepartureOffset: null,
    subAgentKey: 'sa3',
  },
  {
    key: 'PG-SAMPLE-06',
    full_name: 'Zainab Mohammed',
    passport_number: 'PG000006',
    nationality: 'Nigeria',
    phone_number: '+234 803 666 6666',
    gender: 'female',
    arrivalOffset: -12,
    expectedDepartureOffset: -1, // expected yesterday
    actualDepartureOffset: -1, // departed yesterday -> departure_confirmed
    subAgentKey: 'sa1',
  },
  {
    key: 'PG-SAMPLE-07',
    full_name: 'Khadijah Lawal',
    passport_number: 'PG000007',
    nationality: 'Kenya',
    phone_number: '+254 702 777 7777',
    gender: 'female',
    arrivalOffset: null, // not arrived
    expectedDepartureOffset: 14, // +14 days -> not_arrived
    actualDepartureOffset: null,
    subAgentKey: 'sa3',
  },
  {
    key: 'PG-SAMPLE-08',
    full_name: 'Omar Aliyu',
    passport_number: 'PG000008',
    nationality: 'Nigeria',
    phone_number: '+234 804 888 8888',
    gender: 'male',
    arrivalOffset: -5,
    expectedDepartureOffset: 7, // +7 days -> in_saudi_arabia
    actualDepartureOffset: null,
    subAgentKey: 'sa1',
  },
  {
    key: 'PG-SAMPLE-09',
    full_name: 'Tariq Bello',
    passport_number: 'PG000009',
    nationality: 'Ghana',
    phone_number: '+233 203 999 9999',
    gender: 'male',
    arrivalOffset: -4,
    expectedDepartureOffset: 10, // +10 days -> in_saudi_arabia
    actualDepartureOffset: null,
    subAgentKey: 'sa2',
  },
  {
    key: 'PG-SAMPLE-10',
    full_name: 'Bilal Okafor',
    passport_number: 'PG000010',
    nationality: 'Kenya',
    phone_number: '+254 703 101 1010',
    gender: 'male',
    arrivalOffset: -3,
    expectedDepartureOffset: 14, // +14 days -> in_saudi_arabia
    actualDepartureOffset: null,
    subAgentKey: 'sa3',
  },
];

/**
 * Load sample data — idempotent.
 * Creates missing fictional sub-agents and pilgrims, updates existing ones,
 * never deletes genuine records.
 */
export async function loadSampleData(
  performedById: string | null,
): Promise<void> {
  if (isProdMode) {
    throw new Error('Sample data tools are unavailable in production mode.');
  }
  const today = todayStr();

  // 1. Upsert sub-agents (match by a stable notes marker since org names are unique enough)
  const subAgentIdMap: Record<string, string> = {};

  for (const def of Object.values(subAgents)) {
    // Check if a sample sub-agent with this organisation name already exists
    const { data: existing } = await supabase
      .from('sub_agents')
      .select('id')
      .eq('organisation_name', def.organisation_name)
      .maybeSingle();

    if (existing) {
      // Update
      await supabase
        .from('sub_agents')
        .update({
          contact_person: def.contact_person,
          country: def.country,
          email: def.email,
          phone_number: def.phone_number,
          active_status: def.active_status,
          notes: def.notes,
          updated_by: performedById,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
      subAgentIdMap[def.key] = existing.id;
    } else {
      // Insert
      const { data: created, error } = await supabase
        .from('sub_agents')
        .insert({
          organisation_name: def.organisation_name,
          contact_person: def.contact_person,
          country: def.country,
          email: def.email,
          phone_number: def.phone_number,
          active_status: def.active_status,
          notes: def.notes,
          is_sample_data: true,
          created_by: performedById,
          updated_by: performedById,
        } as Record<string, unknown>)
        .select('id')
        .single();
      if (error) throw error;
      subAgentIdMap[def.key] = created.id;
    }
  }

  // 2. Upsert pilgrims by passport number
  for (const def of pilgrimDefs) {
    const arrivalDate =
      def.arrivalOffset !== null ? addDays(today, def.arrivalOffset) : null;
    const expectedDeparture = addDays(today, def.expectedDepartureOffset);
    const actualDeparture =
      def.actualDepartureOffset !== null ? addDays(today, def.actualDepartureOffset) : null;

    const input: PilgrimInput = {
      full_name: def.full_name,
      passport_number: def.passport_number,
      nationality: def.nationality,
      phone_number: def.phone_number,
      gender: def.gender,
      sub_agent_id: subAgentIdMap[def.subAgentKey],
      arrival_date: arrivalDate,
      expected_departure_date: expectedDeparture,
      actual_departure_date: actualDeparture,
      is_sample_data: true,
    };

    const { data: existing } = await supabase
      .from('pilgrims')
      .select('id')
      .eq('passport_number', def.passport_number)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('pilgrims')
        .update({
          full_name: input.full_name,
          nationality: input.nationality,
          phone_number: input.phone_number,
          gender: input.gender,
          sub_agent_id: input.sub_agent_id,
          arrival_date: input.arrival_date,
          expected_departure_date: input.expected_departure_date,
          actual_departure_date: input.actual_departure_date,
          is_sample_data: true,
          updated_by: performedById,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    } else {
      await supabase.from('pilgrims').insert({
        ...input,
        created_by: performedById,
        updated_by: performedById,
      } as Record<string, unknown>);
    }
  }
}

/**
 * Reset sample data — deletes only is_sample_data pilgrims, recreates them.
 * Never deletes genuine records. Reuses existing fictional sub-agents.
 */
export async function resetSampleData(
  performedById: string | null,
): Promise<void> {
  if (isProdMode) {
    throw new Error('Sample data tools are unavailable in production mode.');
  }
  // Delete only sample pilgrims
  const { error: delError } = await supabase
    .from('pilgrims')
    .delete()
    .eq('is_sample_data', true);
  if (delError) throw delError;

  // Delete sample sub-agents (they have no pilgrims now since we deleted sample pilgrims;
  // genuine pilgrims referencing them would be SET NULL, but sample sub-agents only had
  // sample pilgrims, so this is safe). Actually — be careful: a genuine pilgrim could be
  // assigned to a sample sub-agent. To be safe, only delete sample sub-agents that have
  // zero pilgrims assigned.
  const { data: sampleAgents } = await supabase
    .from('sub_agents')
    .select('id, organisation_name')
    .eq('is_sample_data', true);

  if (sampleAgents && sampleAgents.length > 0) {
    for (const agent of sampleAgents) {
      const { count } = await supabase
        .from('pilgrims')
        .select('id', { count: 'exact', head: true })
        .eq('sub_agent_id', agent.id);
      if (count === 0) {
        await supabase.from('sub_agents').delete().eq('id', agent.id);
      }
    }
  }

  // Recreate sample data (loadSampleData will recreate sub-agents + pilgrims)
  await loadSampleData(performedById);
}
