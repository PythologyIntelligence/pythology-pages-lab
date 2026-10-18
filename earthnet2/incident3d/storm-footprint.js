/**
 * Storm wind extent adapter.
 *
 * A storm's centre track is NOT an affected-area boundary. Draw a schematic
 * threshold-wind footprint only when the source supplies actual quadrant
 * radii for the selected track fix. NHC/ATCF quadrant radii are typically
 * measured in nautical miles; these polygons are display approximations,
 * not official warning, coastal-impact, flood or rain boundaries.
 */
export const WIND_THRESHOLDS = Object.freeze([34, 50, 64]);
export const WIND_QUADRANTS = Object.freeze(["NE", "SE", "SW", "NW"]);
const PROVENANCE_CLASSES = new Set(["official", "observed", "modelled", "hypothetical"]);
const RAD = Math.PI / 180;
const EARTH_RADIUS_KM = 6371.0088;
const NM_TO_KM = 1.852;

export function normalizeWindFields(fields, fixTime) {
  if (!Array.isArray(fields) || !fixTime || !Number.isFinite(Date.parse(fixTime))) return [];
  const used = new Set();
  return fields.slice(0, 6).flatMap(field => {
    const thresholdKt = Number(field?.thresholdKt);
    const evidenceClass = String(field?.evidenceClass || "").toLowerCase();
    const quadrants = field?.quadrantsNm;
    if (!WIND_THRESHOLDS.includes(thresholdKt) || used.has(thresholdKt) ||
        !PROVENANCE_CLASSES.has(evidenceClass) ||
        !String(field?.source || "").trim() || !quadrants ||
        !WIND_QUADRANTS.every(q =>
          typeof quadrants[q] === "number" &&
          Number.isFinite(quadrants[q]) && quadrants[q] >= 0 && quadrants[q] <= 1000) ||
        !WIND_QUADRANTS.some(q => quadrants[q] > 0)) return [];
    used.add(thresholdKt);
    return [{
      thresholdKt, evidenceClass,
      source: String(field.source),
      sourceUrl: String(field.sourceUrl || ""),
      validTime: fixTime,
      quadrantsNm: Object.fromEntries(WIND_QUADRANTS.map(q => [q, quadrants[q]]))
    }];
  }).sort((a, b) => a.thresholdKt - b.thresholdKt);
}

function polarRadiusNm(quadrantsNm, bearing) {
  const b = ((bearing % 360) + 360) % 360;
  const sector = Math.floor(((b + 45) % 360) / 90);
  const first = (sector + 3) % 4;
  const second = sector;
  // Interpolation between quadrant centre bearings (45, 135, 225, 315)
  // smooths the display shape. The interpolation is a rendering heuristic,
  // not inferred additional measured wind radii.
  const startBearing = first * 90 + 45;
  const offset = ((b - startBearing + 360) % 360) / 90;
  return quadrantsNm[WIND_QUADRANTS[first]] * (1 - offset) +
    quadrantsNm[WIND_QUADRANTS[second]] * offset;
}

function destination(lon, lat, bearingDeg, distanceKm) {
  const phi = lat * RAD, lambda = lon * RAD;
  const theta = bearingDeg * RAD, delta = distanceKm / EARTH_RADIUS_KM;
  const nextLat = Math.asin(Math.sin(phi) * Math.cos(delta) +
    Math.cos(phi) * Math.sin(delta) * Math.cos(theta));
  const nextLon = lambda + Math.atan2(
    Math.sin(theta) * Math.sin(delta) * Math.cos(phi),
    Math.cos(delta) - Math.sin(phi) * Math.sin(nextLat));
  return [
    (((nextLon / RAD + 180) % 360) + 360) % 360 - 180,
    nextLat / RAD
  ];
}

export function windFootprintGeoJSON(lon, lat, field) {
  if (!Number.isFinite(lon) || !Number.isFinite(lat) ||
      Math.abs(lon) > 180 || Math.abs(lat) > 90 ||
      !field?.quadrantsNm || !WIND_THRESHOLDS.includes(field.thresholdKt)) return null;
  // A complete, consistently ordered 72-point geodesic perimeter. The
  // wind-speed threshold is in knots, while quadrants are nautical miles.
  const ring = [];
  for (let bearing = 0; bearing < 360; bearing += 5) {
    const rangeNm = polarRadiusNm(field.quadrantsNm, bearing);
    ring.push(destination(lon, lat, bearing, rangeNm * NM_TO_KM));
  }
  ring.push([...ring[0]]);
  // A naive polygon crossing ±180 would be interpreted as a ~360° band by
  // many renderers. Suppress until a proper antimeridian-splitter is wired.
  if (ring.some((p,i) => i > 0 && Math.abs(p[0] - ring[i - 1][0]) > 180)) {
    return null;
  }
  return {type: "Polygon", coordinates: [ring]};
}

export function windSpanKm(field) {
  if (!field?.quadrantsNm) return null;
  // Approximate maximum diameter across opposite rays; intentionally
  // rounded to the nearest 10 km to avoid false geodetic precision.
  let max = 0;
  for (let bearing = 0; bearing < 180; bearing += 5) {
    max = Math.max(max, polarRadiusNm(field.quadrantsNm, bearing) +
      polarRadiusNm(field.quadrantsNm, bearing + 180));
  }
  return Math.round(max * NM_TO_KM / 10) * 10;
}
