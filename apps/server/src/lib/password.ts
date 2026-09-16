import { hash, verify } from '@node-rs/argon2';

// Algorithm.Argon2id === 2; referenced numerically because the upstream enum is
// an ambient const enum, which cannot be imported under verbatimModuleSyntax.
const ARGON2ID = 2;

// argon2id with parameters in the range OWASP suggests for interactive logins.
const OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

export async function verifyPassword(digest: string, plain: string): Promise<boolean> {
  try {
    return await verify(digest, plain, OPTIONS);
  } catch {
    return false;
  }
}
