/**
 * Earth imagery, assembled in the browser from NASA GIBS.
 *
 * GIBS serves WMTS tiles in EPSG:4326 — the same plate carrée projection an
 * equirectangular sphere texture needs — so a level-z pyramid can be drawn
 * straight into a 2:1 canvas with no reprojection. Level 1 is 8 tiles and
 * paints almost immediately; level 2 is 32 tiles at 4096×2048 and replaces it
 * once it arrives, so the globe is never blank while imagery downloads.
 */
const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best';
const TILE = 512;

/**
 * GIBS' EPSG:4326 matrix sets are NOT a power-of-two quadtree. Level L covers
 * the world in 1.25·2^L by 0.625·2^L tiles, and the published MatrixWidth /
 * MatrixHeight are those values rounded up — so at most levels the right column
 * and bottom row hang off the edge of the map, and some corner tiles do not
 * exist at all. Sizing the canvas to the *matrix* rather than the *world* packs
 * the whole planet into the top-left corner of the texture and throws every
 * marker out of alignment. Levels 3, 4 and 5 divide exactly (10×5, 20×10,
 * 40×20); the rest need the overhang clipped.
 */
const worldTiles = (z) => ({ x: 1.25 * 2 ** z, y: 0.625 * 2 ** z });

function tileUrl(layer, matrixSet, time, z, y, x, ext) {
  return `${GIBS}/${layer}/default/${time ? `${time}/` : ''}${matrixSet}/${z}/${y}/${x}.${ext}`;
}

function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * Draw one full GIBS level into a 2:1 equirectangular canvas. Missing tiles are
 * left as-is rather than failing the whole mosaic — VIIRS true colour has
 * genuine gaps at the poles and between swaths.
 */
export async function buildMosaic(layer, { matrixSet = '500m', time = null, z = 1, ext = 'jpeg', canvas = null, base = null, concurrency = 12 } = {}) {
  const wt = worldTiles(z);
  const cols = Math.ceil(wt.x);
  const rows = Math.ceil(wt.y);
  const cv = canvas || document.createElement('canvas');
  // The canvas is the world, not the matrix; overhanging tiles simply clip.
  cv.width = Math.round(wt.x * TILE);
  cv.height = Math.round(wt.y * TILE);
  const ctx = cv.getContext('2d', { willReadFrequently: false });

  // Underpainting. A daily true-colour mosaic has real holes — polar night, the
  // gaps between orbital swaths, and the odd tile GIBS has not published yet —
  // and an unpainted canvas renders those as hard black rectangles on the
  // planet. Laying the static base map down first turns every hole into
  // ordinary terrain instead.
  if (base) ctx.drawImage(base, 0, 0, cv.width, cv.height);

  const jobs = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) jobs.push([y, x]);

  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
    while (cursor < jobs.length) {
      const [y, x] = jobs[cursor++];
      const img = await loadImage(tileUrl(layer, matrixSet, time, z, y, x, ext));
      if (img) ctx.drawImage(img, x * TILE, y * TILE, TILE, TILE);
    }
  });
  await Promise.all(workers);
  return cv;
}

/** UTC date string GIBS is guaranteed to have complete global coverage for. */
export function recentImageryDate(daysBack = 1) {
  const d = new Date(Date.now() - daysBack * 86400000);
  return d.toISOString().slice(0, 10);
}

export const LAYERS = {
  blueMarble: { layer: 'BlueMarble_ShadedRelief_Bathymetry', matrixSet: '500m', ext: 'jpeg' },
  cityLights: { layer: 'VIIRS_CityLights_2012', matrixSet: '500m', ext: 'jpeg' },
  trueColor: { layer: 'VIIRS_SNPP_CorrectedReflectance_TrueColor', matrixSet: '250m', ext: 'jpeg', dated: true },
};

/**
 * Derive a specular/roughness mask from the base map. Ocean in Blue Marble is
 * dark and strongly blue; land is not. Cheap, and it gives the water a real
 * sun glint instead of a uniformly matte planet.
 */
export function oceanMask(sourceCanvas, width = 1024) {
  const height = width / 2;
  const cv = document.createElement('canvas');
  cv.width = width;
  cv.height = height;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(sourceCanvas, 0, 0, width, height);
  const img = ctx.getImageData(0, 0, width, height);
  const p = img.data;
  for (let i = 0; i < p.length; i += 4) {
    const r = p[i], g = p[i + 1], b = p[i + 2];
    const blueLead = b - Math.max(r, g);
    const dark = 255 - Math.max(r, g, b);
    // Water: blue channel clearly dominant and the pixel is not bright.
    const water = Math.max(0, Math.min(255, blueLead * 6 + dark - 90));
    p[i] = p[i + 1] = p[i + 2] = water;
    p[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}
