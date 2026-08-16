# Personal Gemini — M1.0 scope probe

**Disposable feasibility tooling. Not production code. Nothing here is imported
by the HajjERP application.**

This probe answers one question and then its job is done:

> What is the **least-privileged** OAuth scope set that lets a Google Workspace
> user's bearer access token call the Gemini Developer API with
> `x-goog-user-project` pointed at that user's own Google Cloud project?

Background and the architecture this feeds into:
[`docs/personal-gemini-m0-preflight.md`](../../docs/personal-gemini-m0-preflight.md).

---

## Why you have to run this, and I can't

The OAuth consent step needs a human signing in to a real Google Workspace
account in a real browser. That cannot be automated, delegated, or done from an
agent container. So the script opens a loopback listener on **your** machine and
waits for **your** browser to come back with the authorization code.

It also means no credential ever has to travel anywhere. The client secret stays
in a gitignored file on your disk. I never see it, and it never needs to be
pasted into a chat.

---

## What it will and will not do

**It will:** complete one OAuth authorization, exchange the code for a token,
make one tiny text-only Gemini call (`"Reply with exactly the word OK"`), try one
deliberately invalid quota project to prove there is no silent fallback, then
revoke the authorization.

**It will not:** write to any database, create any Supabase object, touch any
HajjERP source file, store any token, print any token, send any document, or send
any traveller data. No visa, no passport, no PII of any kind.

**Cost:** a handful of tokens. Effectively zero.

---

## Setup checklist

Roughly 15 minutes, once. **Everything here happens in a throwaway project — do
not use a production Google Cloud project.**

### 1 — Create a disposable Cloud project

1. Open <https://console.cloud.google.com>.
2. Create a new project, e.g. **`hajjerp-gemini-probe`**.
3. Note its **Project ID** — the hyphenated one under the project name, *not*
   the display name and *not* the 12-digit number. This is what goes in
   `PROBE_PROJECT_ID`.

### 2 — Enable the Gemini API on it

4. **APIs & Services → Library** → search **"Generative Language API"** →
   **Enable**.

That is the only API to enable. Do not enable anything else.

### 3 — Check the test user's permission on the project

5. **IAM & Admin → IAM**. The Workspace account you will sign in with needs to be
   able to use this project for quota. If they created the project they are Owner
   and already can.
6. If they are not the owner, grant them **Service Usage Consumer**
   (`roles/serviceusage.serviceUsageConsumer`) — this is the role containing the
   `serviceusage.services.use` permission that `x-goog-user-project` requires.
   **Grant nothing broader.**

### 4 — Create the OAuth consent screen

7. **APIs & Services → OAuth consent screen**.
8. Choose **Internal**. The company has Google Workspace, so this is available,
   and it is what the eventual production app will use: no Google review, no
   "unverified app" warning, and scopes are not listed on the consent screen.
9. Fill in app name (e.g. "HajjERP scope probe"), support email, developer
   contact. Nothing else matters for a probe.

### 5 — Create the OAuth client

10. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
11. Application type: **Web application**. Name: "HajjERP probe".
12. Under **Authorised redirect URIs**, add exactly:

    ```
    http://localhost:8787/callback
    ```

    Character for character — no trailing slash, and `http` not `https`
    (Google permits plain http for `localhost` specifically).

    > If the console refuses this URI, stop and tell me — that is itself a
    > finding, and the fallback is a Desktop-app client type.

13. Google shows a **Client ID** and a **Client secret**. Keep the tab open for
    the next step, then close it. You will not need them again.

### 6 — Put the values on your machine

```bash
git fetch origin claude/hajjerp-ops-ui-expansion-9l9jl4
git checkout claude/hajjerp-ops-ui-expansion-9l9jl4
cd scripts/personal-gemini-scope-probe
cp .env.local.example .env.local
```

Open `.env.local` in an editor and fill in `GOOGLE_OAUTH_CLIENT_ID`,
`GOOGLE_OAUTH_CLIENT_SECRET` and `PROBE_PROJECT_ID`.

