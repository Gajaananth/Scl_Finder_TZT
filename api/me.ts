import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifySession } from './_auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const session = await verifySession(req);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return res.status(200).json({ email: session.email });
}
