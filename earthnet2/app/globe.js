import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { latLonToVec3, subsolarPoint, catColor, eventColor, clamp } from './util.js';
import { buildMosaic, oceanMask, LAYERS, recentImageryDate } from './textures.js';

const R = 1;
const MARKER_R = 1.006;

/**
 * The near-Earth object ring.
 *
 * A close approach is a real, dated, measured event, but it has no location on
 * the ground — so it is drawn off the globe rather than pinned to a country it
 * has nothing to do with. The ring is explicitly a diagram: distance from the
 * planet is the miss distance in lunar distances, and the angle around the ring
 * is the time until closest approach, so the objects sweep towards the marker at
 * the front as their date arrives. It is tilted to the ecliptic so it reads as
 * an orbit rather than a halo.
 */
const NEO_TILT = (23.4 * Math.PI) / 180;
const NEO_R_MIN = 1.24;
const NEO_R_MAX = 1.86;

function neoVec3(orbit) {
  const win = Number(orbit?.windowDays) || 60;
  const days = clamp(Number(orbit?.days) || 0, -1, win);
  const a = -Math.PI / 2 + (days / win) * Math.PI * 2;
  // Square-rooted so the crowded inner distances — where the interesting passes
  // are — get most of the ring's width instead of piling up at the centre.
  const ld = clamp(Number(orbit?.ld) || 0, 0, 20);
  const r = NEO_R_MIN + Math.sqrt(ld / 20) * (NEO_R_MAX - NEO_R_MIN);
  const x = Math.cos(a) * r;
  const z = Math.sin(a) * r;
  return new THREE.Vector3(x, -z * Math.sin(NEO_TILT), z * Math.cos(NEO_TILT));
}

/* ------------------------------------------------------------------ *
 * Shaders
 * ------------------------------------------------------------------ */

const EARTH_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vUv = uv;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

/**
 * Day imagery, night lights and a specular water mask combined against a real
 * subsolar direction. The terminator is a soft band with a warm edge, which is
 * what it looks like from orbit — a hard line reads as a rendering artefact.
 */
const EARTH_FRAG = /* glsl */ `
  uniform sampler2D uDayMap;
  uniform sampler2D uAltMap;
  uniform sampler2D uNightMap;
  uniform sampler2D uMaskMap;
  uniform vec3 uSunDir;
  uniform vec3 uCameraPos;
  uniform float uAltMix;
  uniform float uNightBoost;
  // 1 = illuminated atlas / geography. 0 = astronomical day/night.
  uniform float uGeographyMode;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;

  void main() {
    vec3 dayA = texture2D(uDayMap, vUv).rgb;
    vec3 dayB = texture2D(uAltMap, vUv).rgb;
    vec3 day  = mix(dayA, dayB, uAltMix);
    float water = texture2D(uMaskMap, vUv).r;

    vec3 N = normalize(vNormalW);
    vec3 L = normalize(uSunDir);
    vec3 V = normalize(uCameraPos - vPosW);
    float ndl = dot(N, L);
    float dayAmt = smoothstep(-0.10, 0.25, ndl);
    float diff = clamp(ndl, 0.0, 1.0);

    vec3 lit = day * (0.52 + 0.80 * pow(diff, 0.62));

    // Sun glint, water only. Two lobes: a tight sparkle that reads as the sun's
    // reflected disc, plus a very faint wide sheen. A single broad lobe clips to
    // white across ten-plus degrees of ocean and looks like a lens flare rather
    // than sunlight on water.
    vec3 H = normalize(L + V);
    float ndh = max(dot(N, H), 0.0);
    float spec = (pow(ndh, 1400.0) * 0.9 + pow(ndh, 120.0) * 0.06) * water * step(0.0, ndl);

    // City lights: squaring suppresses sensor noise before the level is lifted.
    vec3 nightTex = texture2D(uNightMap, vUv).rgb;
    nightTex = nightTex * nightTex * uNightBoost;
    // Moonlight. A physically black night side would be honest but useless: this
    // is a New Zealand-focused monitor, and NZ is in darkness for half of every
    // UTC day. Bleeding the day map through at a low, blue-shifted level keeps
    // coastlines and terrain readable wherever a marker sits, while city lights
    // stay the dominant feature of the dark hemisphere.
    float lum = dot(day, vec3(0.299, 0.587, 0.114));
    vec3 moon = mix(vec3(lum), day, 0.5) * vec3(0.60, 0.74, 1.0) * 0.70;
    vec3 nightCol = nightTex * vec3(1.0, 0.82, 0.55) + moon;

    // In an intelligence map, the continent and ocean texture must remain
    // legible wherever the camera turns. This is an illuminated *map* view,
    // not a claim that the whole planet is sunlit. Reuse the existing NASA
    // Blue Marble bathymetry and VIIRS imagery; do not replace their detail
    // with an artificial flat-colour ocean.
    //
    // Gentle tonal lift reveals dark bathymetry and land without blowing out
    // deserts/clouds. A little real solar shading preserves the 3D relief.
    vec3 geoBase = pow(max(day, vec3(0.0)), vec3(0.78))
      * vec3(1.04, 1.07, 1.10);
    float globeRelief = 0.84 + 0.16 * max(ndl, 0.0);
    vec3 geoVisible = geoBase * globeRelief;

    vec3 astronomical = mix(nightCol, lit, dayAmt);
    vec3 col = mix(astronomical, geoVisible, uGeographyMode);

    // City lights remain accurate to the actual night hemisphere. Dim them
    // in geography mode so the coastline is never overwhelmed.
    col += nightTex * vec3(0.78, 0.70, 0.50) *
      (1.0 - dayAmt) * (0.24 * uGeographyMode);
    col += spec * vec3(1.0, 0.95, 0.84) * 0.72;

    // Warm scattering along the terminator.
    float term = 1.0 - abs(ndl);
    col += vec3(0.42, 0.15, 0.03) * pow(smoothstep(0.72, 1.0, term), 2.0)
      * dayAmt * (1.0 - 0.88 * uGeographyMode);

    // Limb haze.
    float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    col += vec3(0.24, 0.48, 1.0) * fres *
      (0.22 + 0.45 * mix(dayAmt, 1.0, uGeographyMode));

    gl_FragColor = vec4(col, 1.0);
  }
`;

