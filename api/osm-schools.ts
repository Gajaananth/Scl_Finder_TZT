import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fetchNearbyOsmElements } from './osm-schools-data.js';

export const config = {
  maxDuration: 65,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { lat, lng, radius } = req.body || {};
  if (![lat, lng, radius].every((value) => typeof value === 'number' && Number.isFinite(value))) {
    return res.status(400).json({ error: 'Invalid map search parameters' });
  }

  try {
    const elements = await fetchNearbyOsmElements({ lat, lng }, radius);
    return res.status(200).json({ elements });
  } catch (error) {
    console.error('All live OpenStreetMap school sources failed:', error);
    return res.status(502).json({ error: 'Live map data unavailable' });
  }
}
