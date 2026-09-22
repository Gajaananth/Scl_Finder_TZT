import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifySession } from './_auth.js';

interface School {
  id: string;
  name: string;
  nameLocal?: string;
  address: string;
  lat: number;
  lng: number;
  medium: string[];
  type: '1AB' | '1C' | 'Type2' | 'Type3';
  zone: string;
  contactPhone?: string;
}

const schools: School[] = [
  {
    id: 'sch-001',
    name: "St. Cecilia's Girls' College",
    nameLocal: 'செசிலியா பெண்கள் கல்லூரி',
    address: '123 Main Street, Trincomalee',
    lat: 8.5874,
    lng: 81.2152,
    medium: ['Tamil', 'English'],
    type: '1AB',
    zone: 'Trincomalee',
    contactPhone: '+94 26 222 3456',
  },
  {
    id: 'sch-002',
    name: 'Trincomalee Hindu College',
    nameLocal: 'திருகோணமலை இந்துக் கல்லூரி',
    address: '45 Temple Road, Trincomalee',
    lat: 8.5770,
    lng: 81.2330,
    medium: ['Tamil', 'English'],
    type: '1AB',
    zone: 'Trincomalee',
    contactPhone: '+94 26 222 4567',
  },
  {
    id: 'sch-003',
    name: 'St. Joseph\'s College, Trincomalee',
    nameLocal: 'புனித சூசையப்பர் கல்லூரி',
    address: '78 College Lane, Trincomalee',
    lat: 8.5720,
    lng: 81.2100,
    medium: ['Tamil', 'English', 'Sinhala'],
    type: '1AB',
    zone: 'Trincomalee',
    contactPhone: '+94 26 222 5678',
  },
  {
    id: 'sch-004',
    name: 'Trincomalee Central College',
    nameLocal: 'திருகோணமலை மத்திய கல்லூரி',
    address: '12 Central Road, Trincomalee',
    lat: 8.5800,
    lng: 81.2280,
    medium: ['Sinhala', 'Tamil'],
    type: '1AB',
    zone: 'Trincomalee',
    contactPhone: '+94 26 222 6789',
  },
  {
    id: 'sch-005',
    name: 'Al Hilal Vidyalaya',
    nameLocal: 'அல் ஹிலால் வித்தியாலயம்',
    address: '90 Mosque Street, Trincomalee',
    lat: 8.5830,
    lng: 81.2180,
    medium: ['Tamil'],
    type: '1C',
    zone: 'Trincomalee',
    contactPhone: '+94 26 222 7890',
  },
  {
    id: 'sch-006',
    name: 'Sinhala Maha Vidyalaya',
    nameLocal: 'சிங்கள மகா வித்தியாலயம்',
    address: '34 Fort Road, Trincomalee',
    lat: 8.5750,
    lng: 81.2350,
    medium: ['Sinhala'],
    type: '1C',
    zone: 'Trincomalee',
    contactPhone: '+94 26 222 8901',
  },
  {
    id: 'sch-007',
    name: 'Orr\'s Hill Government Tamil School',
    nameLocal: 'ஓர்ஸ் ஹில் அரசு தமிழ் பாடசாலை',
    address: '56 Orr\'s Hill, Trincomalee',
    lat: 8.5900,
    lng: 81.2050,
    medium: ['Tamil'],
    type: 'Type2',
    zone: 'Trincomalee',
  },
  {
    id: 'sch-008',
    name: 'Kanniya Primary School',
    nameLocal: 'கன்னியா ஆரம்ப பாடசாலை',
    address: '10 Kanniya Road, Trincomalee',
    lat: 8.6150,
    lng: 81.2000,
    medium: ['Tamil'],
    type: 'Type3',
    zone: 'Trincomalee',
  },
  {
    id: 'sch-009',
    name: 'St. Mary\'s Convent',
    nameLocal: 'புனித மேரி கொன்வென்ட்',
    address: '22 Church Street, Trincomalee',
    lat: 8.5850,
    lng: 81.2200,
    medium: ['English', 'Tamil'],
    type: '1AB',
    zone: 'Trincomalee',
    contactPhone: '+94 26 222 1234',
  },
  {
    id: 'sch-010',
    name: 'Trincomalee Muslim Vidyalaya',
    nameLocal: 'திருகோணமலை முஸ்லிம் வித்தியாலயம்',
    address: '67 New Moor Street, Trincomalee',
    lat: 8.5790,
    lng: 81.2250,
    medium: ['Tamil', 'English'],
    type: '1C',
    zone: 'Trincomalee',
    contactPhone: '+94 26 222 2345',
  },
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Require a valid staff session to access school data
  const session = await verifySession(req);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
  res.status(200).json(schools);
}