`.env.local` is gitignored. **Do not commit it. Do not paste its contents
anywhere — not into a chat, not into an issue, not into a pull request.** The
client secret belongs in exactly one place: that file, on your machine.

---

## Running it

Requires Node 18 or newer (this repo's toolchain is well past that). No
`npm install` — the script has no dependencies.

### Phase A — the narrow scope. Start here.

```bash
node probe.mjs
```

Requests `openid email generative-language.retriever`. **No `cloud-platform`.**

A browser URL is printed. Open it, sign in as the test Workspace user, approve.
The browser lands on a local page saying it worked; the terminal takes over from
there.

### Phase B — only if A failed on scope

```bash
PROBE_PHASE=B node probe.mjs
```

Requests `openid email cloud-platform`.

### Phase C — only if both A and B failed

```bash
PROBE_PHASE=C node probe.mjs
```

Requests both Gemini and cloud-platform scopes.

**Stop at the first phase that passes.** The point is to find the minimum, not to
collect a full matrix. A phase that passes is the answer.

---

## What to send back

Copy the whole terminal output. It is safe to share by construction: every
provider response passes through a redaction filter before printing, and tokens,
codes and secrets are never printed in the first place. The block that matters:

```
  Phase              : A
  Scopes             : openid email https://www.googleapis.com/auth/generative-language.retriever
  OAuth              : PASS
  Gemini call        : FAIL (403 PERMISSION_DENIED)
  x-goog-user-project: NOT ESTABLISHED
  Negative test      : NOT RUN
  VERDICT            : FAIL
```

If a phase fails, the exact HTTP status and Google error message are printed
above that block. Those are the diagnostic — send them too.

---

## Reading the result

| Outcome | Meaning | Decision |
|---|---|---|
| Phase A passes | The narrow Gemini scope authorises real generation with per-user quota | **Decision A** — narrowest possible consent |
| A fails, B passes | `cloud-platform` is genuinely required | **Decision B** — documented and justified, not convenience |
| A and B fail, C passes | Google expects the documented pair | **Decision C** |
| All fail | Per-staff quota attribution does not work as designed | **Decision STOP** — the Personal Project model needs rethinking |

**The negative test matters as much as the positive one.** If a deliberately
invalid quota project still returns 200, then `x-goog-user-project` is not being
enforced, per-staff attribution is an illusion, and the "no company fallback"
guarantee cannot be honoured. That would be a Decision STOP outcome even if every
phase otherwise passed.

---

## If every phase fails

Read the error before concluding the architecture is wrong — most failures here
are setup, not feasibility:

| Error | Almost certainly |
|---|---|
| `403 SERVICE_DISABLED` | Step 2 not done — Generative Language API not enabled |
| `403 PERMISSION_DENIED` mentioning `serviceusage.services.use` | Step 6 — the user lacks Service Usage Consumer |
| `403` mentioning consumer / project | Project ID wrong — check you used the ID, not the number or name |
| `400 API_KEY_INVALID` or "API key not valid" | Meaningful: this surface may not accept OAuth bearer at all |
| `401 UNAUTHENTICATED` | Token or scope problem — the phase result is genuine |
| `404` on the model | Model ID wrong or unavailable to this project — try `PROBE_MODEL` |
| `redirect_uri_mismatch` at consent | Step 12 — the registered URI does not match byte for byte |

The last one worth trying before giving up:

```bash
PROBE_API=interactions node probe.mjs
```

Google now describes the **Interactions API** (`POST /v1beta/interactions`) as
the recommended surface for new projects, with `generateContent` kept as a
supported legacy surface. Both were confirmed to accept OAuth bearer
authentication. If `generateContent` rejects your real token but Interactions
accepts it, that is a design input for M3, not a failure of the architecture.

---

## Cleanup

The script revokes its own authorization on exit, including on failure.

When the probe has served its purpose:

1. Delete the OAuth client in the Cloud Console (Credentials → the probe client
   → delete).
2. Delete `.env.local`.
3. Optionally delete the disposable Cloud project.
4. This whole directory is deleted when M1.0 is signed off. It is disposable by
   design and must never become production integration code.
