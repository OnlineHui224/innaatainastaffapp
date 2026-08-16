# Personal Gemini — M1.0 scope probe results

**Branch:** `claude/hajjerp-ops-ui-expansion-9l9jl4`
**Starting commit:** `992c9f4` (M0 preflight)
**Status:** Probe built and pre-consent findings recorded. **The consent-gated
phases have not been run** — they require a human browser sign-in with a real
Google Workspace account. See "What is still outstanding".

Companion documents:
[`docs/personal-gemini-m0-preflight.md`](./personal-gemini-m0-preflight.md) ·
[`scripts/personal-gemini-scope-probe/README.md`](../scripts/personal-gemini-scope-probe/README.md)

---

## Why the phases could not be run here

The probe needs three things this environment does not have and must not
fabricate: a Google Workspace user session in a real browser, a disposable OAuth
client (client ID + secret), and a Google Cloud project ID.

OAuth consent is deliberately un-automatable — that is the point of it. So the
deliverable for M1.0 is the probe plus a setup checklist, and the phases run on
the product owner's machine where the browser and the credentials already are.

Network egress was checked and is **not** the obstacle: `accounts.google.com`,
`oauth2.googleapis.com`, `generativelanguage.googleapis.com` and
`serviceusage.googleapis.com` are all reachable from here. The blocker is solely
the human consent step.

---

## Findings obtained without any credential

These came from unauthenticated probes of the live service. They cost nothing,
sent no data, and are reproducible with `curl`. They are **empirical**, not
documentation claims.

### F1 — The Gemini Developer API accepts OAuth 2 bearer authentication

`POST https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent`
with `Authorization: Bearer <invalid>` returns:

```
HTTP 401
status  : UNAUTHENTICATED
reason  : ACCESS_TOKEN_TYPE_UNSUPPORTED
method  : google.ai.generativelanguage.v1beta.GenerativeService.GenerateContent
message : Request had invalid authentication credentials.
          Expected OAuth 2 access token, login cookie or other valid
          authentication credential.
```

The service says it **expected an OAuth 2 access token**. It rejected the token
because it was fabricated, not because the auth mode is unsupported.

**Control that makes this meaningful:** the same endpoint called with `?key=FAKEKEY`
and no bearer returns a *different* error — `INVALID_ARGUMENT`, *"API key not
valid"*. The endpoint discriminates between the two auth modes and has a distinct
code path for each. OAuth is not a fallback that only ever wants a key.

**This materially de-risks R2 from the M0 report**, which flagged the possibility
that Developer-API generation might be API-key-only in practice. It is not.

### F2 — `x-goog-user-project` is not rejected at the header layer

The header was present on the F1 request and did not produce a 400 or any
header-level complaint; the request proceeded to authentication.

**This is weak evidence and must not be overstated.** A control run with the
header *omitted* produced the identical 401, so this shows only that the header
is accepted, **not** that it is honoured for quota attribution. Proving that
needs a real token, and it is exactly what phases A–C exist to settle.

### F3 — The 401 says nothing about the model ID

A control with a deliberately nonsense model (`definitely-not-a-model`) returned
the **same** `UNAUTHENTICATED` 401. Authentication is evaluated before model
resolution, so no unauthenticated probe can confirm `gemini-3.6-flash` is
routable. Documentation remains the only source for that (F5).

### F4 — The Interactions API path, corrected

My first guess, `models/<model>:generateInteraction`, returns **404**. The real
path is:

```
POST https://generativelanguage.googleapis.com/v1beta/interactions
{ "model": "...", "input": [ ... ] }
```

which returns **401 UNAUTHENTICATED** with method
`google.learning.gemini.api.interactions.v1beta.InteractionsService.CreateInteractionHttp`.
So this surface exists and also accepts OAuth bearer.

