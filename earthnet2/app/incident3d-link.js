/**
 * EarthNet -> terrain investigation navigation.
 * Preserve the exact, source-supplied event ID; never infer a polygon or
 * silently substitute a different incident. NEOs are excluded: their
 * orbital coordinates are not geographic positions on the Earth's terrain.
 */
import { INCIDENT_3D_BASE_URL, INCIDENT_3D_FROM } from './config.js';

export const THREE_D_CATEGORIES = new Set([
  'earthquake','volcano','geothermal','landslide','cyclone','severe_storm',
  'tornado','flood','atmospheric_river','wildfire','heat','cold',
  'crop_stress','ocean','cryosphere','humanitarian','infrastructure'
]);

export function canExploreIn3D(event) {
  if (!event || !THREE_D_CATEGORIES.has(event.category)) return false;
  if (typeof event.id !== 'string' || !event.id || event.id.length > 250) return false;
  const present = v => v !== null && v !== undefined && v !== '';
  if (!present(event.lat) || !present(event.lon)) return false;
  const lat=Number(event.lat), lon=Number(event.lon);
  return Number.isFinite(lat) && Number.isFinite(lon) &&
    lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

export function incident3DUrl(event) {
  if (!canExploreIn3D(event)) return null;
  const url = new URL(INCIDENT_3D_BASE_URL, globalThis.location?.href ||
    'https://earthnet.pythology.co.nz/');
  url.searchParams.set('id',event.id);
  url.searchParams.set('from',INCIDENT_3D_FROM);
  return url.href;
}
