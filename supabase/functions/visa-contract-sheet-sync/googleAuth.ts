/**
 * SERVICE-ACCOUNT AUTHENTICATION
 * ==============================
 *
 * A signed JWT is exchanged for a Google access token. No staff Google account
 * is involved, and nothing here reaches the browser.
 *
 * The private key exists only inside this module's local variables. It is never
 * returned, never logged, and never included in an error — a thrown fetch error
 * can carry its own request, so failures are narrowed to a code before anything
 * is written out.
 */

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

/** The minimum that permits editing a spreadsheet. Read-only is insufficient. */
export const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

export class GoogleAuthError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'GoogleAuthError';
    this.code = code;
  }
}

function base64UrlFromBytes(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64Url(input: string): string {
  return base64UrlFromBytes(new TextEncoder().encode(input));
}

/** Parses the base64-encoded service account JSON held in the environment. */
export function parseServiceAccount(base64Json: string): ServiceAccount {
  let decoded: string;
  try {
    decoded = atob(base64Json.trim());
  } catch {
    throw new GoogleAuthError('bad_credentials', 'The service account credential is not valid.');
  }
  let parsed: Partial<ServiceAccount>;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    throw new GoogleAuthError('bad_credentials', 'The service account credential is not valid.');
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new GoogleAuthError('bad_credentials', 'The service account credential is incomplete.');
  }
  return { client_email: parsed.client_email, private_key: parsed.private_key };
}

/** PEM (PKCS#8) to the raw DER bytes WebCrypto wants. */
function pemToDer(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '');
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function signAssertion(account: ServiceAccount, scope: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64Url(
    JSON.stringify({
      iss: account.client_email,
      scope,
      aud: TOKEN_ENDPOINT,
      iat: now,
      /* An hour is Google's maximum. Short-lived by construction. */
      exp: now + 3600,
    }),
  );
  const signingInput = `${header}.${claims}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(account.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64UrlFromBytes(new Uint8Array(signature))}`;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}
let cached: CachedToken | null = null;

/**
 * A Google access token for the Sheets scope.
 *
 * Cached in module scope until shortly before expiry, so a burst of
 * synchronisations does not mint a token each time. Edge Function instances are
 * ephemeral, so this is a per-instance optimisation and nothing more.
 */
export async function getAccessToken(base64Json: string, now = Date.now()): Promise<string> {
  if (cached && cached.expiresAt > now + 60_000) return cached.token;

  const account = parseServiceAccount(base64Json);
  const assertion = await signAssertion(account, SHEETS_SCOPE);

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!response.ok) {
    /* The body may echo the assertion, which is a signed credential, so it is
       neither forwarded nor logged. */
    throw new GoogleAuthError(
      'token_exchange_failed',
      'The office register could not be reached. Check the service account configuration.',
    );
  }

  const payload = await response.json();
  if (!payload?.access_token) {
    throw new GoogleAuthError('token_exchange_failed', 'The office register could not be reached.');
  }

  cached = {
    token: payload.access_token,
    expiresAt: now + Math.max(0, Number(payload.expires_in ?? 3600)) * 1000,
  };
  return cached.token;
}

/** Testing seam — clears the per-instance token cache. */
export function resetTokenCache(): void {
  cached = null;
}
