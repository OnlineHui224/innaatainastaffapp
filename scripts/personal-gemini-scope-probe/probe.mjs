#!/usr/bin/env node
/**
 * PERSONAL GEMINI — M1.0 DISPOSABLE OAUTH / QUOTA SCOPE PROBE
 * ===========================================================
 *
 * WHAT THIS IS
 * ------------
 * A throwaway feasibility probe. It answers exactly one question:
 *
 *   What is the LEAST-PRIVILEGED OAuth scope set that lets a Google Workspace
 *   user's bearer access token call the Gemini Developer API with
 *   `x-goog-user-project` pointed at that user's own Google Cloud project?
 *
 * It is NOT production code, and nothing here should ever be imported by the
 * HajjERP application. It writes no database row, creates no Supabase object,
 * touches no HajjERP source file, and persists no credential.
 *
 * WHY IT RUNS ON YOUR MACHINE, NOT IN CI OR AN AGENT CONTAINER
 * ------------------------------------------------------------
 * The OAuth consent step requires a human to sign in to a real Google Workspace
 * account in a real browser. That cannot be automated or delegated, so this
 * script opens a loopback listener on YOUR machine and waits for YOUR browser
 * to come back with the authorization code.
 *
 * SECRET HANDLING — the whole point of the design
 * -----------------------------------------------
 *   - The client secret is read from the environment. It is never a literal
 *     here, never printed, and never written to any file.
 *   - Access, refresh and ID tokens exist only in local variables. They are
 *     never printed, never written to disk, and are revoked at the end.
 *   - The authorization code is never printed.
 *   - Every provider response body passes through redact() before it can reach
 *     the console, so a surprise token-shaped string in an error payload cannot
 *     leak into your terminal scrollback.
 *
 * The only things this script prints are: HTTP statuses, Google error codes and
 * messages, granted scope names, and PASS/FAIL. All of those are safe to paste
 * into a report.
 *
 * USAGE
 * -----
 *   cd scripts/personal-gemini-scope-probe
 *   cp .env.local.example .env.local     # then fill it in — it is gitignored
 *   node probe.mjs                       # defaults to PROBE_PHASE=A
 *
 * See README.md for the Google Cloud Console setup this depends on.
 */

import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/* ── Endpoints. Every one of these is from official Google documentation and is
      recorded in docs/personal-gemini-m0-preflight.md §1.1. ───────────────── */
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';
const GEMINI_HOST = 'https://generativelanguage.googleapis.com';

/* ── Scope sets under test. Phases exist so we can find the MINIMUM that works
      rather than shipping the broadest set that happens to succeed. ───────── */
const IDENTITY_SCOPES = ['openid', 'email'];
const RETRIEVER_SCOPE = 'https://www.googleapis.com/auth/generative-language.retriever';
const CLOUD_PLATFORM_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

const PHASES = {
  A: [...IDENTITY_SCOPES, RETRIEVER_SCOPE],
  B: [...IDENTITY_SCOPES, CLOUD_PLATFORM_SCOPE],
  C: [...IDENTITY_SCOPES, RETRIEVER_SCOPE, CLOUD_PLATFORM_SCOPE],
};

/* ─────────────────────────── configuration ──────────────────────────────── */

/**
 * Loads `.env.local` if present, without adding a dotenv dependency.
 *
 * Values already in the real environment win, so you can override a single
 * setting for one run without editing the file.
 */
