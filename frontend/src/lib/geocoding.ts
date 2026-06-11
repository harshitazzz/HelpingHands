/**
 * geocoding.ts — Unified location utilities for HelpingHands
 *
 * TARGET SCHEMA:
 *   { address: string, latitude: number | null, longitude: number | null }
 *
 * BACKWARD COMPAT:
 *   Old string locations ("Sonipat") are geocoded on-the-fly before saving.
 *   extractLocationObject() never throws; it always returns the canonical shape.
 */

export interface LocationObject {
  address: string;
  latitude: number | null;
  longitude: number | null;
}

// ─────────────────────────────────────────────
// 1. Geocode a city / address string → coords
// ─────────────────────────────────────────────
export async function geocodeAddress(address: string): Promise<LocationObject> {
  if (!address || !address.trim()) {
    return { address: 'Unknown', latitude: null, longitude: null };
  }

  const trimmed = address.trim();

  try {
    console.log(`[GEOCODE] Geocoding address: "${trimmed}"`);
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(trimmed)}&format=json&limit=1`;
    const res = await fetch(url, {
      headers: { 'Accept-Language': 'en', 'User-Agent': 'HelpingHandsNGO/1.0' },
    });
    if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
    const data = await res.json();

    if (data && data.length > 0) {
      const lat = parseFloat(data[0].lat);
      const lon = parseFloat(data[0].lon);
      const displayName: string = data[0].display_name || trimmed;
      // Use a shorter readable name: first two comma-separated parts
      const shortName = displayName.split(',').slice(0, 2).join(',').trim();
      console.log(`[GEOCODE] Result: ${shortName} (${lat}, ${lon})`);
      return { address: shortName || trimmed, latitude: lat, longitude: lon };
    }
    console.warn(`[GEOCODE] No results for "${trimmed}"`);
    return { address: trimmed, latitude: null, longitude: null };
  } catch (err) {
    console.error('[GEOCODE] Error:', err);
    return { address: trimmed, latitude: null, longitude: null };
  }
}

// ─────────────────────────────────────────────────────────────
// 2. Reverse-geocode GPS coords → LocationObject
// ─────────────────────────────────────────────────────────────
export async function reverseGeocode(lat: number, lon: number): Promise<LocationObject> {
  try {
    console.log(`[REVERSE_GEOCODE] Resolving (${lat}, ${lon})`);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`,
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'HelpingHandsNGO/1.0' } }
    );
    if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
    const data = await res.json();

    const addr = data.address || {};
    const city  = addr.city || addr.town || addr.village || addr.suburb || '';
    const state = addr.state || '';
    const address = city && state ? `${city}, ${state}` : city || state || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    console.log(`[REVERSE_GEOCODE] Resolved: ${address}`);
    return { address, latitude: lat, longitude: lon };
  } catch (err) {
    console.error('[REVERSE_GEOCODE] Error:', err);
    return { address: `${lat.toFixed(4)}, ${lon.toFixed(4)}`, latitude: lat, longitude: lon };
  }
}

// ─────────────────────────────────────────────────────────────
// 3. Normalise ANY stored location value → LocationObject
//    Handles: string, {address,latitude,longitude}, {lat,lng}, legacy {gps:{lat,lng}}, null
// ─────────────────────────────────────────────────────────────
export function extractLocationObject(raw: any): LocationObject {
  if (!raw) return { address: 'Unknown', latitude: null, longitude: null };

  // Already in target format
  if (typeof raw === 'object' && 'address' in raw) {
    return {
      address: raw.address || 'Unknown',
      latitude: typeof raw.latitude === 'number' ? raw.latitude : null,
      longitude: typeof raw.longitude === 'number' ? raw.longitude : null,
    };
  }

  // Legacy: just a string
  if (typeof raw === 'string') {
    return { address: raw, latitude: null, longitude: null };
  }

  // Legacy: {lat, lng}
  if (typeof raw === 'object' && 'lat' in raw && 'lng' in raw) {
    return { address: `${raw.lat}, ${raw.lng}`, latitude: raw.lat, longitude: raw.lng };
  }

  // Legacy: {latitude, longitude} without address
  if (typeof raw === 'object' && 'latitude' in raw && 'longitude' in raw) {
    return {
      address: `${raw.latitude}, ${raw.longitude}`,
      latitude: raw.latitude,
      longitude: raw.longitude,
    };
  }

  return { address: 'Unknown', latitude: null, longitude: null };
}

// ─────────────────────────────────────────────────────────────
// 4. Get a human-readable display string from any format
// ─────────────────────────────────────────────────────────────
export function getLocationDisplay(raw: any): string {
  const loc = extractLocationObject(raw);
  return loc.address || 'Location Unknown';
}

// ─────────────────────────────────────────────────────────────
// 5. Get { lat, lng } suitable for Google Maps URL from any format
// ─────────────────────────────────────────────────────────────
export function getLocationCoords(raw: any): { lat: number; lng: number } | null {
  const loc = extractLocationObject(raw);
  if (loc.latitude !== null && loc.longitude !== null) {
    return { lat: loc.latitude, lng: loc.longitude };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// 6. Haversine distance in km between two coords
// ─────────────────────────────────────────────────────────────
export function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ─────────────────────────────────────────────────────────────
// 7. Build Google Maps navigation URL from any location formats
// ─────────────────────────────────────────────────────────────
export function buildMapsUrl(
  destination: any,
  origin?: any
): string {
  const dest = extractLocationObject(destination);
  const destStr = dest.latitude !== null && dest.longitude !== null
    ? `${dest.latitude},${dest.longitude}`
    : encodeURIComponent(dest.address);

  if (origin) {
    const orig = extractLocationObject(origin);
    const origStr = orig.latitude !== null && orig.longitude !== null
      ? `${orig.latitude},${orig.longitude}`
      : encodeURIComponent(orig.address);

    return `https://www.google.com/maps/dir/?api=1&origin=${origStr}&destination=${destStr}&travelmode=driving`;
  }

  return `https://www.google.com/maps/dir/?api=1&destination=${destStr}&travelmode=driving`;
}
