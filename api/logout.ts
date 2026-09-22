import type { VercelRequest, VercelResponse } from '@vercel/node';
import { buildClearSessionCookie } from './_auth.js';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Set-Cookie', buildClearSessionCookie());
  return res.status(200).json({ ok: true });
}