function loadEnvLocal() {
  let raw;
  try {
    raw = readFileSync(join(HERE, '.env.local'), 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const PROJECT_ID = process.env.PROBE_PROJECT_ID;
const PORT = Number(process.env.PROBE_PORT || 8787);
const REDIRECT_URI = process.env.PROBE_REDIRECT_URI || `http://localhost:${PORT}/callback`;
const PHASE = (process.env.PROBE_PHASE || 'A').toUpperCase();

/* Verified stable at the time of writing (M0 §1.7, re-confirmed for M1.0).
   Deliberately a pinned specific ID — never a moving "latest" alias, never a
   preview or experimental model. */
const MODEL = process.env.PROBE_MODEL || 'gemini-3.6-flash';

/* generateContent is what the M0 design specifies and what this probe tests by
   default. Google now also offers the Interactions API and describes it as the
   recommended surface for new projects, so `PROBE_API=interactions` runs the
   same authorization test against that endpoint instead. Same scopes, same
   quota header — only the request shape differs. */
const API_SURFACE = (process.env.PROBE_API || 'generatecontent').toLowerCase();

const RUN_NEGATIVE_TEST = process.env.PROBE_NEGATIVE !== '0';

/* ──────────────────────────── output safety ─────────────────────────────── */

/**
 * Scrubs anything token-shaped from text before it can be printed.
 *
 * Google's error bodies do not normally echo credentials, but "normally" is not
 * a guarantee worth betting a leaked refresh token on, and terminal scrollback
 * outlives the process.
 */
function redact(text) {
  if (typeof text !== 'string') text = String(text);
  let out = text
    .replace(/ya29\.[\w.-]+/g, '[REDACTED_ACCESS_TOKEN]')
    .replace(/1\/\/[\w.-]{20,}/g, '[REDACTED_REFRESH_TOKEN]')
    .replace(/4\/[\w-]{20,}/g, '[REDACTED_AUTH_CODE]')
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[REDACTED_JWT]');
  /* Guarded rather than given a fallback pattern: an empty or whitespace
     fallback would match everywhere and shred the output. */
  if (CLIENT_SECRET) {
    out = out.replace(new RegExp(escapeRegex(CLIENT_SECRET), 'g'), '[REDACTED_CLIENT_SECRET]');
  }
  return out;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const log = (...args) => console.log(...args.map((a) => redact(a)));

/**
 * Prints a bounded slice of a provider error body, redacted.
 *
 * Google uses two different error shapes and we hit both. The OAuth token and
 * revoke endpoints speak RFC 6749 — `{"error":"invalid_client",
 * "error_description":"..."}` — while the API frontend returns
 * `{"error":{"status":"PERMISSION_DENIED","message":"..."}}`. Handling only the
 * latter silently swallows `redirect_uri_mismatch` and `invalid_client`, which
 * are precisely the errors a first-time setup hits.
 */
function reportProviderError(status, bodyText) {
  let category = 'unknown';
  let message = '';
  try {
    let parsed = JSON.parse(bodyText);
    /* The Interactions endpoint wraps its error in a single-element array.
       Verified against a live 401 from /v1beta/interactions. */
    if (Array.isArray(parsed)) parsed = parsed[0] ?? {};
    if (typeof parsed?.error === 'string') {
      category = parsed.error;
      message = parsed.error_description || '';
    } else {
      category = parsed?.error?.status || parsed?.error?.code || String(status);
      message = parsed?.error?.message || '';
    }
  } catch {
    message = bodyText.slice(0, 400);
  }
  log(`      HTTP status : ${status}`);
  log(`      error code  : ${category}`);
  log(`      message     : ${message.slice(0, 500)}`);
  return { status, category, message: redact(message).slice(0, 500) };
}

/* ──────────────────────────── preflight checks ──────────────────────────── */

function requireConfig() {
  const missing = [];
  if (!CLIENT_ID) missing.push('GOOGLE_OAUTH_CLIENT_ID');
  if (!CLIENT_SECRET) missing.push('GOOGLE_OAUTH_CLIENT_SECRET');
  if (!PROJECT_ID) missing.push('PROBE_PROJECT_ID');
  if (missing.length) {
    console.error('\nMissing required configuration:\n');
    for (const key of missing) console.error(`  - ${key}`);
    console.error('\nCopy .env.local.example to .env.local and fill it in.');
    console.error('See README.md for where each value comes from.\n');
    process.exit(1);
  }
  if (!PHASES[PHASE]) {
    console.error(`\nPROBE_PHASE must be A, B or C (got: ${PHASE})\n`);
    process.exit(1);
  }
}

/* ────────────────────────────── OAuth flow ──────────────────────────────── */

function base64url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Runs the authorization-code leg and returns the code.
 *
 * PKCE is used even though this is a confidential client with a secret. It costs
 * nothing at the same endpoints and it means the code alone is useless to anyone
 * who intercepts the loopback redirect.
 */
async function authorize(scopes) {
  const state = base64url(randomBytes(32));
  const verifier = base64url(randomBytes(64)); // 86 chars — inside Google's 43–128 bound
  const challenge = base64url(createHash('sha256').update(verifier).digest());

  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', scopes.join(' '));
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  /* Forces a refresh token even on a repeat run. Google returns a refresh token
     only on the FIRST authorization otherwise, which would make phase B look
     different from phase A for reasons unrelated to scopes. */
  url.searchParams.set('prompt', 'consent');

  log('\n  Open this URL in a browser signed in as the test Workspace user:\n');
  log(`  ${url.toString()}\n`);
  log(`  Waiting for the redirect to ${REDIRECT_URI} …`);

  const code = await waitForCallback(state);
  return { code, verifier };
}

function waitForCallback(expectedState) {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const requested = new URL(req.url, `http://localhost:${PORT}`);
      if (requested.pathname !== new URL(REDIRECT_URI).pathname) {
        res.writeHead(404).end('Not found');
        return;
      }

      const error = requested.searchParams.get('error');
      const code = requested.searchParams.get('code');
      const state = requested.searchParams.get('state');

      const done = (message, ok) => {
        res.writeHead(ok ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(
          `<!doctype html><meta charset="utf-8"><title>HajjERP scope probe</title>` +
            `<body style="font-family:system-ui;padding:3rem;max-width:36rem">` +
            `<h1 style="font-size:1.1rem">${ok ? 'Authorization received' : 'Authorization failed'}</h1>` +
            `<p style="color:#475569">${message}</p>` +
            `<p style="color:#475569">You can close this tab and return to the terminal.</p>`,
        );
        server.close();
      };

      if (error) {
        done(`Google returned: ${error}`, false);
        reject(new Error(`consent_error:${error}`));
        return;
      }
      /* The state check is the whole CSRF defence, and it is the same check the
         production design puts in the Edge Function. Failing closed here keeps
         the probe honest about what production will have to do. */
      if (!state || state !== expectedState) {
        done('State parameter did not match. Nothing was exchanged.', false);
        reject(new Error('state_mismatch'));
        return;
      }
      if (!code) {
        done('No authorization code was present.', false);
        reject(new Error('no_code'));
        return;
      }
      done('Returning to the probe. The code is being exchanged server-side.', true);
      resolve(code);
    });

    server.on('error', reject);
    server.listen(PORT, '127.0.0.1');

    setTimeout(() => {
      server.close();
      reject(new Error('callback_timeout'));
    }, 5 * 60 * 1000).unref();
  });
}

async function exchangeCode(code, verifier) {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code,
    code_verifier: verifier,
    grant_type: 'authorization_code',
    redirect_uri: REDIRECT_URI,
  });

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    log('\n  ✗ Token exchange failed.');
    reportProviderError(res.status, text);
    throw new Error('token_exchange_failed');
  }
  const json = JSON.parse(text);
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    /* Scope names are not secrets, and seeing what Google ACTUALLY granted —
       as opposed to what we asked for — is a real result of this probe. */
    grantedScopes: (json.scope || '').split(' ').filter(Boolean),
    expiresIn: json.expires_in,
    hasIdToken: Boolean(json.id_token),
  };
}

