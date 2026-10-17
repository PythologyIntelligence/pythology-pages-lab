/**
 * EnviroArc vNext — namespaced, source-aware layer registry.
 *
 * Pure browser module, not wired into the production UI yet.
 * Uses explicit sourceSystem (not provider/source) so ARCUS and Nemesis
 * can both report "riot" without their layer visibility colliding.
 * New upstream providers and categories are not discarded.
 */

export const LAYER_GROUPS = Object.freeze([
  { id: 'geophysical', label: 'Seismic & Earth', order: 10 },
  { id: 'weather', label: 'Weather & Water', order: 20 },
  { id: 'environment', label: 'Fire & Ecology', order: 30 },
  { id: 'ocean', label: 'Ocean & Polar', order: 40 },
  { id: 'space', label: 'Space & Near-Earth', order: 50 },
  { id: 'arcus', label: 'ARCUS · Geopolitics', order: 60 },
  { id: 'nemesis', label: 'Nemesis · Crime', order: 70 },
  { id: 'infrastructure', label: 'Infrastructure & Transport', order: 80 },
  { id: 'economy', label: 'Economy & Supply Chains', order: 90 },
  { id: 'research', label: 'Prometheus Research', order: 100 },
  { id: 'atlas', label: 'Atlas · NZ Context', order: 110 },
  { id: 'other', label: 'Other Layers', order: 999 }
]);

const EARTHNET_GROUPS = Object.freeze({
  earthquake: 'geophysical', volcano: 'geophysical', geothermal: 'geophysical',
  landslide: 'geophysical', tsunami: 'geophysical', seismic_cluster: 'geophysical',
  cyclone: 'weather', severe_storm: 'weather', tornado: 'weather',
  flood: 'weather', atmospheric_river: 'weather', heat: 'weather',
  cold: 'weather', drought: 'weather',
  wildfire: 'environment', crop_stress: 'environment', vegetation_stress: 'environment',
  ocean: 'ocean', cryosphere: 'ocean', salinity: 'ocean',
  sst: 'ocean', ocean_currents: 'ocean',
  neo: 'space', space_weather: 'space', solar_storm: 'space',
  humanitarian: 'infrastructure', infrastructure: 'infrastructure',
  geopolitical_conflict: 'arcus', conflict: 'arcus',
  precursor_candidate: 'research', prometheus_forecast: 'research',
});


const KNOWN_SPECIALIST_TYPES = Object.freeze({
  arcus: [
    'interstate_war','armed_conflict','insurgency','civil_unrest','coup_risk',
    'border_incident','maritime_friction','terrorism','humanitarian_crisis',
    'strategic_signalling'
  ],
  nemesis: [
    'armed_conflict','homicide','assassination','mass_violence','bombing',
    'arrest','other','property_crime','fraud','cybercrime','trafficking',
    'organized_crime','assault','sexual_violence','torture','kidnapping',
    'other_violence','riot','repression'
  ]
});

const VALID_SEGMENT = /^[a-z][a-z0-9_]{0,75}$/;

function segment(value, fallback) {
  const v = String(value ?? '').toLowerCase().trim().replace(/[\s-]+/g, '_');
  return VALID_SEGMENT.test(v) ? v : fallback;
}

/** Canonical producer identity. Never infer this from a news publisher/source URL. */
export function layerNamespace(event) {
  const raw = String(event?.sourceSystem ?? event?.system ?? 'earthnet').trim().toLowerCase();
  if (raw === 'arcus') return 'arcus';
  if (raw === 'nemesis') return 'nemesis';
  if (raw === 'atlas') return 'atlas';
  if (raw === 'prometheus') return 'prometheus';
  if (raw === 'earthnet' || raw === 'earthnet_v2' || raw === 'earthnet_v3') return 'earthnet';
  return segment(raw, 'other');
}

/** Stable key used for visibility; different producers cannot collide on category. */
export function layerKeyForEvent(event) {
  return `${layerNamespace(event)}:${segment(event?.category ?? event?.layerId, 'uncategorised')}`;
}

export function layerGroupForEvent(event) {
  const ns = layerNamespace(event);
  const cat = segment(event?.category ?? event?.layerId, 'uncategorised');
  if (ns === 'arcus') return 'arcus';
  if (ns === 'nemesis') return 'nemesis';
  if (ns === 'atlas') return 'atlas';
  if (ns === 'prometheus') return 'research';
  return EARTHNET_GROUPS[cat] || 'other';
}

/** No category is dropped, including newly arrived and currently empty types. */
export function buildLayerCatalogue(events = [], earthnetCategories = {}) {
  const known = new Map();

  for (const [category, descriptor] of Object.entries(earthnetCategories || {})) {
    const categoryId = segment(category, 'uncategorised');
    const key = `earthnet:${categoryId}`;
    known.set(key, {
      key, namespace: 'earthnet', category: categoryId,
      group: EARTHNET_GROUPS[categoryId] || 'other',
      label: descriptor?.label || category.replaceAll('_', ' '),
      count: 0
    });
  }


  // Keep empty/offline specialist categories visible. An absent stream is
  // not a reason for ARCUS or Nemesis to disappear from the layer selector.
  for (const [namespace, categories] of Object.entries(KNOWN_SPECIALIST_TYPES)) {
    for (const category of categories) {
      const key = `${namespace}:${category}`;
      if (!known.has(key)) known.set(key, {
        key, namespace, category, group: namespace,
        label: category.replaceAll('_', ' '), count: 0
      });
    }
  }

  for (const event of events || []) {
    if (!event || typeof event !== 'object') continue;
    const namespace = layerNamespace(event);
    const category = segment(event.category ?? event.layerId, 'uncategorised');
    const key = `${namespace}:${category}`;
    const item = known.get(key) || {
      key, namespace, category, group: layerGroupForEvent(event),
      label: String(event.categoryLabel || event.layerLabel ||
        earthnetCategories?.[category]?.label || category.replaceAll('_', ' ')),
      count: 0
    };
    item.count += 1;
    known.set(key, item);
  }

  const groups = LAYER_GROUPS.map((group) => ({
    ...group,
    layers: [...known.values()]
      .filter((layer) => layer.group === group.id)
      .sort((a, b) => a.label.localeCompare(b.label) || a.key.localeCompare(b.key))
  }));

  return groups.filter((group) => group.layers.length);
}

/**
 * Independent UI helper. Eventually used by Store's renderer and list.
 * Unknown keys stay visible unless explicitly hidden by their full key.
 */
export function filterEventsByLayers(events = [], hiddenKeys = new Set()) {
  return events.filter((event) => !hiddenKeys.has(layerKeyForEvent(event)));
}
