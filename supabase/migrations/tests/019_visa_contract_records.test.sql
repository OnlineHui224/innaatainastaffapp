/*
# Migration 019 — database guard tests

Runs against a throwaway PostgreSQL instance, NOT against any HajjERP database.

    supabase/migrations/tests/run-019-tests.sh

These exercise the guards that must hold even when the browser is hostile:
a client calling PostgREST directly must not be able to confirm a visa it has
not reviewed, forge spreadsheet synchronisation, rewrite provenance, or delete a
Sub-Agent that still carries visa liability.

Every check raises on failure, so a non-zero exit means a guard is missing.
*/

\set ON_ERROR_STOP on
-- NOTICE is how each check reports PASS, so it must not be filtered out.
SET client_min_messages TO NOTICE;
\t on
\pset format unaligned

CREATE OR REPLACE FUNCTION assert(condition boolean, label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF condition THEN
    RAISE NOTICE '  PASS  %', label;
  ELSE
    RAISE EXCEPTION '  FAIL  %', label;
  END IF;
END $$;

/** Runs a statement and reports whether it raised. */
CREATE OR REPLACE FUNCTION raises(stmt text)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE stmt;
  RETURN false;
EXCEPTION WHEN others THEN
  RETURN true;
END $$;

/** Review evidence for all four fields, attributed to one officer. */
CREATE OR REPLACE FUNCTION full_review(reviewer uuid DEFAULT '11111111-2222-3333-4444-555555555555')
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('fields', jsonb_object_agg(key, jsonb_build_object(
    'reviewed', true,
    'reviewed_by', reviewer::text,
    'reviewed_at', '2026-08-17T10:00:00Z',
    'final_value', 'x'
  )))
  FROM unnest(ARRAY['passengerName','passportNumber','visaNumber','nationality']) AS key;
$$;

/** A complete identity, so review-evidence checks are tested in isolation. */
CREATE OR REPLACE FUNCTION set_identity(target uuid) RETURNS void LANGUAGE sql AS $$
  UPDATE visa_contract_records
  SET traveller_name = 'Zainab T. Muhammad', passport_number = 'A01234567',
      visa_number = 'V-55512', nationality = 'Nigerian'
  WHERE id = target;
$$;

-- ── Fixtures ────────────────────────────────────────────────────────────────
INSERT INTO profiles (id, full_name, email, role, is_active)
VALUES ('11111111-2222-3333-4444-555555555555', 'QA Officer', 'qa@example.test', 'operations_staff', true);

INSERT INTO profiles (id, full_name, email, role, is_active)
VALUES ('22222222-3333-4444-5555-666666666666', 'Another Officer', 'other@example.test', 'operations_staff', true);

INSERT INTO sub_agents (id, organisation_name, contact_person)
VALUES ('7c9e6679-7425-40de-944b-e07fc1f90ae7', 'Some Agent Ltd', 'A Person');

\echo ''
\echo '=== RESPONSIBILITY INTEGRITY ==='

SELECT assert(raises($$
  INSERT INTO visa_contract_records (client_source, sub_agent_id, entry_source, client_case_key)
  VALUES ('sub_agent', NULL, 'GEMINI', gen_random_uuid())
$$), 'a sub-agent client with no Sub-Agent is refused');

SELECT assert(raises($$
  INSERT INTO visa_contract_records (client_source, sub_agent_id, entry_source, client_case_key)
  VALUES ('direct', '7c9e6679-7425-40de-944b-e07fc1f90ae7', 'GEMINI', gen_random_uuid())
$$), 'a direct client carrying a Sub-Agent is refused');

INSERT INTO visa_contract_records (id, client_source, sub_agent_id, entry_source, client_case_key)
VALUES ('aaaaaaaa-0000-4000-8000-00000000000a', 'sub_agent',
        '7c9e6679-7425-40de-944b-e07fc1f90ae7', 'GEMINI',
        '0f8fad5b-d9cb-469f-a165-70867728950e');
SELECT assert(true, 'a consistent sub-agent record is accepted');

INSERT INTO visa_contract_records (id, client_source, sub_agent_id, entry_source, client_case_key)
VALUES ('aaaaaaaa-0000-4000-8000-00000000000d', 'direct', NULL, 'MANUAL', gen_random_uuid());
SELECT assert(true, 'a consistent direct-client record is accepted');

\echo ''
\echo '=== A. SUB-AGENT HISTORICAL ACCOUNTABILITY ==='

SELECT assert(
  (SELECT confdeltype FROM pg_constraint
   WHERE conrelid = 'visa_contract_records'::regclass
     AND confrelid = 'sub_agents'::regclass) = 'r',
  'the sub_agent_id foreign key is declared ON DELETE RESTRICT');

SELECT assert(raises($$
  DELETE FROM sub_agents WHERE id = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
$$), 'a Sub-Agent holding visa liability cannot be deleted');

SELECT assert(
  (SELECT count(*) FROM visa_contract_records
   WHERE sub_agent_id = '7c9e6679-7425-40de-944b-e07fc1f90ae7') = 1,
  'the historical responsibility link survived the attempted delete');

UPDATE sub_agents SET active_status = false
WHERE id = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
SELECT assert(
  (SELECT NOT active_status FROM sub_agents
   WHERE id = '7c9e6679-7425-40de-944b-e07fc1f90ae7'),
  'deactivating a Sub-Agent is still available as the intended mechanism');

\echo ''
\echo '=== B. CONFIRMATION REQUIRES FOUR REVIEWED FIELDS ==='

SELECT assert(NOT visa_contract_review_complete('{}'::jsonb),
  'empty metadata is not review evidence');
SELECT assert(NOT visa_contract_review_complete(
  '{"fields":{"passengerName":{"reviewed":true},"passportNumber":{"reviewed":true},"visaNumber":{"reviewed":true},"nationality":{"reviewed":true}}}'::jsonb),
  'a reviewed flag with no reviewer or time is not evidence');
SELECT assert(visa_contract_review_complete(full_review()),
  'all four reviewed, with reviewer and time, is evidence');

SELECT assert(raises($$
  UPDATE visa_contract_records SET record_status = 'REVIEWED_CONFIRMED', updated_by = NULL
  WHERE id = 'aaaaaaaa-0000-4000-8000-00000000000a'
$$), 'a browser cannot confirm a record with no review evidence');

-- Three of four is still not four.
SELECT assert(raises(format($$
  UPDATE visa_contract_records
  SET record_status = 'REVIEWED_CONFIRMED', extraction_metadata = %L
  WHERE id = 'aaaaaaaa-0000-4000-8000-00000000000a'
$$, (SELECT jsonb_set(full_review(), '{fields,nationality,reviewed}', 'false'))::text)),
  'three reviewed fields out of four is still refused');

SELECT assert(
  (SELECT record_status FROM visa_contract_records
   WHERE id = 'aaaaaaaa-0000-4000-8000-00000000000a') = 'PENDING_REVIEW',
  'the record stayed PENDING_REVIEW after every refused attempt');

\echo ''
\echo '=== B2. BLANK IDENTITY CANNOT BE CONFIRMED ==='
-- Review evidence is present and correct; the values are not. A record with a
-- blank passport number is not a usable liability record.

SELECT assert(raises(format($$
  UPDATE visa_contract_records
  SET record_status = 'REVIEWED_CONFIRMED', extraction_metadata = %L,
      updated_by = '11111111-2222-3333-4444-555555555555'
  WHERE id = 'aaaaaaaa-0000-4000-8000-00000000000a'
$$, full_review()::text)), 'a fully reviewed but EMPTY identity cannot be confirmed');

SELECT set_identity('aaaaaaaa-0000-4000-8000-00000000000a');

UPDATE visa_contract_records SET passport_number = '   '
WHERE id = 'aaaaaaaa-0000-4000-8000-00000000000a';
SELECT assert(raises(format($$
  UPDATE visa_contract_records
  SET record_status = 'REVIEWED_CONFIRMED', extraction_metadata = %L,
      updated_by = '11111111-2222-3333-4444-555555555555'
  WHERE id = 'aaaaaaaa-0000-4000-8000-00000000000a'
$$, full_review()::text)), 'a whitespace-only passport number cannot be confirmed');

UPDATE visa_contract_records SET passport_number = 'A01234567'
WHERE id = 'aaaaaaaa-0000-4000-8000-00000000000a';
UPDATE visa_contract_records SET nationality = NULL
WHERE id = 'aaaaaaaa-0000-4000-8000-00000000000a';
SELECT assert(raises(format($$
  UPDATE visa_contract_records
  SET record_status = 'REVIEWED_CONFIRMED', extraction_metadata = %L,
      updated_by = '11111111-2222-3333-4444-555555555555'
  WHERE id = 'aaaaaaaa-0000-4000-8000-00000000000a'
$$, full_review()::text)), 'a null nationality cannot be confirmed');
SELECT set_identity('aaaaaaaa-0000-4000-8000-00000000000a');

\echo ''
\echo '=== B3. REVIEWER ATTRIBUTION MUST MATCH THE CONFIRMING OFFICER ==='
-- RLS already forces updated_by = auth.uid(), so this ties the review evidence
-- to the live session instead of accepting somebody else's id as the reviewer.

SELECT assert(NOT visa_contract_reviewer_matches(full_review(), '22222222-3333-4444-5555-666666666666'),
  'evidence naming another officer does not match this actor');
SELECT assert(NOT visa_contract_reviewer_matches(full_review(), NULL),
  'a NULL actor can attribute nothing');
SELECT assert(visa_contract_reviewer_matches(full_review(), '11111111-2222-3333-4444-555555555555'),
  'evidence naming the actor matches');

SET ROLE authenticated;
SELECT assert(raises(format($$
  UPDATE visa_contract_records
  SET record_status = 'REVIEWED_CONFIRMED', extraction_metadata = %L,
      updated_by = '11111111-2222-3333-4444-555555555555'
  WHERE id = 'aaaaaaaa-0000-4000-8000-00000000000a'
$$, full_review('22222222-3333-4444-5555-666666666666')::text)),
  'a confirmation whose reviewer differs from updated_by is refused');

SELECT assert(raises(format($$
  UPDATE visa_contract_records
  SET record_status = 'REVIEWED_CONFIRMED', extraction_metadata = %L,
      updated_by = NULL
  WHERE id = 'aaaaaaaa-0000-4000-8000-00000000000a'
$$, full_review()::text)), 'a confirmation with no actor at all is refused');

SELECT assert(raises(format($$
  UPDATE visa_contract_records
  SET record_status = 'REVIEWED_CONFIRMED', extraction_metadata = %L,
      updated_by = '11111111-2222-3333-4444-555555555555'
  WHERE id = 'aaaaaaaa-0000-4000-8000-00000000000a'
$$, (SELECT jsonb_set(full_review(), '{fields,visaNumber,reviewed_by}',
        to_jsonb('22222222-3333-4444-5555-666666666666'::text)))::text)),
  'even ONE field reviewed by somebody else is refused');
RESET ROLE;

SELECT assert(
  (SELECT record_status FROM visa_contract_records
   WHERE id = 'aaaaaaaa-0000-4000-8000-00000000000a') = 'PENDING_REVIEW',
  'the record stayed PENDING_REVIEW through every attribution attempt');

\echo ''
\echo '=== C. CONFIRMATION SUCCEEDS WITH FOUR REVIEWED FIELDS ==='

SET ROLE authenticated;
UPDATE visa_contract_records
SET record_status = 'REVIEWED_CONFIRMED', extraction_metadata = full_review(),
    updated_by = '11111111-2222-3333-4444-555555555555'
WHERE id = 'aaaaaaaa-0000-4000-8000-00000000000a';
RESET ROLE;

SELECT assert(
  (SELECT record_status FROM visa_contract_records
   WHERE id = 'aaaaaaaa-0000-4000-8000-00000000000a') = 'REVIEWED_CONFIRMED',
  'a fully reviewed record confirms');

SELECT assert(
  (SELECT pilgrim_match_status FROM visa_contract_records
   WHERE id = 'aaaaaaaa-0000-4000-8000-00000000000a') = 'PENDING_PILGRIM_MATCH',
  'confirmation does NOT require a linked pilgrim');

SELECT assert(raises($$
  UPDATE visa_contract_records SET pilgrim_match_status = 'MATCHED'
  WHERE id = 'aaaaaaaa-0000-4000-8000-00000000000a'
$$), 'MATCHED without a pilgrim id is refused');

SELECT assert(raises($$
  INSERT INTO visa_contract_records (client_source, sub_agent_id, entry_source, client_case_key, record_status)
  VALUES ('direct', NULL, 'MANUAL', gen_random_uuid(), 'REVIEWED_CONFIRMED')
$$), 'a record cannot be created already confirmed without evidence');

\echo ''
\echo '=== D. SPREADSHEET PROVENANCE CANNOT BE FORGED ==='
-- `authenticated` is the role PostgREST switches to for a browser request.

SET ROLE authenticated;
UPDATE visa_contract_records
SET spreadsheet_sync_status = 'SYNCED',
    spreadsheet_id  = 'forged-sheet',
    spreadsheet_tab = 'AUG',
    spreadsheet_row_ref = '42',
    last_synced_at = now()
WHERE id = 'aaaaaaaa-0000-4000-8000-00000000000a';
RESET ROLE;

SELECT assert(
  (SELECT spreadsheet_sync_status FROM visa_contract_records
   WHERE id = 'aaaaaaaa-0000-4000-8000-00000000000a') = 'NOT_SYNCED',
  'an authenticated browser cannot set SYNCED');
SELECT assert(
  (SELECT spreadsheet_id IS NULL AND spreadsheet_tab IS NULL
      AND spreadsheet_row_ref IS NULL AND last_synced_at IS NULL
   FROM visa_contract_records WHERE id = 'aaaaaaaa-0000-4000-8000-00000000000a'),
  'no spreadsheet identity can be forged from the browser');

-- The server, however, must still be able to record a real sync in M2.
UPDATE visa_contract_records
SET spreadsheet_sync_status = 'SYNCED', spreadsheet_tab = 'AUG', last_synced_at = now()
WHERE id = 'aaaaaaaa-0000-4000-8000-00000000000a';
SELECT assert(
  (SELECT spreadsheet_sync_status = 'SYNCED' AND spreadsheet_tab = 'AUG'
   FROM visa_contract_records WHERE id = 'aaaaaaaa-0000-4000-8000-00000000000a'),
  'the server role can still record a genuine sync');

\echo ''
\echo '=== NORMAL STAFF WORKFLOW STILL WORKS ==='

SET ROLE authenticated;
UPDATE visa_contract_records
SET traveller_name = 'Zainab T. Muhammad', passport_number = 'A01234567',
    visa_number = 'V-55512', nationality = 'Nigerian'
WHERE id = 'aaaaaaaa-0000-4000-8000-00000000000d';
UPDATE visa_contract_records
SET record_status = 'REVIEWED_CONFIRMED', extraction_metadata = full_review(),
    updated_by = '11111111-2222-3333-4444-555555555555'
WHERE id = 'aaaaaaaa-0000-4000-8000-00000000000d';
RESET ROLE;

SELECT assert(
  (SELECT record_status = 'REVIEWED_CONFIRMED' AND traveller_name = 'Zainab T. Muhammad'
   FROM visa_contract_records WHERE id = 'aaaaaaaa-0000-4000-8000-00000000000d'),
  'operational staff can still review and confirm normally');

INSERT INTO pilgrims (id, full_name, passport_number, nationality, expected_departure_date)
VALUES ('bbbbbbbb-0000-4000-8000-00000000000b', 'Zainab T. Muhammad', 'A01234567', 'Nigerian', '2026-09-20');

SET ROLE authenticated;
UPDATE visa_contract_records
SET pilgrim_id = 'bbbbbbbb-0000-4000-8000-00000000000b', pilgrim_match_status = 'MATCHED'
WHERE id = 'aaaaaaaa-0000-4000-8000-00000000000d';
RESET ROLE;

SELECT assert(
  (SELECT pilgrim_match_status = 'MATCHED'
   FROM visa_contract_records WHERE id = 'aaaaaaaa-0000-4000-8000-00000000000d'),
  'operational staff can still link a pilgrim');

\echo ''
\echo '=== PROVENANCE IS IMMUTABLE ==='

SET ROLE authenticated;
UPDATE visa_contract_records
SET entry_source = 'GEMINI',
    created_by = NULL,
    client_case_key = gen_random_uuid(),
    record_date = '2000-01-01'
WHERE id = 'aaaaaaaa-0000-4000-8000-00000000000d';
RESET ROLE;

SELECT assert(
  (SELECT entry_source = 'MANUAL' AND record_date <> '2000-01-01'
     AND client_case_key IS NOT NULL
   FROM visa_contract_records WHERE id = 'aaaaaaaa-0000-4000-8000-00000000000d'),
  'entry_source, record_date and client_case_key survive a rewrite attempt');

\echo ''
\echo '=== IDEMPOTENCY KEY ==='

SELECT assert(raises($$
  INSERT INTO visa_contract_records (client_source, sub_agent_id, entry_source, client_case_key)
  VALUES ('sub_agent', '7c9e6679-7425-40de-944b-e07fc1f90ae7', 'GEMINI',
          '0f8fad5b-d9cb-469f-a165-70867728950e')
$$), 'a duplicate client_case_key is refused, so one case is one record');

\echo ''
\echo 'All migration 019 guard tests passed.'