async function revoke(token, label) {
  if (!token) return false;
  try {
    const res = await fetch(REVOKE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
    });
    log(`  revoke ${label}: HTTP ${res.status}`);
    return res.ok;
  } catch (e) {
    log(`  revoke ${label}: failed (${e.message})`);
    return false;
  }
}

/* ─────────────────────────── the Gemini request ─────────────────────────── */

/**
 * The smallest useful call: a few tokens in, one word out.
 *
 * Deliberately text-only. No visa document, no passport image, no traveller PII
 * of any kind is sent — this probe is about authorization, not extraction.
 */
function buildGeminiRequest(projectId, accessToken) {
  const prompt = 'Reply with exactly the word OK and nothing else.';

  if (API_SURFACE === 'interactions') {
    /* Path and request shape confirmed empirically against the live service: an
       unauthenticated POST here reaches
       `InteractionsService.CreateInteractionHttp` and returns 401 rather than
       404, whereas `models/<model>:generateInteraction` returns 404. */
    return {
      url: `${GEMINI_HOST}/v1beta/interactions`,
      body: { model: MODEL, input: [{ role: 'user', parts: [{ text: prompt }] }] },
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'x-goog-user-project': projectId,
        'Content-Type': 'application/json',
      },
    };
  }

  return {
    url: `${GEMINI_HOST}/v1beta/models/${MODEL}:generateContent`,
    body: {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 8, temperature: 0 },
    },
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'x-goog-user-project': projectId,
      'Content-Type': 'application/json',
    },
  };
}