const ATMO_VERT = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const ATMO_FRAG = /* glsl */ `
  uniform vec3 uSunDir;
  uniform vec3 uCameraPos;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(uCameraPos - vPosW);
    float intensity = pow(0.70 - dot(N, V), 4.0);
    float ndl = dot(N, normalize(uSunDir));
    float lit = smoothstep(-0.55, 0.35, ndl);
    vec3 col = mix(vec3(0.10, 0.22, 0.55), vec3(0.35, 0.62, 1.0), lit);
    gl_FragColor = vec4(col, clamp(intensity, 0.0, 1.0) * (0.20 + 0.85 * lit));
  }
`;

const MARKER_VERT = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aSeverity;
  attribute float aPhase;
  attribute float aOffGlobe;
  uniform float uTime;
  uniform float uScale;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vSeverity;
  varying float vFade;
  void main() {
    vColor = aColor;
    vSeverity = aSeverity;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 nrm = normalize(normalMatrix * normalize(position));
    float facing = dot(nrm, normalize(-mv.xyz));
    // Surface markers fade as they rotate around the limb. Markers that are not
    // on the surface at all — near-Earth objects on the approach ring — are in
    // open space, so they stay bright and let the depth buffer hide the ones
    // genuinely behind the planet.
    vFade = mix(smoothstep(-0.02, 0.16, facing), 1.0, aOffGlobe);
    // Only the top band breathes; a field of pulsing dots is noise, one is a signal.
    float pulse = 1.0 + 0.30 * sin(uTime * 2.1 + aPhase) * step(0.85, aSeverity);
    gl_PointSize = aSize * pulse * uScale * uPixelRatio / max(0.001, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

/**
 * The Sun.
 *
 * Drawn where it actually is — the same subsolar direction that lights the
 * planet — so the terminator, the glint on the ocean and the star in the sky
 * all agree with each other. The disc is about three times its true angular
 * size, which is the smallest it can be and still be something you can aim a
 * cursor at; everything outside it is corona, and the corona is what carries
 * the condition of the Sun back to the viewer: brighter and hotter-hued when
 * the space weather is disturbed, pale and steady when it is quiet.
 */
const SUN_DIST = 26;
const SUN_PLANE = 3.2;
const SUN_DISC = 0.128; // fraction of the plane's half-width taken by the disc

const SUN_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SUN_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uActivity;
  uniform vec3 uTint;
  varying vec2 vUv;

  void main() {
    vec2 p = vUv - 0.5;
    float r = length(p) * 2.0;
    if (r > 1.0) discard;
    float ang = atan(p.y, p.x);

    float disc = smoothstep(${SUN_DISC.toFixed(3)}, ${(SUN_DISC * 0.80).toFixed(3)}, r);
    // A warmer rim just outside the photosphere, so the edge of the disc reads
    // as an edge rather than as the point the glow happens to stop.
    float limb = smoothstep(${(SUN_DISC * 1.45).toFixed(3)}, ${SUN_DISC.toFixed(3)}, r) - disc;

    // Two falloffs: a tight inner halo, and a long faint reach that gives the
    // star some presence against the starfield without washing it out.
    float inner = pow(max(0.0, 1.0 - r / ${(SUN_DISC * 3.4).toFixed(3)}), 2.6);
    float outer = pow(max(0.0, 1.0 - r), 3.4);

    // Streamers. Slow and shallow on purpose — a bright rotating starburst
    // reads as a lens artefact; one that barely moves reads as the corona.
    float rays = 0.5 + 0.5 * sin(ang * 9.0 + sin(ang * 4.0) * 1.7 + uTime * 0.045);
    rays = mix(1.0, rays, 0.42) * smoothstep(${SUN_DISC.toFixed(3)}, ${(SUN_DISC * 2.1).toFixed(3)}, r);
    // Only the disturbed Sun breathes, and only just.
    float breathe = 1.0 + 0.06 * uActivity * sin(uTime * 0.9);

    float a = disc + limb * 0.88
      + inner * (0.40 + 0.34 * uActivity) * rays * breathe
      + outer * (0.15 + 0.24 * uActivity);

    vec3 col = mix(uTint, mix(uTint, vec3(1.0), 0.9), disc + limb * 0.35);
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

const MARKER_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vSeverity;
  varying float vFade;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float r = length(uv) * 2.0;
    if (r > 1.0) discard;
    float core = smoothstep(0.52, 0.0, r);
    float halo = pow(1.0 - r, 2.4);
    float ring = smoothstep(0.90, 0.76, r) - smoothstep(0.76, 0.64, r);
    float hi = step(0.65, vSeverity);
    float a = core * 0.96 + halo * 0.30 + ring * 0.55 * hi;
    vec3 c = mix(vColor, vec3(1.0), core * 0.55);
    gl_FragColor = vec4(c, clamp(a, 0.0, 1.0) * vFade);
    if (gl_FragColor.a < 0.01) discard;
  }
`;

/* ------------------------------------------------------------------ *
 * Globe
 * ------------------------------------------------------------------ */

export class Globe {
  constructor(canvas, { onPick, onHover } = {}) {
    this.canvas = canvas;
    this.onPick = onPick;
    this.onHover = onHover;
    this.events = [];
    this.positions = [];
    this.offGlobe = [];
    this.selectedId = null;
    this.clock = new THREE.Clock();
    this._tween = null;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setClearColor(0x03060f, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.05, 100);

    // Open on the daylit face. A fixed starting longitude means half the day the
    // first thing anyone sees is a black planet; deriving it from the real
    // subsolar point guarantees sunlight. The 40° east offset pushes the
    // terminator onto the right-hand limb so the opening frame has a crescent of
    // night rather than flat noon lighting, and the latitude is pulled south —
    // this is an Aotearoa-focused monitor, so the southern hemisphere leads.
    const sun0 = subsolarPoint(new Date());
    const start = latLonToVec3(sun0.lat * 0.3 - 14, sun0.lon + 40, 3.1);
    this.camera.position.set(start.x, start.y, start.z);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.055;
    this.controls.enablePan = false;
    this.controls.minDistance = 1.14;
    this.controls.maxDistance = 6.0;
    this.controls.rotateSpeed = 0.42;
    this.controls.zoomSpeed = 0.75;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.16;

    this._buildStars();
    this._buildSun();
    this._buildEarth();
    this._buildAtmosphere();
    this._buildMarkers();

    this.overlays = new THREE.Group();
    this.scene.add(this.overlays);

    // Persistent Earth-system fields live separately from event-specific storm
    // tracks/polygons so opening a hazard panel never erases ocean circulation.
    this.enviroarcLayers = new THREE.Group();
    this.scene.add(this.enviroarcLayers);
    this.enviroarcSnapshot = null;
    this.enviroarcVisibility = { currents: true, salinity: false, sst: false };

    this.neoRing = this._buildNeoRing();
    this.scene.add(this.neoRing);

    this.selectionRing = this._buildSelectionRing();
    this.scene.add(this.selectionRing);

    // Handy from the console when checking the render on a real device.
    window.__globe = this;

    this._bindInput();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.renderer.setAnimationLoop(() => this._frame());
  }

  /* ---------------- scene construction ---------------- */

  _buildStars() {
    const n = 4200;
    const pos = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      // Uniform on a sphere, so the sky has no seams or clumps at the poles.
      const u = Math.random() * 2 - 1;
      const t = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const r = 42 + Math.random() * 8;
      pos.set([r * s * Math.cos(t), r * u, r * s * Math.sin(t)], i * 3);
      const mag = Math.pow(Math.random(), 3.2);
      size[i] = 0.6 + mag * 5.2;
      // A little colour spread: most stars white-blue, a few warm.
      const warm = Math.random() < 0.18 ? 1 : 0;
      col.set(warm ? [1, 0.82, 0.66] : [0.82 + Math.random() * 0.18, 0.88 + Math.random() * 0.12, 1], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    const m = new THREE.ShaderMaterial({
      uniforms: { uPixelRatio: { value: Math.min(devicePixelRatio, 2) } },
      vertexShader: `
        attribute float aSize; attribute vec3 aColor; varying vec3 vColor;
        uniform float uPixelRatio;
        void main(){ vColor=aColor; vec4 mv=modelViewMatrix*vec4(position,1.0);
          gl_PointSize=aSize*uPixelRatio; gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `
        varying vec3 vColor;
        void main(){ vec2 uv=gl_PointCoord-0.5; float r=length(uv)*2.0;
          float a=pow(max(0.0,1.0-r),1.8); if(a<0.02) discard;
          gl_FragColor=vec4(vColor,a); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.scene.add(new THREE.Points(g, m));
  }

  _buildSun() {
    this.sunUniforms = {
      uTime: { value: 0 },
      uActivity: { value: 0.15 },
      uTint: { value: new THREE.Color('#ffd9a4').convertSRGBToLinear() },
    };
    this.sun = new THREE.Mesh(
      new THREE.PlaneGeometry(SUN_PLANE, SUN_PLANE),
      new THREE.ShaderMaterial({
        uniforms: this.sunUniforms,
        vertexShader: SUN_VERT,
        fragmentShader: SUN_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.sun.frustumCulled = false;
    // World-space direction to the Sun, kept up to date every frame and reused
    // by the shading, the billboard and the hit test so they cannot disagree.
    this.sunDir = new THREE.Vector3(1, 0, 0);
    this.scene.add(this.sun);
  }

  /**
   * Colour and intensity of the star from the live space-weather snapshot. The
   * hue shift is deliberately small — a Sun that turns red on a G1 storm would
   * be a lie told loudly — so most of the signal is in how far the corona
   * reaches, which is what the eye picks up peripherally anyway.
   */
  setSolar(snapshot) {
    this.solar = snapshot || null;
    const index = clamp(Number(snapshot?.health?.index) || 0, 0, 100) / 100;
    const tints = ['#ffd9a4', '#ffcb84', '#ffb460', '#ff9448', '#ff7a3c'];
    const hex = tints[Math.min(tints.length - 1, Math.floor(index * tints.length))];
    this.sunUniforms.uTint.value.set(hex).convertSRGBToLinear();
    this.sunUniforms.uActivity.value = 0.12 + index * 0.88;
  }

  _blankTexture(hex) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 2;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = hex;
    ctx.fillRect(0, 0, 2, 2);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  _buildEarth() {
    const geo = new THREE.SphereGeometry(R, 192, 96);
    this.earthUniforms = {
      uDayMap: { value: this._blankTexture('#0b1b33') },
      uAltMap: { value: this._blankTexture('#0b1b33') },
      uNightMap: { value: this._blankTexture('#000000') },
      uMaskMap: { value: this._blankTexture('#000000') },
      uSunDir: { value: new THREE.Vector3(1, 0, 0) },
      uCameraPos: { value: new THREE.Vector3() },
      uAltMix: { value: 0 },
      uNightBoost: { value: 2.4 },
      // Default: oceans and continents are visible in all time zones.
      uGeographyMode: { value: 1.0 },
    };
    this.earth = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: this.earthUniforms,
      vertexShader: EARTH_VERT,
      fragmentShader: EARTH_FRAG,
    }));
    this.scene.add(this.earth);
  }

  /** Toggle readability without changing the sun, timestamps or markers. */
  setGeographyMode(enabled) {
    this.earthUniforms.uGeographyMode.value = enabled ? 1.0 : 0.0;
  }

  _buildAtmosphere() {
    this.atmoUniforms = {
      uSunDir: this.earthUniforms.uSunDir,
      uCameraPos: this.earthUniforms.uCameraPos,
    };
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.035, 96, 48),
      new THREE.ShaderMaterial({
        uniforms: this.atmoUniforms,
        vertexShader: ATMO_VERT,
        fragmentShader: ATMO_FRAG,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.scene.add(mesh);
  }

  _buildMarkers() {
    this.markerUniforms = {
      uTime: { value: 0 },
      uScale: { value: 2.5 },
      uPixelRatio: { value: Math.min(devicePixelRatio, 2) },
    };
    this.markerGeo = new THREE.BufferGeometry();
    this.markerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
    this.markers = new THREE.Points(
      this.markerGeo,
      new THREE.ShaderMaterial({
        uniforms: this.markerUniforms,
        vertexShader: MARKER_VERT,
        fragmentShader: MARKER_FRAG,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.markers.frustumCulled = false;
    this.scene.add(this.markers);
  }

  /** Two faint guide circles marking the near and far edge of the approach ring. */
  _buildNeoRing() {
    const g = new THREE.Group();
    for (const [radius, opacity] of [[NEO_R_MIN, 0.3], [NEO_R_MAX, 0.16]]) {
      const pts = [];
      for (let i = 0; i <= 256; i++) {
        const a = (i / 256) * Math.PI * 2;
        const z = Math.sin(a) * radius;
        pts.push(new THREE.Vector3(Math.cos(a) * radius, -z * Math.sin(NEO_TILT), z * Math.cos(NEO_TILT)));
      }
      g.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: 0xc8b6ff, transparent: true, opacity, depthWrite: false }),
      ));
    }
    g.visible = false;
    return g;
  }

  _buildSelectionRing() {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.021, 0.026, 64),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }),
    );
    const pulse = new THREE.Mesh(
      new THREE.RingGeometry(0.03, 0.034, 64),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }),
    );
    g.add(ring, pulse);
    g.visible = false;
    g.userData = { ring, pulse };
    return g;
  }

  /* ---------------- imagery ---------------- */

  async loadImagery(onProgress = () => {}) {
    const setTex = (uniform, canvas, { srgb = true } = {}) => {
      const t = new THREE.CanvasTexture(canvas);
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      t.wrapS = THREE.RepeatWrapping;
      t.needsUpdate = true;
      const old = uniform.value;
      uniform.value = t;
      if (old && old.dispose) old.dispose();
    };

    // Level 1 first: six tiles, so the planet has real imagery in about a second.
    const quick = await buildMosaic(LAYERS.blueMarble.layer, { matrixSet: '500m', z: 1 });
    setTex(this.earthUniforms.uDayMap, quick);
    setTex(this.earthUniforms.uMaskMap, oceanMask(quick, 1024), { srgb: false });
    onProgress('base');

    // Level 3 is 10×5 tiles at 5120×2560 — the first level that tiles the world
    // exactly, and sharp enough to read coastlines when zoomed in on NZ. Fall
    // back a level where the GPU cannot hold a texture that wide.
    this._detailZ = this.renderer.capabilities.maxTextureSize >= 8192 ? 3 : 2;

    const [full, lights] = await Promise.all([
      buildMosaic(LAYERS.blueMarble.layer, { matrixSet: '500m', z: this._detailZ, concurrency: 16 }),
      buildMosaic(LAYERS.cityLights.layer, { matrixSet: '500m', z: 2 }),
    ]);
    setTex(this.earthUniforms.uDayMap, full);
    setTex(this.earthUniforms.uMaskMap, oceanMask(full, 2048), { srgb: false });
    setTex(this.earthUniforms.uNightMap, lights);
    onProgress('detail');
    this._baseCanvas = full;
  }

  /** Today's true-colour VIIRS mosaic, cross-faded in over the static base map. */
  async loadTrueColor(onProgress = () => {}) {
    if (this._trueColorLoaded) return true;
    const date = recentImageryDate(1);
    const cv = await buildMosaic(LAYERS.trueColor.layer, {
      matrixSet: '250m',
      time: date,
      z: this._detailZ ?? 2,
      ext: 'jpeg',
      base: this._baseCanvas || null,
      concurrency: 16,
    });
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    t.wrapS = THREE.RepeatWrapping;
    this.earthUniforms.uAltMap.value = t;
    this._trueColorLoaded = true;
    this._trueColorDate = date;
    onProgress(date);
    return date;
  }

  setTrueColorMix(v) {
    this._targetAltMix = clamp(v, 0, 1);
  }

  /* ---------------- data ---------------- */

  setEvents(events) {
    this.events = events;
    const n = events.length;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const sev = new Float32Array(n);
    const phase = new Float32Array(n);
    const offGlobe = new Float32Array(n);
    const c = new THREE.Color();
    this.positions = new Array(n);
    this.offGlobe = new Array(n);

    events.forEach((e, i) => {
      // Anything carrying an `orbit` block is not on the surface: it goes on the
      // approach ring instead of at a latitude and longitude it does not have.
      const off = Boolean(e.orbit);
      offGlobe[i] = off ? 1 : 0;
      this.offGlobe[i] = off;
      const v = off ? neoVec3(e.orbit) : latLonToVec3(e.lat, e.lon, MARKER_R);
      pos[i * 3] = v.x;
      pos[i * 3 + 1] = v.y;
      pos[i * 3 + 2] = v.z;
      this.positions[i] = new THREE.Vector3(v.x, v.y, v.z);
      c.set(eventColor(e));
      c.convertSRGBToLinear();
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
      // Area, not radius, tracks severity so a severe event reads as bigger
      // without a moderate one becoming invisible.
      size[i] = 5.2 + Math.sqrt(e.severity / 100) * 12.5 + (e.severity >= 85 ? 3 : 0);
      sev[i] = e.severity / 100;
      phase[i] = (i % 17) * 0.37;
    });

    this.markerGeo.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aSeverity', new THREE.BufferAttribute(sev, 1));
    g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    g.setAttribute('aOffGlobe', new THREE.BufferAttribute(offGlobe, 1));
    this.markerGeo = g;
    this.markers.geometry = g;
    this.markers.frustumCulled = false;
    // The guide circles are only meaningful when something is on them.
    this.neoRing.visible = events.some((e) => e.orbit);

    if (this.selectedId && !events.some((e) => e.id === this.selectedId)) this.select(null);
    else if (this.selectedId) this.select(this.selectedId);
  }

  /**
   * Persistent EnviroArc fields. These are display samples of gridded products,
   * not event markers, so they are intentionally unpickable and live slightly
   * above the surface.
   */
  setEnviroArcLayers(snapshot, visibility = {}) {
    this.enviroarcSnapshot = snapshot || null;
    this.enviroarcVisibility = { ...this.enviroarcVisibility, ...visibility };
    this.enviroarcLayers.clear();
    if (!snapshot) return;

    if (this.enviroarcVisibility.currents) {
      this._addCurrentVectors(snapshot.ocean?.currents?.vectors || []);
    }
    if (this.enviroarcVisibility.salinity) {
      this._addScalarField(snapshot.ocean?.salinity?.cells || [], 'salinity');
    }
    if (this.enviroarcVisibility.sst) {
      this._addScalarField(snapshot.ocean?.sst?.cells || [], 'sst');
    }
  }

  _addCurrentVectors(vectors) {
    const positions = [];
    const colors = [];
    const col = new THREE.Color();

    for (const d of vectors) {
      if (![d.lat, d.lon, d.u, d.v, d.speed].every(Number.isFinite)) continue;
      const speed = clamp(d.speed, 0, 1.6);
      const scale = 2.0 + speed * 2.4;
      const cosLat = Math.max(0.25, Math.cos((d.lat * Math.PI) / 180));
      const endLat = clamp(d.lat + d.v * scale, -79, 79);
      const endLon = d.lon + (d.u * scale) / cosLat;

      const a = latLonToVec3(d.lat, d.lon, 1.013);
      const b = latLonToVec3(endLat, endLon, 1.014);
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z);

      // Slow water is subdued; fast boundary currents brighten toward white.
      const t = clamp(speed / 1.2, 0, 1);
      col.setRGB(0.10 + t * 0.45, 0.62 + t * 0.32, 0.78 + t * 0.20);
      col.convertSRGBToLinear();
      for (let i = 0; i < 2; i++) colors.push(col.r, col.g, col.b);
    }

    if (!positions.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });
    const lines = new THREE.LineSegments(geo, mat);
    lines.renderOrder = 5;
    this.enviroarcLayers.add(lines);
  }

  _addScalarField(cells, kind) {
    const positions = [];
    const colors = [];
    const col = new THREE.Color();

    for (const d of cells) {
      if (!Number.isFinite(d.lat) || !Number.isFinite(d.lon)) continue;
      const anomaly = Number(d.anomaly);
      if (!Number.isFinite(anomaly)) continue;

      // Keep near-normal cells out of the display. The layer is anomaly
      // intelligence, not a confetti rendering of the whole ocean.
      const threshold = kind === 'salinity' ? 0.15 : 0.5;
      if (Math.abs(anomaly) < threshold) continue;

      const p = latLonToVec3(d.lat, d.lon, 1.016);
      positions.push(p.x, p.y, p.z);

      if (kind === 'salinity') {
        // Freshening is cyan; saltier-than-WOA is warm amber.
        const t = clamp(Math.abs(anomaly) / 2.0, 0, 1);
        if (anomaly < 0) col.setRGB(0.12, 0.62 + 0.25 * t, 0.95);
        else col.setRGB(0.95, 0.52 + 0.18 * (1 - t), 0.16);
      } else {
        // SST anomaly: cool blue through warm red.
        const t = clamp(Math.abs(anomaly) / 4.0, 0, 1);
        if (anomaly < 0) col.setRGB(0.18, 0.50 + 0.25 * (1 - t), 1.0);
        else col.setRGB(1.0, 0.48 - 0.22 * t, 0.18);
      }
      col.convertSRGBToLinear();
      colors.push(col.r, col.g, col.b);
    }

    if (!positions.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: kind === 'salinity' ? 0.024 : 0.026,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });
    const pts = new THREE.Points(geo, mat);
    pts.renderOrder = 6;
    this.enviroarcLayers.add(pts);
  }

  /** Storm tracks and warning polygons for whatever is currently selected. */
  setOverlays(items) {
    this.overlays.clear();
    for (const item of items) {
      if (item.track?.length > 1) this._addTrack(item.track, item.color);
      if (item.polygon) this._addPolygon(item.polygon, item.color);
    }
  }

  _addTrack(track, color) {
    const pts = track
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
      .map((p) => {
        const v = latLonToVec3(p.lat, p.lon, 1.012);
        return new THREE.Vector3(v.x, v.y, v.z);
      });
    if (pts.length < 2) return;
    const curve = new THREE.CatmullRomCurve3(pts);
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, Math.min(400, pts.length * 12), 0.0035, 8, false),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92 }),
    );
    this.overlays.add(tube);
    // A dot at each advisory fix, so the track reads as observations, not a spline.
    const dotGeo = new THREE.SphereGeometry(0.0058, 10, 8);
    const dotMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75 });
    for (const p of pts) {
      const d = new THREE.Mesh(dotGeo, dotMat);
      d.position.copy(p);
      this.overlays.add(d);
    }
  }

  _addPolygon(polygon, color) {
    const rings = polygon.type === 'MultiPolygon' ? polygon.coordinates.flat() : polygon.coordinates;
    for (const ring of rings || []) {
      const pts = ring
        .filter((c) => Number.isFinite(c[0]) && Number.isFinite(c[1]))
        .map(([lon, lat]) => {
          const v = latLonToVec3(lat, lon, 1.009);
          return new THREE.Vector3(v.x, v.y, v.z);
        });
      if (pts.length < 3) continue;
      const geo = new THREE.BufferGeometry().setFromPoints([...pts, pts[0]]);
      this.overlays.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 })));
    }
  }

  select(id) {
    this.selectedId = id;
    const idx = this.events.findIndex((e) => e.id === id);
    if (idx < 0) {
      this.selectionRing.visible = false;
      return;
    }
    const p = this.positions[idx];
    this.selectionRing.position.copy(p).multiplyScalar(1.002);
    this.selectionRing.lookAt(0, 0, 0);
    this.selectionRing.visible = true;
    const c = new THREE.Color(eventColor(this.events[idx]));
    this.selectionRing.userData.ring.material.color = c;
    this.selectionRing.userData.pulse.material.color = c;
  }

  /* ---------------- interaction ---------------- */

  _bindInput() {
    const el = this.canvas;
    let down = null;
    el.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY, t: performance.now() };
      this.controls.autoRotate = false;
    });
    el.addEventListener('pointerup', (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const quick = performance.now() - down.t < 600;
      down = null;
      if (moved > 5 || !quick) return;
      const hit = this.pick(e.clientX, e.clientY);
      this.onPick?.(hit);
    });
    el.addEventListener('pointermove', (e) => {
      if (down) return;
      this._pendingHover = { x: e.clientX, y: e.clientY };
    });
    el.addEventListener('pointerleave', () => {
      this._pendingHover = null;
      this._hoverKey = null;
      this.onHover?.(null);
    });
  }

  /**
   * Screen-space picking. With a few hundred markers this is faster and far
   * more predictable than raycasting against point sprites, and it lets the hit
   * radius follow the drawn size of each marker.
   */
  pick(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const camDir = this.camera.position.clone().normalize();
    const v = new THREE.Vector3();
    let best = null;
    let bestD = Infinity;

    for (let i = 0; i < this.events.length; i++) {
      const p = this.positions[i];
      if (this.offGlobe[i]) {
        // Out in space: only genuinely occluded when it is behind the planet
        // *and* inside its silhouette, which is what the depth buffer draws too.
        const along = p.dot(camDir);
        if (along < 0 && Math.sqrt(Math.max(0, p.lengthSq() - along * along)) < 1) continue;
      } else if (p.dot(camDir) < 0.02) {
        continue; // far side of the globe
      }
      v.copy(p).project(this.camera);
      if (v.z > 1) continue;
      const sx = ((v.x + 1) / 2) * rect.width;
      const sy = ((1 - v.y) / 2) * rect.height;
      const d = Math.hypot(sx - x, sy - y);
      const e = this.events[i];
      const radius = clamp(9 + e.severity / 9, 10, 20);
      if (d < radius && d < bestD) {
        bestD = d;
        best = { event: e, sx, sy };
      }
    }
    // Markers win ties: an asteroid drawn across the face of the Sun is still
    // the thing the cursor was aimed at.
    return best || this._pickSun(x, y, rect);
  }

  /**
   * The Sun is one object 26 units out rather than a marker on the sphere, so
   * it gets its own test: project the centre, measure the disc in pixels from
   * a point offset along the camera's right axis, and allow a generous ring of
   * corona around it because a 19-pixel disc is a mean target on a laptop
   * trackpad and an unusable one on a phone.
   */
  _pickSun(x, y, rect) {
    const centre = this.sun.position;
    // Occlusion: does the line from the camera to the Sun pass through Earth?
    const toSun = centre.clone().sub(this.camera.position);
    const dist = toSun.length();
    const dir = toSun.divideScalar(dist);
    const t = -this.camera.position.dot(dir);
    if (t > 0 && t < dist) {
      const closest = this.camera.position.clone().addScaledVector(dir, t).length();
      if (closest < R) return null;
    }

    const toScreen = (v) => {
      const p = v.clone().project(this.camera);
      return { x: ((p.x + 1) / 2) * rect.width, y: ((1 - p.y) / 2) * rect.height, z: p.z };
    };
    const c = toScreen(centre);
    if (c.z > 1) return null;
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const edge = toScreen(centre.clone().addScaledVector(right, (SUN_PLANE / 2) * SUN_DISC));
    const discPx = Math.hypot(edge.x - c.x, edge.y - c.y);
    const hitPx = Math.max(22, discPx * 2.6);
    if (Math.hypot(c.x - x, c.y - y) > hitPx) return null;
    return { sun: true, sx: c.x, sy: c.y };
  }

  /**
   * Is the Sun currently on screen and clear of the Earth? Same occlusion test
   * the picker uses, so "visible" here means exactly "clickable". The 0.92 keeps
   * it off the very edge of the frame, where a disc is technically on screen and
   * practically invisible.
   */
  sunVisible() {
    const centre = this.sun.position;
    const toSun = centre.clone().sub(this.camera.position);
    const dist = toSun.length();
    const dir = toSun.divideScalar(dist);
    const t = -this.camera.position.dot(dir);
    if (t > 0 && t < dist && this.camera.position.clone().addScaledVector(dir, t).length() < R) return false;
    const proj = centre.clone().project(this.camera);
    return proj.z < 1 && Math.abs(proj.x) < 0.92 && Math.abs(proj.y) < 0.92;
  }

  /* ---------------- camera ---------------- */

  /**
   * Fly to somewhere the Sun can actually be seen.
   *
   * The camera orbits the Earth looking inward, and the Sun sits 26 radii out.
   * From anywhere on the daylit side the Sun is therefore *behind* the camera —
   * you are between it and the planet. It only comes into frame from the night
   * side, where you look back past the dark Earth towards it, and there it is
   * hidden by the planet unless you step off the anti-solar point far enough
   * for it to clear the limb. That is the backlit, eclipse-like view, and it is
   * the honest one: the Sun is behind the Earth from here.
   *
   * The numbers are that geometry solved. At 5.4 radii the Earth spans 10.7° of
   * the view; 19° off the anti-solar point puts the Sun at about 15.5°, clear
   * of the limb by 5° and inside the frame on any window shape. West of the
   * anti-solar meridian, so the Sun rises on the left where the detail panel
   * will not sit on top of it.
   */
  flyToSun(now = new Date()) {
    const s = subsolarPoint(now);
    this.flyTo(-s.lat, s.lon + 161, 5.4, 1900);
  }

  flyTo(lat, lon, distance = 2.2, ms = 1400) {
    const target = latLonToVec3(lat, lon, distance);
    const from = this.camera.position.clone();
    const to = new THREE.Vector3(target.x, target.y, target.z);
    const t0 = performance.now();
    this.controls.autoRotate = false;
    this._tween = () => {
      const k = clamp((performance.now() - t0) / ms, 0, 1);
      // Ease, and slerp so the camera arcs over the surface instead of cutting
      // through the planet on long moves.
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      const a = from.clone().normalize();
      const b = to.clone().normalize();
      const dot = clamp(a.dot(b), -1, 1);
      const omega = Math.acos(dot);
      let dir;
      if (omega < 1e-3) dir = b;
      else {
        const s = Math.sin(omega);
        dir = a.multiplyScalar(Math.sin((1 - e) * omega) / s).add(b.multiplyScalar(Math.sin(e * omega) / s)).normalize();
      }
      const dist = from.length() * (1 - e) + to.length() * e;
      this.camera.position.copy(dir.multiplyScalar(dist));
      this.controls.update();
      if (k >= 1) this._tween = null;
    };
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    this.camera.aspect = aspect;

    // A perspective camera's FOV is vertical, so on a tall phone screen the
    // horizontal field collapses and the planet overflows the sides — you get
    // an ocean close-up instead of a globe. Below square, widen the vertical
    // FOV until the horizontal one is back at its landscape value. Capped at
    // 74° because past that the limb distorts badly.
    const BASE = 38;
    this.camera.fov =
      aspect >= 1
        ? BASE
        : Math.min(74, (2 * Math.atan(Math.tan((BASE * Math.PI) / 360) / aspect) * 180) / Math.PI);
    // The sidebar is an opaque panel over the left of the canvas, so a globe
    // centred in the viewport has its western limb permanently hidden behind it.
    // Shifting the frustum right by half the sidebar width centres the planet in
    // the visible area instead. Measured off the element rather than keyed to a
    // breakpoint, so it stays correct at every width — and when the sidebar drops
    // to a full-width bottom sheet it stops covering the canvas, so the shift goes.
    const el = document.getElementById('sidebar');
    const sbw = el ? parseFloat(getComputedStyle(el).width) || 0 : 0;
    const shift = sbw && sbw < w * 0.9 ? Math.round(sbw / 2) : 0;
    if (shift) this.camera.setViewOffset(w, h, -shift, 0, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    // Markers scale with the viewport so they stay the same size *relative to
    // the globe* rather than the same size in pixels — a marker that reads well
    // on a laptop should not turn into a speck on a 4K display. The shader
    // computes aSize * uScale / distance, so at the default 3.1-unit camera
    // distance an aSize of 10 lands at roughly 8 CSS pixels.
    this.markerUniforms.uScale.value = h * 0.0026;
  }

  _frame() {
    const t = this.clock.getElapsedTime();
    this.markerUniforms.uTime.value = t;

    if (this._tween) this._tween();
    this.controls.update();

    this.earthUniforms.uCameraPos.value.copy(this.camera.position);

    const sun = subsolarPoint(new Date());
    const sv = latLonToVec3(sun.lat, sun.lon, 1);
    this.earthUniforms.uSunDir.value.set(sv.x, sv.y, sv.z);

    this.sunDir.set(sv.x, sv.y, sv.z);
    this.sun.position.copy(this.sunDir).multiplyScalar(SUN_DIST);
    // Billboard: copying the camera's orientation is exact and free, where
    // lookAt would roll the plane whenever the camera passed over a pole.
    this.sun.quaternion.copy(this.camera.quaternion);
    this.sunUniforms.uTime.value = t;

    if (this._targetAltMix != null) {
      const cur = this.earthUniforms.uAltMix.value;
      const next = cur + (this._targetAltMix - cur) * 0.06;
      this.earthUniforms.uAltMix.value = Math.abs(next - this._targetAltMix) < 0.002 ? this._targetAltMix : next;
    }

    if (this.selectionRing.visible) {
      const s = 1 + Math.sin(t * 2.4) * 0.14;
      this.selectionRing.userData.pulse.scale.setScalar(s);
      this.selectionRing.userData.pulse.material.opacity = 0.42 - (s - 1) * 1.2;
    }

    if (this._pendingHover) {
      const { x, y } = this._pendingHover;
      this._pendingHover = null;
      const hit = this.pick(x, y);
      const key = hit ? (hit.sun ? 'sun' : hit.event.id) : null;
      if (key !== this._hoverKey) {
        this._hoverKey = key;
        this.canvas.style.cursor = hit ? 'pointer' : 'grab';
        this.onHover?.(hit);
      }
    }

    this.renderer.render(this.scene, this.camera);
  }
}
