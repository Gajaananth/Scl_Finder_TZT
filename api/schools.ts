import type { VercelRequest, VercelResponse } from '@vercel/node';
import schools from '../data/schools.json';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400');
  return res.status(200).json(schools);
}