/**
 * One Gemini call under a named quota project.
 *
 * Note what is absent from the request: there is no `key=` query parameter and
 * no `x-goog-api-key` header anywhere in this file. If the call succeeds it
 * succeeded on the bearer token, because there is no API key available to fall
 * back to.
 */
async function callGemini(accessToken, projectId, label) {
  const { url, body, headers } = buildGeminiRequest(projectId, accessToken);

  log(`\n  → ${label}`);
  log(`      endpoint : ${url}`);
  log(`      quota project : ${projectId}`);
  log(`      auth : Bearer <access token, not printed>`);
  log(`      api key : none present in this request`);

  const started = Date.now();
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await res.text();
  const ms = Date.now() - started;

  if (!res.ok) {
    log(`  ✗ rejected in ${ms} ms`);
    const detail = reportProviderError(res.status, text);
    return { ok: false, ...detail };
  }

  let answer = '';
  try {
    let parsed = JSON.parse(text);
    if (Array.isArray(parsed)) parsed = parsed[0] ?? {};
    answer =
      parsed?.candidates?.[0]?.content?.parts?.[0]?.text ??
      parsed?.output?.[0]?.parts?.[0]?.text ??
      '';
  } catch {
    /* A 200 with an unparseable body is still an authorization success, which is
       all this probe is measuring. */
  }
  log(`  ✓ accepted in ${ms} ms — HTTP ${res.status}, model replied: ${JSON.stringify(answer.trim())}`);
  return { ok: true, status: res.status, answer: answer.trim() };
}

/* ──────────────────────────────── main ──────────────────────────────────── */

