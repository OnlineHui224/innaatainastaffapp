# Office register sync — deployment and secret setup

The `visa-contract-sheet-sync` Edge Function writes confirmed Visa & Contract
records into the company's existing Google Sheet. It is implemented but **not
deployed**, and it refuses to run until its two secrets exist.

The office register is a live business document with years of real cases in it.
Nothing below should be done in a hurry, and section 4 — the read-only preflight
— should be run before the first write, not after.

**Do not paste the service account JSON into a chat, an issue, or a pull
request.** It contains a private key. It lives in exactly one place: Supabase
Edge Function secrets.

---

## 1. Create the service account

Google Cloud console → **IAM & Admin → Service Accounts → Create**.

- No project roles are needed. The account's access to the spreadsheet comes
  from sharing the file with it, not from a Google Cloud role.
- **Keys → Add key → JSON.** Download it once; Google will not show it again.

Then enable the **Google Sheets API** for that project (APIs & Services →
Library → Google Sheets API → Enable).

## 2. Share the spreadsheet with it

Open the office register in Google Sheets → **Share** → paste the service
account's `client_email` (it ends in `.iam.gserviceaccount.com`) → give it
**Editor**.

Editor is the minimum that permits writing rows. Nothing less will work, and
nothing more is needed — the account cannot reach any other file in the company
Drive, because access is granted per file.

## 3. Set the secrets

| Secret | Value | Required |
|---|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON_B64` | The downloaded JSON, base64-encoded | **Yes** — the function returns `not_configured` without it |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | The id from the sheet's URL | **Yes** |

The spreadsheet id is the long segment between `/d/` and `/edit`:

```
https://docs.google.com/spreadsheets/d/<THIS PART>/edit#gid=0
```

Encode the JSON and set both secrets from your own terminal:

```bash
base64 -w0 service-account.json          # copy the single line it prints
supabase secrets set GOOGLE_SERVICE_ACCOUNT_JSON_B64=...
supabase secrets set GOOGLE_SHEETS_SPREADSHEET_ID=...
```

Then delete the downloaded JSON from your machine.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the platform. Do
not set them by hand.

## 4. Preflight before the first live write

The function has a read-only mode that reports how the register currently stores
its dates. Run it once, on a real month tab, before anything is written.

```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/visa-contract-sheet-sync" \
  -H "Authorization: Bearer <a staff session token>" \
  -H "Content-Type: application/json" \
  -d '{"recordId":"<any confirmed record in that month>","mode":"preflight"}'
```

It writes nothing. It returns a small sample of columns A–G rendered as
`UNFORMATTED_VALUE`, which is what makes the answer unambiguous:

- a **number** (e.g. `46256`) means the cell holds a real date value;
- a **string** (e.g. `"21/08/2026"`) means the cell holds text that merely looks
  like a date.

The function writes dates as ISO `YYYY-MM-DD` with `valueInputOption=USER_ENTERED`,
so Sheets parses them into real date values regardless of the workbook's locale.
If the preflight shows the historical cells are **text**, stop and decide
deliberately: new rows would then sort and filter differently from old ones. That
is a business decision about the register, not a code change to make quietly.

## 5. Deploy

```bash
supabase functions deploy visa-contract-sheet-sync
```

Migration `019_visa_contract_records.sql` must be applied first — the function
writes the `spreadsheet_*`, `last_synced_at` and `sync_error` columns it adds.

---

## What the function will and will not do

**Row identity is developer metadata**, keyed `hajjerp_record_id` and holding the
HajjERP record's UUID, at `DOCUMENT` visibility. It is invisible in the grid: no
column is added and no header is changed. Metadata travels with its row, so the
link survives staff inserting or deleting rows above it — which a stored row
number does not.

Resolution order, on every sync:

1. Search developer metadata for this record's id. Exactly one hit → that row is
   authoritative and is updated, **even if the visa or passport number has since
   been corrected**. Ownership was established before the identifiers changed.
2. No metadata → scan the month tab by normalised VISA NUMBER + PASSPORT NUMBER.
   Exactly one match → adopt that row, update it, and attach the metadata. No
   new row is appended.
3. Neither → append once, learn where it landed, attach the metadata immediately.
4. More than one candidate at either step → **refuse**. The record goes
   `SYNC_FAILED` with a message naming the duplicate to resolve. Overwriting the
   wrong row in a live register is worse than waiting for a person.

**The month tab comes from the planned departure date only**, spelled as the
workbook spells it — `SEPT`, not `SEP`. The record's own logging date fills the
`DATE` cell and nothing else.

**A missing month tab is not created.** The record stays `REVIEWED_CONFIRMED`,
its sync status becomes `SYNC_PENDING`, and the officer is told which tab the
office must create. `Sheet1` is never a target.

**`ARRIVAL DATE` is the legacy office-register return date.** It is not, and must
not become, actual arrival into Saudi Arabia — that remains exclusively with the
Journey Timeline and staff movement confirmation.

**Nothing is back-filled.** Records confirmed before this function existed are
`NOT_SYNCED` and stay that way until a person sends them, from the "Awaiting
office register" panel in the Visa & Contract Logger.

**A Google failure never touches the liability record.** The function writes only
`spreadsheet_sync_status`, `spreadsheet_id`, `spreadsheet_tab`,
`spreadsheet_row_ref`, `last_synced_at`, `sync_error` and `updated_by` — the
patch builders in `syncState.ts` refuse anything else — so no outcome at Google
can change `record_status` or `pilgrim_match_status`.

**The browser sends `{ recordId }` and nothing else.** The spreadsheet id, tab,
row, resulting status and timestamp are all derived server-side, and migration
019's trigger restores those columns for any non-server writer regardless.

## Rotating the key

Create a new key on the same service account, set
`GOOGLE_SERVICE_ACCOUNT_JSON_B64` to the new value, redeploy, then delete the old
key in the Google Cloud console. The spreadsheet share does not change, because
it is granted to the account rather than to the key.
