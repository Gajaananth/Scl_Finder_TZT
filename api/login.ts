import type { VercelRequest, VercelResponse } from '@vercel/node';
import bcrypt from 'bcryptjs';
import { getStaffAccounts, createSessionToken, buildSessionCookie } from './_auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, password } = req.body || {};

  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const staffAccounts = getStaffAccounts();

  const account = staffAccounts.find(
    (acc) => acc.email.toLowerCase() === normalizedEmail
  );

  if (!account) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const passwordMatch = await bcrypt.compare(password, account.passwordHash);
  if (!passwordMatch) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = await createSessionToken(account.email);
  const cookieHeader = buildSessionCookie(token);

  res.setHeader('Set-Cookie', cookieHeader);
  return res.status(200).json({ ok: true, email: account.email });
}
