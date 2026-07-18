import { httpAction } from "./_generated/server";
import { httpRouter } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { strToBase64, type KlaviyoToken } from "./klaviyo";

// PKCE code verifier/challenge generation (Convex runtime-safe, no Buffer).
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
function bytesToBase64Url(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | (b1 >> 4)];
    if (i + 1 < bytes.length) out += B64[((b1 & 15) << 2) | (b2 >> 6)];
    if (i + 2 < bytes.length) out += B64[b2 & 63];
  }
  return out;
}
function base64URLEncode(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  return bytesToBase64Url(bytes);
}
function randomVerifier(): string {
  const arr = crypto.getRandomValues(new Uint8Array(32));
  return bytesToBase64Url(arr);
}
async function challengeFromVerifier(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64URLEncode(digest);
}

function webUrl(): string {
  return process.env.HIRO_WEB_URL ?? "http://127.0.0.1:3000";
}

// Platform-specific OAuth endpoints. Attentive mirrors Klaviyo's auth-code
// flow; Postscript/Omnisend/Sendlane/Yotpo use API keys (no OAuth needed).
const PLATFORMS: Record<
  string,
  {
    authorize: string;
    token: string;
    label: string;
    clientIdEnv: string;
    clientSecretEnv: string;
    scope: string;
  }
> = {
  klaviyo: {
    authorize: "https://www.klaviyo.com/oauth/authorize",
    token: "https://a.klaviyo.com/oauth/token",
    label: "klaviyo",
    clientIdEnv: "KLAVIYO_CLIENT_ID",
    clientSecretEnv: "KLAVIYO_CLIENT_SECRET",
    scope: "campaigns:read lists:read metrics:read profiles:read",
  },
  attentive: {
    authorize: "https://api.attentive.com/oauth/authorize",
    token: "https://api.attentive.com/oauth/token",
    label: "attentive",
    clientIdEnv: "ATTENTIVE_CLIENT_ID",
    clientSecretEnv: "ATTENTIVE_CLIENT_SECRET",
    scope: "campaigns:read metrics:read",
  },
};

function redirectUri(platform: string): string {
  return `${webUrl()}/api/oauth/${platform}/callback`;
}

function buildStartUrl(
  platform: string,
  redirectUri: string,
  state: string,
  challenge: string,
): string {
  const p = PLATFORMS[platform];
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env[p.clientIdEnv] ?? "",
    redirect_uri: redirectUri,
    scope: p.scope,
    state,
    code_challenge_method: "S256",
    code_challenge: challenge,
  });
  return `${p.authorize}?${params.toString()}`;
}

async function exchangeForPlatform(
  platform: string,
  code: string,
  redirectUri: string,
  verifier: string,
): Promise<KlaviyoToken> {
  const p = PLATFORMS[platform];
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });
  const res = await fetch(p.token, {
    method: "POST",
    headers: {
      Authorization: `Basic ${strToBase64(
        `${process.env[p.clientIdEnv]}:${process.env[p.clientSecretEnv]}`,
      )}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status}`);
  return (await res.json()) as KlaviyoToken;
}

// Step 1: browser hits this, we bounce to the platform authorize with PKCE.
export const oauthStart = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const platform = url.searchParams.get("platform") ?? "klaviyo";
  if (!PLATFORMS[platform])
    return new Response("Unknown platform", { status: 400 });
  const orgId = url.searchParams.get("orgId");
  const userId = url.searchParams.get("userId");
  if (!orgId || !userId) {
    return new Response("Missing orgId/userId", { status: 400 });
  }
  const verifier = randomVerifier();
  const challenge = await challengeFromVerifier(verifier);
  const state = base64URLEncode(crypto.getRandomValues(new Uint8Array(16)).buffer);

  await ctx.runMutation(internal.oauth.storeState, {
    state,
    codeVerifier: verifier,
    orgId: orgId as any,
    userId: userId as any,
  });

  const target = buildStartUrl(
    platform,
    redirectUri(platform),
    state,
    challenge,
  );
  return new Response(null, {
    status: 302,
    headers: { Location: target },
  });
});

// Step 2: platform redirects here with ?code & ?state; exchange + persist.
export const oauthCallback = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const platform = url.pathname.split("/")[3] ?? "klaviyo";
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  if (error) {
    return new Response(`Authorization denied: ${error}`, { status: 400 });
  }
  if (!code || !state) {
    return new Response("Missing code/state", { status: 400 });
  }
  const st = await ctx.runQuery(internal.oauth.getState, { state });
  if (!st) return new Response("Unknown state", { status: 400 });

  let token: KlaviyoToken;
  try {
    token = await exchangeForPlatform(
      platform,
      code,
      redirectUri(platform),
      st.codeVerifier,
    );
  } catch (e: any) {
    return new Response(`Token exchange failed: ${e.message}`, { status: 500 });
  }

  await ctx.runMutation(internal.oauth.finalizeKlaviyo, {
    state,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresIn: token.expires_in,
    platform: platform as "klaviyo" | "attentive",
  });

  return new Response(null, {
    status: 302,
    headers: { Location: `${webUrl()}/dashboard/sources?connected=${platform}` },
  });
});

const http = httpRouter();
http.route({ path: "/oauth/klaviyo/start", method: "GET", handler: oauthStart });
http.route({ path: "/oauth/klaviyo/callback", method: "GET", handler: oauthCallback });
http.route({ path: "/oauth/attentive/start", method: "GET", handler: oauthStart });
http.route({ path: "/oauth/attentive/callback", method: "GET", handler: oauthCallback });

export default http;
