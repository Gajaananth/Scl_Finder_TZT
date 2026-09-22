import type { VercelRequest } from '@vercel/node';
import { SignJWT, jwtVerify } from 'jose';
import * as cookie from 'cookie';

const SESSION_COOKIE_NAME = 'session';
const SESSION_EXPIRATION = '12h';
const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60; // 12 hours in seconds

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET || 'st-cecilias-girls-college-session-secret-key-32-chars-min!';
  return new TextEncoder().encode(secret);
}

export interface StaffAccount {
  email: string;
  passwordHash: string;
}

// Default fallback staff account for out-of-the-box local testing
// Email: staff@stcecilias.lk | Password: StCecilia@2026#Admin!
const DEFAULT_STAFF_ACCOUNTS: StaffAccount[] = [
  {
    email: 'staff@stcecilias.lk',
    passwordHash: '$2b$10$fjC163mzcX5d8mqprOZd3e90.KrNzHcW0KxQOlMlP6.GTCivjFxn6',
  },
];

export function getStaffAccounts(): StaffAccount[] {
  const envAccounts = process.env.STAFF_ACCOUNTS;
  if (!envAccounts) {
    return DEFAULT_STAFF_ACCOUNTS;
  }
  try {
    const parsed = JSON.parse(envAccounts);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch (err) {
    console.error('Error parsing STAFF_ACCOUNTS environment variable:', err);
  }
  return DEFAULT_STAFF_ACCOUNTS;
}

export async function createSessionToken(email: string): Promise<string> {
  const secretKey = getSecretKey();
  return new SignJWT({ email })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(SESSION_EXPIRATION)
    .sign(secretKey);
}

export async function verifySession(req: VercelRequest): Promise<{ email: string } | null> {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;

  const cookies = cookie.parse(cookieHeader);
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) return null;

  try {
    const secretKey = getSecretKey();
    const { payload } = await jwtVerify(token, secretKey);
    if (payload.email && typeof payload.email === 'string') {
      return { email: payload.email };
    }
  } catch {
    // Expired or invalid token
  }
  return null;
}

export function buildSessionCookie(token: string): string {
  const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
  return cookie.serialize(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export function buildClearSessionCookie(): string {
  const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
  return cookie.serialize(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  });
}
