# Scl_Finder_TZT

## School data pipeline

The Batticaloa school list is maintained in `scripts/schools-source.json` and generated into `data/schools.json` by the one-time geocoder. Add or update schools in the source list, then run `npm run geocode`. The script queries Nominatim with a rate limit of at least 1.1 seconds between requests, writes only schools with real returned coordinates, and records unmatched entries in `scripts/geocode-failures.json`. Commit the regenerated `data/schools.json` and failure report; coordinates are never estimated or invented.

## Live school search

For reliable live OpenStreetMap school searches, create a managed API key at [Overpass.ch](https://overpass.ch/pricing) and set `OVERPASS_CH_API_KEY` in Vercel Project Settings under Environment Variables. Keep the key server-side; do not add a `VITE_` prefix. The free plan allows 10,000 requests per month, one concurrent query, and up to 60 seconds per query; it is for non-commercial use. Without this key, the API uses public Overpass mirrors, which may be unavailable or rate-limited.