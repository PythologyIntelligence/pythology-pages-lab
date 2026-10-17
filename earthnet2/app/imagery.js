/**
 * NASA Worldview snapshots for a single event footprint. The layer stack is
 * chosen per hazard, because a thermal-anomaly overlay is the point for a
 * wildfire and meaningless for a marine heatwave.
 */
const SNAPSHOT = 'https://wvs.earthdata.nasa.gov/api/v1/snapshot';

const TRUE_COLOR = { id: 'VIIRS_SNPP_CorrectedReflectance_TrueColor', dated: true };
const COASTLINES = { id: 'Coastlines_15m', dated: false };

export const IMAGERY_SETS = {
  wildfire: [
    { key: 'fires', label: 'True colour + active fire detections', layers: [TRUE_COLOR, { id: 'VIIRS_NOAA20_Thermal_Anomalies_375m_All', dated: true }, COASTLINES] },
    { key: 'truecolor', label: 'True colour', layers: [TRUE_COLOR, COASTLINES] },
  ],
  volcano: [
    { key: 'fires', label: 'True colour + thermal anomalies', layers: [TRUE_COLOR, { id: 'VIIRS_NOAA20_Thermal_Anomalies_375m_All', dated: true }, COASTLINES] },
    { key: 'aerosol', label: 'Aerosol optical depth (ash and gas)', layers: [{ id: 'MODIS_Combined_Value_Added_AOD', dated: true }, COASTLINES] },
  ],
  ocean: [
    { key: 'sstanom', label: 'Sea surface temperature anomaly', layers: [{ id: 'GHRSST_L4_MUR_Sea_Surface_Temperature_Anomalies', dated: true }, COASTLINES] },
    { key: 'sst', label: 'Sea surface temperature', layers: [{ id: 'GHRSST_L4_MUR_Sea_Surface_Temperature', dated: true }, COASTLINES] },
  ],
  cryosphere: [
    { key: 'ice', label: 'Sea ice concentration', layers: [{ id: 'AMSRU2_Sea_Ice_Concentration_12km', dated: true }, COASTLINES] },
    { key: 'truecolor', label: 'True colour', layers: [TRUE_COLOR, COASTLINES] },
  ],
  heat: [
    { key: 'lst', label: 'Land surface temperature (day)', layers: [{ id: 'MODIS_Terra_Land_Surface_Temp_Day', dated: true }, COASTLINES] },
    { key: 'truecolor', label: 'True colour', layers: [TRUE_COLOR, COASTLINES] },
  ],
  crop_stress: [
    { key: 'ndvi', label: 'Vegetation index', layers: [{ id: 'MODIS_Terra_L3_NDVI_16Day', dated: true }, COASTLINES] },
    { key: 'truecolor', label: 'True colour', layers: [TRUE_COLOR, COASTLINES] },
  ],
  flood: [
    { key: 'truecolor', label: 'True colour', layers: [TRUE_COLOR, COASTLINES] },
    { key: 'water', label: 'Surface water extent', layers: [{ id: 'MODIS_Combined_Flood_3-Day', dated: true }, COASTLINES] },
  ],
  default: [{ key: 'truecolor', label: 'True colour', layers: [TRUE_COLOR, COASTLINES] }],
};

export function setsFor(category) {
  return IMAGERY_SETS[category] || IMAGERY_SETS.default;
}

const pad = (n) => String(n).padStart(2, '0');

/** Most recent date with reliable global coverage. */
export function imageryDate(daysBack = 1) {
  const d = new Date(Date.now() - daysBack * 86400000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/**
 * Snapshot URL for a bbox of [west, south, east, north]. Worldview wants
 * EPSG:4326 bounds as south,west,north,east and one WRAP token per layer.
 */
export function snapshotUrl(bbox, set, { date = imageryDate(1), width = 720, height = 560 } = {}) {
  const [w, s, e, n] = bbox;
  // A bbox that crosses the antimeridian would come back mirrored; clamp it to
  // a valid window centred on the event instead of drawing something wrong.
  const west = e < w ? Math.max(-180, w - 360) : w;
  const params = new URLSearchParams({
    REQUEST: 'GetSnapshot',
    LAYERS: set.layers.map((l) => l.id).join(','),
    CRS: 'EPSG:4326',
    TIME: date,
    WRAP: set.layers.map((l) => (l.dated ? 'day' : 'x')).join(','),
    BBOX: `${s.toFixed(3)},${west.toFixed(3)},${n.toFixed(3)},${e.toFixed(3)}`,
    FORMAT: 'image/jpeg',
    WIDTH: String(width),
    HEIGHT: String(height),
    AUTOSCALE: 'false',
  });
  return `${SNAPSHOT}?${params}`;
}

/** Deep link into Worldview itself, so the imagery can be interrogated properly. */
export function worldviewUrl(bbox, set, date = imageryDate(1)) {
  const [w, s, e, n] = bbox;
  const params = new URLSearchParams({
    v: `${w},${s},${e},${n}`,
    t: date,
    l: [...set.layers].reverse().map((l) => l.id).join(','),
  });
  return `https://worldview.earthdata.nasa.gov/?${params}`;
}
