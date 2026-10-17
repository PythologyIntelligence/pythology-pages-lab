/**
 * Shared constants. Colours are chosen to stay legible against Blue Marble at
 * small marker sizes: no two adjacent hues in the same hazard group, and
 * nothing that reads as ocean blue when drawn over the Pacific.
 */
export const FEED_URL = './media/feed/feed.json';
export const DETAIL_URL = './media/feed/detail.json';
export const ENVIROARC_URL = './media/feed/enviroarc.json';
export const API_BASE = null;

export const CATEGORY_COLOR = {
  earthquake: '#ff3355',
  volcano: '#ff8a00',
  geothermal: '#ffd000',
  landslide: '#c08457',
  cyclone: '#22d3ee',
  severe_storm: '#7c93ff',
  // Deliberately a long way round the wheel from severe storm's periwinkle: the
  // two sit next to each other in the legend, and the softer violet this used to
  // be was nearly indistinguishable from it — hopeless under red-green colour
  // blindness, and hard enough with full colour vision.
  tornado: '#b14aff',
  flood: '#3b82f6',
  atmospheric_river: '#67e8f9',
  wildfire: '#ff4d14',
  heat: '#ff2e93',
  cold: '#a5c8ff',
  crop_stress: '#9dc46a',
  ocean: '#14b8a6',
  cryosphere: '#dff1ff',
  humanitarian: '#fb7185',
  infrastructure: '#94a3b8',
  // Near-Earth objects are drawn off the globe on an approach ring rather than
  // on the surface, so a lavender that sits near the storm blues on paper still
  // reads as unmistakably separate on screen.
  neo: '#c8b6ff',
  // Lifted off the old slate: now that the label text is tinted too, it has to
  // clear 4.5:1 against the sidebar rather than only read as a dot on the globe.
  other: '#78879e',
};

/** Fallback taxonomy; the live labels come from meta.json in the feed. */
export const CATEGORY_LABEL = {
  earthquake: 'Earthquake',
  volcano: 'Volcano',
  geothermal: 'Geothermal',
  landslide: 'Landslide',
  cyclone: 'Tropical cyclone',
  severe_storm: 'Severe storm',
  tornado: 'Tornado',
  flood: 'Flood',
  atmospheric_river: 'Atmospheric river',
  wildfire: 'Wildfire',
  heat: 'Heat',
  cold: 'Extreme cold',
  crop_stress: 'Crop stress',
  ocean: 'Ocean temperature',
  cryosphere: 'Cryosphere',
  humanitarian: 'Humanitarian',
  infrastructure: 'Infrastructure stress',
  neo: 'Near-Earth object',
  other: 'Other',
};

export const GROUP_ORDER = [
  'Geophysical',
  'Atmospheric',
  'Hydrological',
  'Ocean',
  'Cryosphere',
  'Biosphere',
  'Impact',
  'Space',
  'Other',
];

export const SEVERITY_BANDS = [
  { key: 'extreme', min: 85, label: 'Extreme', color: '#ff2d55' },
  { key: 'severe', min: 65, label: 'Severe', color: '#ff8a00' },
  { key: 'moderate', min: 45, label: 'Moderate', color: '#ffd000' },
  { key: 'minor', min: 25, label: 'Minor', color: '#7dd3fc' },
  { key: 'info', min: 0, label: 'Informational', color: '#94a3b8' },
];

export const NZ_VIEW = { lat: -41.0, lon: 173.5, distance: 2.05 };
export const HOME_VIEW = { lat: 12, lon: 20, distance: 3.1 };

export const EARTH_RADIUS = 1;
