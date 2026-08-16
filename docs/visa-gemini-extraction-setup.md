# Visa AI extraction — deployment and secret setup

The `visa-gemini-extract` Edge Function is implemented but **not deployed**, and
it will refuse to run until the company Gemini key is available to it. This is
what has to happen once, by hand.

**Do not paste any key into a chat, an issue, or a pull request.** The key lives
in exactly one place: Supabase Edge Function secrets.

---

## 1. Set the secrets

Supabase dashboard → **Edge Functions → Secrets** (or the CLI shown below).

| Secret | Value | Required |
|---|---|---|
| `GEMINI_API_KEY` | The company Gemini API key | **Yes** — the function returns `not_configured` without it |
| `GEMINI_MODEL` | `gemini-2.5-flash` | No — this is already the built-in default |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the platform. Do
not set them by hand.

Via the CLI instead of the dashboard:

```bash
supabase secrets set GEMINI_API_KEY=...      # paste the real key at your terminal
```

`GEMINI_MODEL` only needs setting if you want something other than
`gemini-2.5-flash`.

**Why 2.5 Flash:** parity with the existing OPS PRO extractor, which already
reads these documents in production on this model, through the same REST
endpoint and the same `x-goog-api-key` header. Matching it for the first HajjERP
deployment means that if extraction misbehaves, it is a migration problem and
not a model change — the two are not being varied at once.

Newer models can be trialled later by setting `GEMINI_MODEL` alone, with no code
change. Keep whatever you set a pinned stable model ID — never a `-preview`,
`-exp` or moving `-latest` alias, so an extraction prompt validated against one
model cannot silently change under a system handling passport data. The browser
never chooses the model; only this secret does.

## 2. Deploy

```bash
supabase functions deploy visa-gemini-extract
```

`verify_jwt` stays at the platform default of `true`, so the gateway rejects a
request with no JWT before the handler runs. That is not the real control: the
anon key is itself a valid JWT, so the function independently resolves the
caller with `auth.getUser()` and checks their profile. Both layers are in place.

## 3. Confirm it works

In HajjERP: Visa & Contract Logger → complete the operational details → upload a
visa → **Extract visa information**.

| What you see | What it means |
|---|---|
| Fields populated, `0 of 4 reviewed` | Working. Review each value against the document. |
| "AI extraction is not configured yet" | `GEMINI_API_KEY` is missing or the function is not deployed. |
| "AI extraction is not available right now" | The key was rejected, or the model is unavailable to that project. Check the function logs for `provider_status`. |
| "AI usage is temporarily unavailable" | Quota exhausted (HTTP 429). Manual entry still works. |

## 4. Before sending real documents

Until the Gemini project is confirmed on the **paid tier**, test with a synthetic
document only. Free-tier terms differ on how submitted content may be used, and a
real pilgrim's passport and visa number should not be the thing that discovers
the difference.

Once the project is on the paid tier, this restriction lifts.

---

## What the function does with a document

One request, one response, discarded. The document is held in memory for the
duration of a single call and is never written to Supabase Storage, to the
database, or to the Gemini Files API. Only the four identity values come back.

Logs record the caller's user id, MIME type, byte size, model, outcome code,
provider status and duration — never the document, the base64, the extracted
identity, or the API key.

## Costs

One extraction is one Gemini request against the company project. There is no
per-staff quota and no automatic billing. If the project runs out of quota, every
officer sees the manual-entry fallback rather than a failure.
