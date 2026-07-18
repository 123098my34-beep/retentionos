// Argon2id password hashing (RFC 9106) via @noble/hashes (pure JS, runs in
// the Convex runtime with no native deps). Kept in its own module so it has
// no Convex/runtime imports and can be unit-tested directly.
//
// Stored string is self-describing:  argon2id$t=m,p=,m=kb$saltB64$hashB64
// so verification is parameter-independent and migration-safe.
import { argon2id } from "@noble/hashes/argon2";
import { randomBytes } from "@noble/hashes/utils";

const ARGON_T = 2; // time cost (iterations)
const ARGON_M = 19456; // memory cost (~19 MB)
const ARGON_P = 1; // parallelism

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = argon2id(new TextEncoder().encode(password), salt, {
    t: ARGON_T,
    m: ARGON_M,
    p: ARGON_P,
  });
  return `argon2id$t=${ARGON_T},m=${ARGON_M},p=${ARGON_P}$${toB64(salt)}$${toB64(hash)}`;
}

export async function verifyPasswordHash(
  stored: string,
  password: string,
): Promise<boolean> {
  if (!stored || !stored.startsWith("argon2id$")) {
    // Legacy SHA-256 hashes (pre-Argon2id) are rejected; force a reset.
    return false;
  }
  try {
    const [, params, saltB64, hashB64] = stored.split("$");
    const m = /t=(\d+),m=(\d+),p=(\d+)/.exec(params);
    if (!m) return false;
    const salt = fromB64(saltB64);
    const expected = argon2id(new TextEncoder().encode(password), salt, {
      t: Number(m[1]),
      m: Number(m[2]),
      p: Number(m[3]),
    });
    const got = fromB64(hashB64);
    if (expected.length !== got.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ got[i];
    return diff === 0;
  } catch {
    return false;
  }
}