Two implementation details found the same way, both now handled in the probe:
its error body is wrapped in a **single-element JSON array**, and the OAuth token
endpoint uses the RFC 6749 error shape (`{"error":"invalid_client",
"error_description":"…"}`) rather than the API frontend's
`{"error":{"status","message"}}`. Parsing only the latter silently blanked
`redirect_uri_mismatch` and `invalid_client` — the two errors a first-time setup
is most likely to hit.

### F5 — Documentation re-check

| Item | Finding | Grade |
|---|---|---|
| Auth endpoint | `https://accounts.google.com/o/oauth2/v2/auth` | VERIFIED |
| Token endpoint | `https://oauth2.googleapis.com/token` | VERIFIED |
| Revoke endpoint | `https://oauth2.googleapis.com/revoke`; revoking an access token also revokes its refresh token | VERIFIED |
| Gemini OAuth scopes | Official quickstart uses `cloud-platform` **and** `generative-language.retriever` **together** | VERIFIED |
| Which scope alone suffices for `generateContent` | Not stated in retrievable form | **UNVERIFIED — this is what the probe settles** |
| `x-goog-user-project` | Sets the quota project; needs `serviceusage.services.use` | VERIFIED |
| Service Usage Consumer | `roles/serviceusage.serviceUsageConsumer` contains that permission | VERIFIED |
| Generative Language API | Must be enabled on the project | VERIFIED |
| `gemini-3.6-flash` | Stable, production-ready specific model ID; lower price and better token efficiency than 3.5 Flash | VERIFIED |
| `gemini-3.7-flash` | Exists and is the current "latest model"; 3.6 remains stable and is the pinned probe default | VERIFIED |
| Interactions API | GA since June 2026 and recommended for new projects; `generateContent` "remains fully supported" | VERIFIED |

Direct page fetches to `ai.google.dev`, `developers.google.com`,
`docs.cloud.google.com` and `supabase.com` remain **blocked by the egress
proxy**. Everything above came from domain-restricted search of those same
official domains, which is one step weaker than reading the page. The M0 grading
convention is unchanged.

---

## What is still outstanding

| Phase | Scopes | Status |
|---|---|---|
| A | `openid email generative-language.retriever` | **NOT RUN** — needs consent |
| B | `openid email cloud-platform` | NOT RUN — only if A fails |
| C | both | NOT RUN — only if A and B fail |
| Negative quota-project test | — | NOT RUN — only after a phase passes |

The probe is written, exercised against the live service, and ready. Run
instructions: [`scripts/personal-gemini-scope-probe/README.md`](../scripts/personal-gemini-scope-probe/README.md).

---

## Probe verification performed

Without any real credential, the following paths were exercised end to end:

- Missing-configuration guard → clear message naming each absent variable, exit 1.
- Invalid `PROBE_PHASE` → rejected, exit 1.
- Authorization URL construction → correct endpoint, PKCE `S256`, 43-character
  `state`, `access_type=offline`, `prompt=consent`.
- **CSRF state mismatch → rejected, nothing exchanged, fails closed.**
- Real token exchange against `oauth2.googleapis.com` → 401 handled and reported
  as `invalid_client / "The OAuth client was not found."`
- **Leak check** → a planted authorization code and a planted client secret were
  both confirmed absent from the full terminal output.
- Cleanup runs in `finally`, so revocation is attempted even on failure.

Repository health after the change: lint **11 warnings, 0 errors** (unchanged
baseline), production build green.

---

## Safety confirmations

- No SQL executed. No migration created. No Supabase object created. Vault not
  enabled.
- No HajjERP source file touched: `PersonalGeminiContext`, `VisaLoggerPage`,
  `UploadVisaCard`, `FlightDocumentOpsPage`, `AuthContext`, permissions/RBAC all
  unmodified.
- No Edge Function deployed. Nothing published or merged. PR #1 untouched.
- No token, refresh token, authorization code or client secret was created,
  stored, printed or committed. No real OAuth client exists yet.
- No traveller PII sent anywhere. The probe's only prompt is
  `"Reply with exactly the word OK and nothing else."`
- `.env.local` is gitignored at the repository root (`*.local`) and again by a
  local rule in the probe directory.
