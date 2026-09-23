# Scl_Finder_TZT

## School data pipeline

The Batticaloa school list is maintained in `scripts/schools-source.json` and generated into `data/schools.json` by the one-time geocoder. Add or update schools in the source list, then run `npm run geocode`. The script queries Nominatim with a rate limit of at least 1.1 seconds between requests, writes only schools with real returned coordinates, and records unmatched entries in `scripts/geocode-failures.json`. Commit the regenerated `data/schools.json` and failure report; coordinates are never estimated or invented.