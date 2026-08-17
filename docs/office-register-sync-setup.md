# Office register sync — deployment order

The `visa-contract-sheet-sync` Edge Function writes confirmed Visa & Contract
records into the company's existing Google Sheet.

The office register is a live business document with years of real cases in it.
The order below is the safe order, and steps 4–7 exist so that the first row this
system ever writes is inspected by a person before anything is automated.

---

## Current state

| | Status |
|---|---|
| **1. Migration `019_visa_contract_records.sql`** | **Already applied in production.** Do not apply, recreate or replace it. |
| **2. Secrets** (`GOOGLE_SERVICE_ACCOUNT_JSON_B64`, `GOOGLE_SHEETS_SPREADSHEET_ID`) | **Already configured in production.** See "Rotating the key" if either ever needs replacing. |
| **3. Edge Function** | Not deployed. This is the next step. |
| **8. M2 frontend** (automatic post-confirmation sync) | Not published. Last step, after the controlled first write has been verified. |

---

## 3. Deploy the Edge Function only

```bash
supabase functions deploy visa-contract-sheet-sync
```

Nothing calls it yet: the frontend that triggers synchronisation automatically is
not published until step 8. Deploying now is what makes steps 4–6 possible.

## 4. Run the read-only preflight

The function has a mode that only reads. It performs **no database write, no audit
entry and no Google write** — including when the departure date or the month tab is
missing, where it reports the finding rather than recording an operational
outcome.

```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/visa-contract-sheet-sync" \
  -H "Authorization: Bearer <a staff session token>" \
  -H "Content-Type: application/json" \
  -d '{"recordId":"<a confirmed record in the month you want to inspect>","mode":"preflight"}'
```

## 5. Inspect the preflight result

It returns:

| Field | What it tells you |
|---|---|
| `locale`, `timeZone` | The workbook's own settings. **This matters:** `USER_ENTERED` parses values by the same rules as typing into the Sheets UI, so it follows this locale. It is *not* locale-independent. |
| `expectedTab`, `resolvedTab`, `tabExists` | The month derived from the planned departure date, and whether the workbook has that tab. |
| `range`, `sample` | Columns A–G of the first few rows, rendered `UNFORMATTED_VALUE`. |
| `dateColumns` | Per-column verdict for `DATE`, `DEPARTURE DATE` and `ARRIVAL DATE`, plus the header actually found there. |

Read `dateColumns[n].verdict`:

- **`date_values`** — the register holds real dates. Our rows will sort and filter
  alongside the existing ones. Proceed.
- **`text`** — the historical cells are date-shaped *strings*. A row written as a
  real date value would then sort and filter differently from every row above it.
  **Stop and decide deliberately.** That is a business decision about the
  register, not a code change to make quietly.
- **`mixed`** — the column already contains both. Worth understanding before
  adding to it.
- **`no_data`** — nothing in the sample. Sample a populated month instead.

Also check `actualHeader` against `expectedHeader`. A mismatch means the twelve-column
mapping needs checking before anything is written.

## 6. Perform ONE controlled live sync

Pick a single record deliberately — ideally a recent one whose row you can find by
eye — and sync only that one:

```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/visa-contract-sheet-sync" \
  -H "Authorization: Bearer <a staff session token>" \
  -H "Content-Type: application/json" \
  -d '{"recordId":"<the one record you chose>"}'
```

The response reports `status`, `tab` and `rowRef`.

## 7. Verify that row in the spreadsheet

Before automating anything, check the row by hand:

1. **Position** — it was appended at the bottom of the month tab, and no existing
   row moved or changed.
2. **Values** — all twelve columns line up with their headers, including the legacy
   `ARIVAL PORT` spelling and, for a direct client, `Inna-Ataina` in `AGENT NAME`.
3. **Date types** — click `DATE`, `DEPARTURE DATE` and `ARRIVAL DATE`. Each should
   be a real date, matching how the rows above it behave, and the day and month
   must not be transposed.
4. **Developer metadata** — re-run the same sync request. It must report the *same*
   `rowRef` and must not add a second row. That is the proof the row was tagged.

If anything is wrong, stop here. Nothing else has been enabled yet, and one row is
easy to correct by hand.

## 8. Only then publish the M2 frontend

