import type { VercelRequest, VercelResponse } from '@vercel/node';

const OVERPASS_ENDPOINTS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const ENDPOINT_TIMEOUT_MS = 3000;

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
      nwr["education"="school"](around:${searchRadius},${lat},${lng});
    );
    out center tags;
  `;

  const controllers: AbortController[] = [];
  try {
    const elements = await Promise.any(OVERPASS_ENDPOINTS.map(async (endpoint) => {
      const controller = new AbortController();
      controllers.push(controller);
      const timer = setTimeout(() => controller.abort(), ENDPOINT_TIMEOUT_MS);
      try {
        const response = await fetch(`${endpoint}?data=${encodeURIComponent(query)}`, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'User-Agent': 'StCeciliaSchoolFinder/1.0',
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Overpass endpoint returned ${response.status}`);
        }

        const data = await response.json();
        return Array.isArray(data.elements) ? data.elements : [];
      } finally {
        clearTimeout(timer);
      }
    }));
    return res.status(200).json({ elements });
  } catch (error) {
    console.error('All Overpass endpoints failed:', error);
    return res.status(502).json({ error: 'Live map data unavailable' });
  } finally {
    controllers.forEach((controller) => controller.abort());
  }
}
