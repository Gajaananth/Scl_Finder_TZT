import type { VercelRequest, VercelResponse } from '@vercel/node';

const OVERPASS_ENDPOINTS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { lat, lng, radius } = req.body || {};
  if (![lat, lng, radius].every((value) => typeof value === 'number' && Number.isFinite(value))) {
    return res.status(400).json({ error: 'Invalid map search parameters' });
  }

  const searchRadius = Math.min(Math.max(radius, 200), 25000);
  const query = `
    [out:json][timeout:5];
    (
      nwr["amenity"="school"](around:${searchRadius},${lat},${lng});
      nwr["building"="school"](around:${searchRadius},${lat},${lng});
      nwr["building:use"="school"](around:${searchRadius},${lat},${lng});
      nwr["education"="school"](around:${searchRadius},${lat},${lng});
      nwr["school"="yes"](around:${searchRadius},${lat},${lng});
    );
    out center tags;
  `;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${endpoint}?data=${encodeURIComponent(query)}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'StCeciliaSchoolFinder/1.0',
        },
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      if (response.ok) {
        const data = await response.json();
        return res.status(200).json({ elements: data.elements || [] });
      }
    } catch {
      // Try the next Overpass endpoint.
    }
  }

  return res.status(502).json({ error: 'Live map data unavailable' });
}