Publishing the frontend is what enables automatic synchronisation after
confirmation, and the "Sync now" / "Retry Sync" actions for staff. Do it after
step 7 passes, not before.

---

## What the function will and will not do

**Row identity is developer metadata**, keyed `hajjerp_record_id` and holding the
HajjERP record's UUID, at `DOCUMENT` visibility. It is invisible in the grid: no
column is added and no header is changed. Metadata travels with its row, so the
link survives staff inserting or deleting rows above it — which a stored row
number does not.

Resolution order, on every sync:

1. Search developer metadata for this record's id **across the whole workbook**.
   Exactly one hit **on the target month's tab** → that row is authoritative and is
   updated, *even if the visa or passport number has since been corrected*.
   Ownership was established before the identifiers changed.
2. Exactly one hit **on a different tab** → **refuse**. This is the case where a
   confirmed departure date has been corrected into another month. The function
   neither appends here nor writes there; the record goes `SYNC_FAILED` with a
   message naming both months. Moving a row between tabs is deliberately not
   automated in M2 — safety over guessing.
3. More than one hit anywhere in the workbook → **refuse**, and write nothing to
   Google.
4. No metadata → scan the month tab by normalised VISA NUMBER + PASSPORT NUMBER.
   Exactly one match → adopt that row, update it, and attach the metadata. No new
   row is appended.
5. Neither → append once, learn where it landed, attach the metadata immediately.
6. More than one business match → **refuse**.

Every refusal is audited with a `conflict` kind — `cross_month_ownership`,
`duplicate_metadata` or `duplicate_business_identity` — because each needs a
different action from the office.

**The month tab comes from the planned departure date only**, spelled as the
workbook spells it — `SEPT`, not `SEP`. The record's own logging date fills the
`DATE` cell and nothing else.

**A missing month tab is not created.** The record stays `REVIEWED_CONFIRMED`, its
sync status becomes `SYNC_PENDING`, and the officer is told which tab the office
must create. `Sheet1` is never a target.

**`ARRIVAL DATE` is the legacy office-register return date.** It is not, and must
not become, actual arrival into Saudi Arabia — that remains exclusively with the
Journey Timeline and staff movement confirmation.

**A direct company client is written as `Inna-Ataina`** in `AGENT NAME`, matching
the register's established convention. The HajjERP screen label "Inna Ataina
(direct client)" is deliberately *not* used here: the register is filtered and
reported on by agent name, and a second spelling would split one responsibility
group in two.

**Existing records are never back-filled.** Once step 8 is published, newly
confirmed records attempt synchronisation automatically. Nothing already in the
register is sent by a deployment, migration or background job — those wait in the
"Awaiting office register" panel until a person uses Sync now or Retry Sync.

**A Google failure never touches the liability record.** The function writes only
`spreadsheet_sync_status`, `spreadsheet_id`, `spreadsheet_tab`,
`spreadsheet_row_ref`, `last_synced_at`, `sync_error` and `updated_by` — the patch
builders in `syncState.ts` refuse anything else — so no outcome at Google can
change `record_status` or `pilgrim_match_status`.

**The browser sends `{ recordId }` and nothing else.** The spreadsheet id, tab,
row, resulting status and timestamp are all derived server-side, and migration
019's trigger restores those columns for any non-server writer regardless.

---

## Rotating the key

Create a new key on the same service account, set
`GOOGLE_SERVICE_ACCOUNT_JSON_B64` to the new base64-encoded JSON, redeploy, then
delete the old key in the Google Cloud console. The spreadsheet share does not
change, because it is granted to the account rather than to the key.

**Do not paste the service account JSON into a chat, an issue, or a pull request.**
It contains a private key. It belongs in Supabase Edge Function secrets and
nowhere else.

```bash
base64 -w0 service-account.json          # copy the single line it prints
supabase secrets set GOOGLE_SERVICE_ACCOUNT_JSON_B64=...
```

Then delete the downloaded JSON from your machine.

If the service account itself is ever recreated, it needs `Editor` on the
spreadsheet (Share → paste its `client_email`, which ends in
`.iam.gserviceaccount.com`). Editor is the minimum that permits writing rows;
access is per file, so the account can reach nothing else in the company Drive.