async function main() {
  requireConfig();
  const scopes = PHASES[PHASE];

  log('\n══════════════════════════════════════════════════════════════');
  log('  HajjERP — Personal Gemini M1.0 scope probe');
  log('══════════════════════════════════════════════════════════════');
  log(`  phase          : ${PHASE}`);
  log(`  scopes         : ${scopes.join(' ')}`);
  log(`  quota project  : ${PROJECT_ID}`);
  log(`  model          : ${MODEL}`);
  log(`  api surface    : ${API_SURFACE}`);
  log(`  redirect uri   : ${REDIRECT_URI}`);
  log('──────────────────────────────────────────────────────────────');

  let accessToken = null;
  let refreshToken = null;
  const result = {
    phase: PHASE,
    scopes,
    oauth: 'NOT RUN',
    generateContent: 'NOT RUN',
    quotaProject: 'NOT RUN',
    negative: 'NOT RUN',
    verdict: 'FAIL',
  };

  try {
    log('\n[1/4] OAuth authorization');
    const { code, verifier } = await authorize(scopes);

    log('\n[2/4] Token exchange');
    const tokens = await exchangeCode(code, verifier);
    accessToken = tokens.accessToken;
    refreshToken = tokens.refreshToken;
    result.oauth = 'PASS';
    log(`  ✓ access token obtained (expires in ${tokens.expiresIn}s) — value not printed`);
    log(`  ✓ refresh token returned : ${refreshToken ? 'yes' : 'no'} — value not printed`);
    log(`  ✓ id token returned      : ${tokens.hasIdToken ? 'yes' : 'no'}`);
    log(`  ✓ scopes actually granted: ${tokens.grantedScopes.join(' ') || '(none reported)'}`);

    if (tokens.grantedScopes.length && !scopesCover(tokens.grantedScopes, scopes)) {
      log('  ! Google granted a different scope set than requested — recorded above.');
    }

    log('\n[3/4] Gemini request under the staff quota project');
    const primary = await callGemini(accessToken, PROJECT_ID, `phase ${PHASE} — real project`);
    result.generateContent = primary.ok ? 'PASS' : `FAIL (${primary.status} ${primary.category})`;
    result.quotaProject = primary.ok ? 'ACCEPTED' : 'NOT ESTABLISHED';
    result.verdict = primary.ok ? 'PASS' : 'FAIL';

    log('\n[4/4] Negative quota-project test');
    if (!primary.ok) {
      log('  skipped — the positive case did not pass, so this would prove nothing.');
    } else if (!RUN_NEGATIVE_TEST) {
      log('  skipped — PROBE_NEGATIVE=0.');
    } else {
      /* Proves the "no silent company fallback" assumption is real: a bogus
         quota project must FAIL rather than quietly bill somewhere else. */
      const bogus = `hajjerp-nonexistent-${base64url(randomBytes(6)).toLowerCase().replace(/[^a-z0-9]/g, '')}`;
      const negative = await callGemini(accessToken, bogus, 'negative — invalid project');
      if (negative.ok) {
        result.negative = 'FAIL — request SUCCEEDED with an invalid quota project';
        log('\n  ✗ IMPORTANT: the call succeeded despite an invalid quota project.');
        log('    That means x-goog-user-project was not enforced, and per-staff');
        log('    quota attribution cannot be relied upon as designed.');
      } else {
        result.negative = `PASS — rejected (${negative.status} ${negative.category})`;
        log('\n  ✓ invalid quota project correctly rejected — no silent fallback.');
      }
    }
  } catch (e) {
    log(`\n  ✗ Probe stopped: ${e.message}`);
    if (result.oauth === 'NOT RUN') result.oauth = `FAIL (${e.message})`;
  } finally {
    log('\n[cleanup] Revoking the disposable authorization');
    /* Revoking the refresh token also revokes its access tokens. Revoke both
       where present so nothing outlives this run. */
    await revoke(refreshToken, 'refresh token');
    await revoke(accessToken, 'access token');
    accessToken = null;
    refreshToken = null;
  }

  log('\n══════════════════════════════════════════════════════════════');
  log('  RESULT');
  log('══════════════════════════════════════════════════════════════');
  log(`  Phase              : ${result.phase}`);
  log(`  Scopes             : ${result.scopes.join(' ')}`);
  log(`  OAuth              : ${result.oauth}`);
  log(`  Gemini call        : ${result.generateContent}`);
  log(`  x-goog-user-project: ${result.quotaProject}`);
  log(`  Negative test      : ${result.negative}`);
  log(`  VERDICT            : ${result.verdict}`);
  log('══════════════════════════════════════════════════════════════');
  log('\n  Nothing was persisted. No token, code or secret was printed.');
  if (result.verdict === 'PASS') {
    log(`  Phase ${PHASE} is sufficient. Do NOT test broader scopes — this is the answer.\n`);
  } else if (PHASE === 'A') {
    log('  Next: re-run with PROBE_PHASE=B (openid email cloud-platform).\n');
  } else if (PHASE === 'B') {
    log('  Next: re-run with PROBE_PHASE=C only if official docs indicate both are needed.\n');
  } else {
    log('  All three phases exhausted — see README.md §"If every phase fails".\n');
  }

  process.exit(result.verdict === 'PASS' ? 0 : 1);
}

function scopesCover(granted, requested) {
  const set = new Set(granted);
  return requested.every((s) => set.has(s) || (s === 'email' && set.has('https://www.googleapis.com/auth/userinfo.email')));
}

main();
