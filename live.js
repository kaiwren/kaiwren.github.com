// Live theme: "The City and the Stars" meets "The Crystal World". A day on the
// planet of the Seven Suns. All seven suns ride one road across the sky; scrolling
// the page turns the planet, so the suns move forward as you scroll down and back
// as you scroll up. Every colour comes from those seven lights and the dusty sky
// they make. There is no night. Loaded lazily by index.html on capable devices.
(function () {
  'use strict';

  const DEG = Math.PI / 180;
  const HORIZON = 0.64;          // fraction of viewport height
  const EYE = 1.7;               // camera height, metres
  const FAR = 800;               // depth range shared by the world and the splats
  const COLUMN = [4, -9, 0.42, 8];           // x, z, radius, height: a small memorial, seen whole
  const VIEW = 17;                            // camera's distance from the column: at the jungle's edge
  const PLAZA = 11;                           // radius of the marble plaza; jungle beyond
  const PLINTH = [1.6, 0.22];                    // the raised circle of worn metal: radius, height

  // The road: a great circle that sets on the horizon right of the column and
  // climbs over the top-left of the frame. phi is the angle along it from the
  // setting point; the suns move toward smaller phi.
  const SET_AZ = 30 * DEG, ROAD_TILT = 45 * DEG;
  const S = [Math.sin(SET_AZ), 0, -Math.cos(SET_AZ)];
  const B = [-Math.cos(SET_AZ) * Math.cos(ROAD_TILT), Math.sin(ROAD_TILT), -Math.sin(SET_AZ) * Math.cos(ROAD_TILT)];

  // Clarke: a pearly white giant in an envelope of gas, and coloured suns; "he could
  // pick out red, blue, gold, and green, but the other tints eluded his eye".
  // off is the place on the road relative to the white sun, in degrees.
  const SUNS = [
    { off: 0, colour: [1.0, 0.93, 0.84], power: 7.0, radius: 2.1 },
    { off: 28, colour: [1.0, 0.16, 0.06], power: 0.55, radius: 0.32 },
    { off: -22, colour: [1.0, 0.6, 0.12], power: 0.5, radius: 0.28 },
    { off: 52, colour: [0.12, 0.3, 1.0], power: 0.65, radius: 0.36 },
    { off: 80, colour: [0.15, 1.0, 0.3], power: 0.3, radius: 0.27 },
    { off: -46, hues: [0.76, 0.93], power: 0.45, radius: 0.24 },
    { off: 110, hues: [0.44, 0.56], power: 0.45, radius: 0.24 }
  ];
  const SKY_AMB = [0.42, 0.58, 0.9];   // average colour of a clear sky, for the light it throws into shade

  const NOISE = `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 w = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), w.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), w.x), w.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
    return v;
  }`;

  // uL points toward each sun; uE is what reaches the ground (colour x power x what
  // the dust lets through); uEs lights the sky, and fades more slowly below the
  // horizon, so a sun that has just set still colours the air
  const LIGHT = `
  uniform vec3 uL[7];
  uniform vec3 uE[7];
  uniform vec3 uEs[7];
  uniform float uRad[7];
  uniform vec3 uAmb;
  const float PI = 3.14159265;
  float hg(float c, float g) { float k = 1.0 + g * g - 2.0 * g * c; return (1.0 - g * g) / (4.0 * PI * k * sqrt(k)); }
  // Humid, living air, like ours: Rayleigh scattering makes the sky blue overhead
  // and pale toward the horizon, where the long path scatters every colour; water
  // haze makes a white glow around each sun. Each sun lights this sky in its own
  // colour, so a blue sun deepens it and a red one barely touches it.
  vec3 sky(vec3 d) {
    float h = max(d.y, 0.0);
    float depth = 1.0 / (h + 0.07);
    vec3 ray = 1.0 - exp(-vec3(0.17, 0.4, 1.0) * 0.33 * depth);
    float mie = 1.0 - exp(-0.1 * depth);
    vec3 col = vec3(0.0);
    for (int i = 0; i < 7; i++) {
      float c = dot(d, uL[i]);
      col += uEs[i] * (ray * 0.42 * (1.0 + c * c) + mie * (hg(c, 0.78) * 0.45 + 0.03) + hg(c, 0.97) * 0.02);
    }
    return col;
  }`;

  const QUAD_VS = `#version 300 es
  layout(location=0) in vec2 aQuad;
  out vec2 vUv;
  void main() { vUv = aQuad * 0.5 + 0.5; gl_Position = vec4(aQuad, 0.0, 1.0); }`;

  const WORLD_FS = `#version 300 es
  precision highp float;
  in vec2 vUv;
  uniform vec2 uRes;
  uniform float uF;
  uniform float uHy;
  uniform vec3 uEye;
  uniform float uYaw;
  out vec4 o;
  ${NOISE}
  ${LIGHT}
  const vec4 COL = vec4(${COLUMN.map(n => n.toFixed(2)).join(', ')});
  const vec2 PLI = vec2(${PLINTH.map(n => n.toFixed(2)).join(', ')});
  const float PLAZA = ${PLAZA.toFixed(1)};

  // How much of sun L reaches p past the column. Its shadow is sharp near the
  // base and softens with distance, by the sun's angular size.
  float visibility(vec3 p, vec3 L, float rad) {
    vec2 lxz = L.xz;
    float l2 = dot(lxz, lxz);
    if (l2 < 1e-6) return 1.0;
    float s = dot(COL.xy - p.xz, lxz) / l2;
    if (s <= 0.0 || p.y + s * L.y > COL.w) return 1.0;
    float dist = length(p.xz + s * lxz - COL.xy);
    float pen = s * sqrt(l2 + L.y * L.y) * rad * 0.0174533 + 0.02;
    return smoothstep(COL.z - pen, COL.z + pen, dist);
  }

  vec3 discs(vec3 d) {
    vec3 col = vec3(0.0);
    for (int i = 0; i < 7; i++) {
      float a = acos(clamp(dot(d, uL[i]), -1.0, 1.0)) / 0.0174533;
      float r = uRad[i];
      if (i == 0) {
        // nacreous: limb-darkened, softened by its own envelope of gas
        float u = clamp(a / r, 0.0, 1.0);
        float disc = smoothstep(1.0, 0.94, a / r) * (0.55 + 0.45 * sqrt(1.0 - u * u));
        col += uEs[i] * (disc * 14.0 + exp(-a * a / (r * r * 2.2)) * 3.0);
      } else {
        col += uEs[i] * (smoothstep(1.0, 0.6, a / r) * 60.0 + exp(-a / (r * 1.2)) * 3.0);
      }
    }
    return col;
  }

  vec3 lit(vec3 p, vec3 n, vec3 albedo, float gloss, vec3 d) {
    vec3 diff = vec3(0.0), spec = vec3(0.0);
    for (int i = 0; i < 7; i++) {
      float nl = dot(n, uL[i]);
      if (nl <= 0.0) continue;
      float v = visibility(p + n * 0.01, uL[i], uRad[i]);
      diff += uE[i] * nl * v;
      vec3 h = normalize(uL[i] - d);
      spec += uE[i] * v * pow(max(dot(n, h), 0.0), 30.0 + gloss * 300.0) * gloss;
    }
    vec3 col = albedo * (diff + uAmb) + spec;
    // worn, polished stone catches a sheen of the sky at grazing angles
    float fres = 0.03 + 0.97 * pow(1.0 - max(dot(-d, n), 0.0), 5.0);
    return col + sky(reflect(d, n)) * fres * gloss;
  }

  // White marble in slabs laid in rings around the column. Each slab is cut from a
  // different block, so its veins don't line up with its neighbours'; dirt sits in
  // the joints; cracks where roots heaved the floor
  vec3 marble(vec2 xz, out float gloss) {
    xz = COL.xy + (xz - COL.xy) * 3.3;    // pattern is authored at 3.6m slabs; these are ~1.1m
    vec2 q = xz - COL.xy;
    float r = length(q);
    float ring = r / 3.6;
    float n = max(6.0, floor(6.2832 * (floor(ring) + 0.5) * 3.6 / 3.2));
    float ang = (atan(q.y, q.x) / 6.2832 + 0.5) * n + hash(vec2(floor(ring), 3.0));
    vec2 slab = vec2(floor(ring), floor(ang));
    float h = hash(slab);
    float ca = cos(h * 6.28), sa = sin(h * 6.28);
    vec2 v = mat2(ca, sa, -sa, ca) * xz + h * 97.0;
    float aa = fwidth(xz.x) + fwidth(xz.y);
    float warp = fbm(v * 0.25);
    float vein1 = 1.0 - smoothstep(0.0, 0.018 + aa * 0.08, abs(fbm(v * vec2(0.12, 0.05) + warp * 1.6) - 0.5));
    float vein2 = 1.0 - smoothstep(0.0, 0.01 + aa * 0.12, abs(fbm(v * 0.33 + warp * 2.3 + 5.0) - 0.5));
    float cloud = fbm(v * 0.6);
    vec3 col = vec3(0.87, 0.86, 0.83) * (0.94 + 0.08 * cloud) * (0.95 + 0.07 * h);
    col = mix(col, vec3(0.42, 0.43, 0.46), vein1 * 0.6);
    col = mix(col, vec3(0.6, 0.6, 0.62), vein2 * 0.35 * smoothstep(0.4, 0.6, fbm(v * 0.08)));
    float wr = fwidth(ring), wa = fwidth(ang);
    float jr = abs(fract(ring + 0.5) - 0.5), ja = abs(fract(ang + 0.5) - 0.5);
    float joint = max(1.0 - smoothstep(0.0, 0.008 + wr, jr), 1.0 - smoothstep(0.0, 0.007 + wa, ja));
    // grime collects along the joints and fades a hand's width into the slab
    float grime = max(1.0 - smoothstep(0.0, 0.08 + wr, jr), 1.0 - smoothstep(0.0, 0.07 + wa, ja)) * fbm(xz * 1.3);
    col *= 1.0 - 0.18 * grime;
    float crack = (1.0 - smoothstep(0.0, 0.008 + aa * 0.15, abs(fbm(xz * 0.21 + 3.0) - 0.5))) * smoothstep(0.48, 0.66, fbm(xz * 0.04 + 9.0));
    col *= 1.0 - 0.6 * max(joint * 0.7, crack);
    // polish survives where feet didn't wear it away
    gloss = (0.2 + 0.35 * fbm(xz * 0.07 + 2.0)) * (1.0 - joint) * (1.0 - crack) * (1.0 - 0.5 * grime);
    return col;
  }

  void main() {
    vec2 px = vec2(vUv.x * uRes.x, (1.0 - vUv.y) * uRes.y);
    vec3 d = vec3((px.x - uRes.x * 0.5) / uF, (uHy - px.y) / uF, -1.0);
    float zPerT = 1.0 / length(d);   // view depth per unit along the ray
    d *= zPerT;
    d.xz = mat2(cos(uYaw), sin(uYaw), -sin(uYaw), cos(uYaw)) * d.xz;
    vec3 EYE = uEye;
    // trace: floor, plinth, column
    float t = 1e9;
    int mat = 0;
    vec3 n = vec3(0.0, 1.0, 0.0);
    if (d.y < 0.0) { t = -EYE.y / d.y; mat = 1; }
    vec2 q = EYE.xz - COL.xy, D = d.xz;
    float A = dot(D, D), Bq = dot(q, D);
    if (d.y < 0.0) {
      float tp = (PLI.y - EYE.y) / d.y;
      if (length(EYE.xz + tp * D - COL.xy) < PLI.x) { t = tp; mat = 3; }
    }
    float disc = Bq * Bq - A * (dot(q, q) - PLI.x * PLI.x);
    if (disc > 0.0) {
      float tc = (-Bq - sqrt(disc)) / A;
      float y = EYE.y + tc * d.y;
      if (tc > 0.0 && tc < t && y > 0.0 && y < PLI.y) { t = tc; mat = 3; vec2 nn = normalize(q + tc * D); n = vec3(nn.x, 0.0, nn.y); }
    }
    disc = Bq * Bq - A * (dot(q, q) - COL.z * COL.z);
    if (disc > 0.0) {
      float tc = (-Bq - sqrt(disc)) / A;
      float y = EYE.y + tc * d.y;
      if (tc > 0.0 && tc < t && y > 0.0 && y < COL.w) { t = tc; mat = 2; vec2 nn = normalize(q + tc * D); n = vec3(nn.x, 0.0, nn.y); }
    }

    vec3 col;
    gl_FragDepth = mat == 0 ? 1.0 : min(t * zPerT / ${FAR.toFixed(1)}, 1.0);
    if (mat == 0) {
      col = sky(d) + discs(d);
    } else {
      vec3 p = EYE + t * d;
      if (mat == 1) {
        // the jungle has crept over the plaza's ragged edge
        float r = length(p.xz - COL.xy);
        float edge = PLAZA - 2.0 * fbm(p.xz * 0.3) - 1.0 * fbm(p.xz * 1.4);
        float g;
        vec3 alb = marble(p.xz, g);
        float wild = smoothstep(edge - 0.3, edge + 0.3, r);
        vec3 floorAlb = mix(vec3(0.05, 0.09, 0.03), vec3(0.12, 0.2, 0.06), fbm(p.xz * 2.7)) * (0.7 + 0.6 * fbm(p.xz * 9.0));   // moss and leaf litter
        col = lit(p, n, mix(alb, floorAlb, wild), g * (1.0 - wild), d);
      } else if (mat == 2) {
        // snow-white stone, weathered in faint vertical streaks
        float a = atan(n.z, n.x);
        float w = fbm(vec2(a * 9.0, p.y * 0.03)) * 0.7 + fbm(vec2(a * 40.0, p.y * 0.2)) * 0.3;
        col = lit(p, n, vec3(0.92, 0.91, 0.89) * (0.9 + 0.12 * w), 0.12, d);
      } else {
        // metal worn smooth by generations of pilgrims' feet
        float w = fbm(p.xz * 0.8);
        col = lit(p, n, vec3(0.36, 0.33, 0.29) * (0.75 + 0.4 * w), 0.6 + 0.3 * w, d);
      }
      // haze: distance fades into the sky behind
      col = mix(col, sky(normalize(vec3(d.x, 0.01, d.z))), 1.0 - exp(-t / 900.0));
    }
    o = vec4(col, 1.0);
  }`;

  // Gaussian splats in the world, seen by the same camera and lit by the same suns.
  // a0: position, size (m); a1: albedo, opacity (<0 adds light instead of covering);
  // a2: kind, seed, aspect, angle; a3: normal, unused
  const SPLAT_VS = `#version 300 es
  layout(location=0) in vec2 aQuad;
  layout(location=1) in vec4 a0;
  layout(location=2) in vec4 a1;
  layout(location=3) in vec4 a2;
  layout(location=4) in vec4 a3;
  uniform vec2 uRes;
  uniform float uF;
  uniform float uHy;
  uniform vec3 uEye;
  uniform float uYaw;
  uniform float uTime;
  ${LIGHT}
  out vec2 vQ;
  out vec4 vCol;
  out float vHard;
  void main() {
    vec3 p = a0.xyz;
    vec3 v = p - uEye;
    vec3 right = vec3(cos(uYaw), 0.0, sin(uYaw)), fwd = vec3(sin(uYaw), 0.0, -cos(uYaw));
    float z = dot(v, fwd);
    if (z < 0.2) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    vec2 sc = vec2(uRes.x * 0.5 + uF * dot(v, right) / z, uHy - uF * v.y / z);
    float px = max(a0.w * uF / z, 0.6);
    float ang = a2.w;
    vec3 axis = a3.xyz;
    if (a3.w > 0.5) {
      // a piece of branch: stretch the splat along the branch as it appears on screen
      vec3 v2 = v + axis * 0.3;
      float z2 = max(dot(v2, fwd), 0.2);
      vec2 s2 = vec2(uF * dot(v2, right) / z2, -uF * v2.y / z2) - vec2(uF * dot(v, right) / z, -uF * v.y / z);
      ang = atan(s2.y, s2.x);
    }
    float ca = cos(ang), sa = sin(ang);
    vec2 corner = mat2(ca, sa, -sa, ca) * (aQuad * vec2(a2.z, 1.0)) * px * 2.5;
    sc += corner;
    gl_Position = vec4(sc.x / uRes.x * 2.0 - 1.0, 1.0 - sc.y / uRes.y * 2.0, z / ${FAR.toFixed(1)} * 2.0 - 1.0, 1.0);
    vQ = aQuad * 2.5;
    vHard = a3.w > 0.5 ? 1.0 : 0.0;

    vec3 lightIn = uAmb;
    if (a3.w > 0.5) {
      // a cylinder catches light from every side but its ends
      for (int i = 0; i < 7; i++) { float c = dot(axis, uL[i]); lightIn += uE[i] * 0.55 * sqrt(max(1.0 - c * c, 0.0)); }
    } else {
      vec3 n = normalize(axis);
      for (int i = 0; i < 7; i++) lightIn += uE[i] * max(dot(n, uL[i]) * 0.5 + 0.5, 0.0);
    }
    vec3 col = a1.rgb * lightIn;
    if (int(a2.x) == 3) {
      // a leaf is thin: with a sun behind it, light comes through, greener and brighter
      vec3 view = normalize(v);
      vec3 through = vec3(0.0);
      for (int i = 0; i < 7; i++) through += uE[i] * pow(max(dot(view, uL[i]), 0.0), 4.0);
      col += a1.rgb * vec3(1.1, 1.6, 0.7) * through * 0.9;
    }
    vec3 d = normalize(v);
    col = mix(col, sky(normalize(vec3(d.x, 0.01, d.z))), 1.0 - exp(-length(v) / 900.0));
    vCol = vec4(col, a1.a);
    // fade the last pixels of a too-small splat instead of letting it shimmer
    if (a0.w * uF / z < 0.6) vCol.a *= a0.w * uF / z / 0.6;
  }`;

  const SPLAT_FS = `#version 300 es
  precision highp float;
  in vec2 vQ;
  in vec4 vCol;
  in float vHard;
  out vec4 o;
  void main() {
    float r2 = dot(vQ, vQ);
    float g = mix(exp(-0.5 * r2), 1.0 - smoothstep(1.4, 4.0, r2), vHard);
    if (g < 0.02) discard;
    float a = abs(vCol.a) * g;
    o = vCol.a < 0.0 ? vec4(vCol.rgb * a, 0.0) : vec4(vCol.rgb * a, a);
  }`;

  // Exposure, tone map, grain, and a soft dark bank behind the text
  const POST_FS = `#version 300 es
  precision highp float;
  in vec2 vUv;
  uniform sampler2D uScene;
  uniform sampler2D uMask;
  uniform vec2 uRes;
  uniform float uTime;
  uniform float uExposure;
  out vec4 o;
  ${NOISE}
  vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
  void main() {
    vec2 px = vec2(vUv.x * uRes.x, (1.0 - vUv.y) * uRes.y);
    vec3 c = aces(texture(uScene, vUv).rgb * uExposure);
    c *= 1.0 - 0.5 * texture(uMask, vec2(vUv.x, 1.0 - vUv.y)).r;
    c = pow(c, vec3(1.0 / 2.2));
    c += (hash(px + fract(uTime) * 91.0) - 0.5) * 0.03;
    o = vec4(c, 1.0);
  }`;

  let state = null;

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  function program(gl, vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const name = gl.getActiveUniform(p, i).name;
      u[name.replace('[0]', '')] = gl.getUniformLocation(p, name);
    }
    return { p, u };
  }

  function texture(gl) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  // Tight per-line text rects in page coordinates
  function textRects() {
    const rects = [];
    const range = document.createRange();
    document.querySelectorAll('.kaiwren h1, .kaiwren a').forEach(el => {
      range.selectNodeContents(el);
      for (const r of range.getClientRects()) {
        if (r.width > 0 && r.height > 0) rects.push([r.left, r.top + scrollY, r.width, r.height]);
      }
    });
    return rects;
  }

  function drawMask(s) {
    const mc = s.maskCanvas, ctx = s.maskCtx, k = 0.25;
    mc.width = Math.ceil(innerWidth * k);
    mc.height = Math.ceil(innerHeight * k);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, mc.width, mc.height);
    ctx.fillStyle = '#fff';
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = 22 * k;
    for (const [x, y, w, h] of s.rects) {
      const vy = y - scrollY;
      if (vy + h < -40 || vy > innerHeight + 40) continue;
      ctx.fillRect((x - 8) * k, (vy - 6) * k, (w + 16) * k, (h + 12) * k);
    }
    const gl = s.gl;
    gl.bindTexture(gl.TEXTURE_2D, s.maskTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, mc);
  }

  function smooth(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

  function hsv(h, sat, v) {
    const f = n => { const k = (n + h * 6) % 6; return v - v * sat * Math.max(0, Math.min(k, 4 - k, 1)); };
    return [f(5), f(3), f(1)];
  }

  function road(phi) {
    const c = Math.cos(phi), s = Math.sin(phi);
    return [c * S[0] + s * B[0], c * S[1] + s * B[1], c * S[2] + s * B[2]];
  }

  // Where each sun is on the road, and how much of its light gets through the dust
  function lights(day, time) {
    const L = new Float32Array(21), E = new Float32Array(21), Es = new Float32Array(21), rad = new Float32Array(7);
    const amb = [0, 0, 0];
    let lum = 0;
    SUNS.forEach((sun, i) => {
      const dir = road(day + sun.off * DEG);
      L.set(dir, i * 3);
      rad[i] = sun.radius;
      const colour = sun.colour || hsv(sun.hues[0] + (sun.hues[1] - sun.hues[0]) * (0.5 + 0.5 * Math.sin(time * 0.05 + i)), 0.85, 1);
      const y = dir[1];
      const air = Math.min(1 / (Math.max(y, 0) + 0.06), 16);
      const ground = smooth(-0.012, 0.02, y), skyFade = smooth(-0.2, 0.03, y);
      const tau = [0.02, 0.05, 0.12];   // air takes blue first, so low suns turn gold and red
      for (let c = 0; c < 3; c++) {
        const t = Math.exp(-tau[c] * air);
        E[i * 3 + c] = colour[c] * sun.power * t * ground;
        Es[i * 3 + c] = colour[c] * sun.power * t * skyFade;
        amb[c] += Es[i * 3 + c] * SKY_AMB[c] * 0.3 * (0.25 + Math.max(y, 0));
      }
      lum += (0.2126 * E[i * 3] + 0.7152 * E[i * 3 + 1] + 0.0722 * E[i * 3 + 2]) * (0.3 + Math.max(y, 0));
    });
    lum += 0.2126 * amb[0] + 0.7152 * amb[1] + 0.0722 * amb[2];
    return { L, E, Es, rad, amb, lum };
  }

  function setLight(gl, u, sky) {
    gl.uniform3fv(u.uL, sky.L);
    gl.uniform3fv(u.uE, sky.E);
    gl.uniform3fv(u.uEs, sky.Es);
    gl.uniform1fv(u.uRad, sky.rad);
    gl.uniform3fv(u.uAmb, sky.amb);
  }

  // Seeded, so the forest grows the same on every visit
  let seed = 1;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  const norm = v => { const l = Math.hypot(...v) || 1; return v.map(x => x / l); };
  const add = (a, b, k = 1) => a.map((x, i) => x + b[i] * k);

  // A tree of the living jungle, partly turned to crystal: a tall trunk on flared
  // buttress roots, a spreading crown of branches. Each limb is a chain of splats
  // stretched along it.
  function tree(push, base, height, frost) {
    const bark = [0.16, 0.13, 0.09], ice = [0.82, 0.88, 0.92];
    const limb = (from, dir, len, r0, r1) => {
      const phase = rand() * 6.28;
      const steps = Math.max(2, Math.ceil(len / Math.max(0.06, (r0 + r1) * 0.45)));
      for (let k = 0; k < steps; k++) {
        const t = (k + 0.5) / steps, r = r0 + (r1 - r0) * t;
        const p = add(from, dir, len * t);
        const crystal = Math.max(0, Math.min(1, frost + 0.35 * Math.sin(phase + len * t * 0.9)));   // the sheath thickens and thins along a limb
        const alb = bark.map((c, i) => c + (ice[i] - c) * crystal);
        push(p, r * 0.5, alb, 1, 2, Math.max(1, len / steps / r * 0.9), 0, [...dir, 1]);
      }
      return add(from, dir, len);
    };
    // a limb wanders as it grows: a few short pieces, each turned a little
    const bough = (from, dir, len, r0, r1, wander) => {
      const pieces = 4;
      let p = from, d = dir;
      for (let k = 0; k < pieces; k++) {
        const ra = r0 + (r1 - r0) * k / pieces, rb = r0 + (r1 - r0) * (k + 1) / pieces;
        p = limb(p, d, len / pieces, ra, rb);
        d = norm(add(d, [(rand() - 0.5) * wander, (rand() - 0.5) * wander * 0.6 + 0.04, (rand() - 0.5) * wander]));
      }
      return p;
    };
    // a cluster of living leaves at a twig's end; leaves deep inside the crown get
    // less sky, so they're darker
    const crownCentre = add(base, [0, height * 0.75, 0]);
    const leaves = (at, size) => {
      const count = 110;
      for (let j = 0; j < count; j++) {
        const n = norm([rand() - 0.5, rand() - 0.3, rand() - 0.5]);
        const p = add(at, n, size * Math.cbrt(rand()));
        const out = norm(add(p, crownCentre, -1));
        // self-shadowing: leaves low in the crown or tucked behind others get far less light
        const high = Math.max(0, Math.min(1, (p[1] - base[1]) / height - 0.35)) / 0.65;
        const shade = (0.08 + 0.92 * Math.pow(rand(), 1.6)) * (0.35 + 0.65 * high);
        const g = 0.7 + rand() * 0.6;
        const alb = [0.06 * g, 0.17 * g, 0.04 * g + 0.01].map(c => c * shade);
        push(p, height * 0.006 * (0.7 + rand() * 0.6), alb, 0.92, 3, 1.8 + rand(), rand() * Math.PI, norm(add(n, out)).concat(0));
      }
    };
    const branch = (from, dir, len, r, depth) => {
      const end = bough(from, dir, len, r, r * 0.6, 0.5);
      if (depth === 0) { leaves(end, height * 0.08); return; }
      const n = 2 + Math.floor(rand() * 2);
      for (let j = 0; j < n; j++) {
        const a = rand() * Math.PI * 2;
        const d = norm(add(dir, [Math.cos(a) * 0.9, 0.35 + rand() * 0.3, Math.sin(a) * 0.9]));
        branch(add(from, dir, len * (0.5 + 0.5 * rand())), d, len * (0.55 + rand() * 0.2), r * 0.6, depth - 1);
      }
      if (depth === 1) return end;
    };
    // buttress roots flare out into the ground
    for (let j = 0; j < 5; j++) {
      const a = j / 5 * Math.PI * 2 + rand();
      limb(add(base, [0, height * 0.06, 0]), norm([Math.cos(a), -0.5, Math.sin(a)]), height * 0.09, height * 0.022, 0.03);
    }
    const lean = [(rand() - 0.5) * 0.12, 1, (rand() - 0.5) * 0.12];
    const top = bough(base, norm(lean), height * 0.62, height * 0.022, height * 0.013, 0.12);
    // live-oak crown: heavy limbs leave the trunk and spread almost level
    for (let j = 0; j < 6; j++) {
      const a = j / 6 * Math.PI * 2 + rand() * 0.8;
      const d = norm([Math.cos(a), 0.25 + rand() * 0.45, Math.sin(a)]);
      const from = add(base, norm(lean), height * (0.4 + rand() * 0.22));
      branch(from, d, height * (0.28 + rand() * 0.14), height * 0.011, 3);
    }
    return top;
  }

  function buildInstances() {
    const out = [];
    const push = (pos, size, alb, alpha, kind, aspect, angle, n) => out.push(...pos, size, ...alb, alpha, kind, rand(), aspect, angle, ...n);
    tree(push, [COLUMN[0] - 8, 0, COLUMN[1] - 16], 20, 0.3);
    return new Float32Array(out);
  }

  function upload(s) {
    const gl = s.gl;
    seed = 1;
    const data = buildInstances();
    gl.bindVertexArray(s.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, s.inst);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    for (let loc = 1; loc <= 4; loc++) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 64, (loc - 1) * 16);
      gl.vertexAttribDivisor(loc, 1);
    }
    s.count = data.length / 16;
  }

  function layout(s) {
    const gl = s.gl;
    s.dpr = Math.min(devicePixelRatio || 1, 2);
    s.canvas.width = Math.round(innerWidth * s.dpr);
    s.canvas.height = Math.round(innerHeight * s.dpr);
    s.f = Math.max(innerWidth, innerHeight * 1.25) / 2;
    s.hy = innerHeight * HORIZON;
    // Frame for any screen, phones first: turn so the suns' setting point sits at
    // three quarters of the width, then step sideways so the column stands left of it
    s.yaw = SET_AZ - Math.atan(0.25 * innerWidth / s.f);
    const colAz = s.yaw + Math.atan((0.6 - 0.5) * innerWidth / s.f);
    s.eye = [COLUMN[0] - Math.sin(colAz) * VIEW, EYE, COLUMN[1] + Math.cos(colAz) * VIEW];
    // the scene renders a little below screen resolution
    const k = s.scale * Math.min(s.dpr, 1.25);
    s.w = Math.round(innerWidth * k);
    s.h = Math.round(innerHeight * k);
    gl.bindTexture(gl.TEXTURE_2D, s.sceneTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, s.w, s.h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, s.depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, s.w, s.h);
    s.rects = textRects();
    s.maskDirty = true;
  }

  function frame(now) {
    const s = state;
    if (!s) return;
    const gl = s.gl;
    if (s.lastScroll !== scrollY || s.maskDirty) { s.lastScroll = scrollY; s.maskDirty = false; drawMask(s); }

    // Performance guard: drop resolution once, then freeze into a still
    if (s.last) {
      s.frames.push(now - s.last);
      if (s.frames.length === 90) {
        if (s.frames.slice().sort((a, b) => a - b)[45] > 24) {
          if (s.scale > 0.7) { s.scale = 0.66; layout(s); } else s.frozen = true;
        }
        s.frames = [];
      }
    }
    s.last = now;

    const time = (now - s.t0) / 1000 + s.timeOffset;
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    const target = s.dayOverride !== null ? s.dayOverride : Math.min(1, scrollY / max);
    s.scroll += (target - s.scroll) * 0.08;
    // page top: the white sun high in the top-left; page bottom: it has set and the coloured suns hold the sky
    const day = (46 - s.scroll * 76 + 1.2 * Math.sin(time * 0.07)) * DEG;
    const sky = lights(day, time);
    s.exposure += (0.85 / Math.pow(sky.lum + 0.05, 0.72) - s.exposure) * 0.05;

    gl.bindFramebuffer(gl.FRAMEBUFFER, s.fbo);
    gl.viewport(0, 0, s.w, s.h);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.ALWAYS);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.useProgram(s.world.p);
    let u = s.world.u;
    gl.uniform2f(u.uRes, innerWidth, innerHeight);
    gl.uniform1f(u.uF, s.f);
    gl.uniform1f(u.uHy, s.hy);
    gl.uniform3fv(u.uEye, s.eye);
    gl.uniform1f(u.uYaw, s.yaw);
    setLight(gl, u, sky);
    gl.bindVertexArray(s.quadVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // splats test against the world's depth but don't write it; premultiplied blending
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(s.splat.p);
    u = s.splat.u;
    gl.uniform2f(u.uRes, innerWidth, innerHeight);
    gl.uniform1f(u.uF, s.f);
    gl.uniform1f(u.uHy, s.hy);
    gl.uniform3fv(u.uEye, s.eye);
    gl.uniform1f(u.uYaw, s.yaw);
    gl.uniform1f(u.uTime, time);
    setLight(gl, u, sky);
    gl.bindVertexArray(s.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, s.count);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, s.canvas.width, s.canvas.height);
    gl.useProgram(s.post.p);
    u = s.post.u;
    gl.uniform2f(u.uRes, innerWidth, innerHeight);
    gl.uniform1f(u.uTime, time);
    gl.uniform1f(u.uExposure, s.exposure);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, s.sceneTex);
    gl.uniform1i(u.uScene, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, s.maskTex);
    gl.uniform1i(u.uMask, 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    if (!s.frozen && !document.hidden) s.raf = requestAnimationFrame(frame);
  }

  function start() {
    if (state) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'live-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false });
    if (!gl || !gl.getExtension('EXT_color_buffer_float')) return;
    document.body.prepend(canvas);

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const quadVao = gl.createVertexArray();
    gl.bindVertexArray(quadVao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const sceneTex = texture(gl);
    const depth = gl.createRenderbuffer();
    const fbo = gl.createFramebuffer();
    const maskCanvas = document.createElement('canvas');
    state = {
      gl, canvas, quadVao, vao, sceneTex, depth, fbo, maskCanvas,
      inst: gl.createBuffer(),
      maskTex: texture(gl),
      maskCtx: maskCanvas.getContext('2d'),
      world: program(gl, QUAD_VS, WORLD_FS),
      splat: program(gl, SPLAT_VS, SPLAT_FS),
      post: program(gl, QUAD_VS, POST_FS),
      t0: performance.now(), timeOffset: 0, frames: [], frozen: false, last: 0,
      scroll: 0, exposure: 0.5, scale: 1, dayOverride: null
    };
    const s = state;
    layout(s);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sceneTex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    upload(s);
    s.scroll = Math.min(1, scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight));

    s.onResize = () => layout(s);
    s.onVisible = () => { if (!document.hidden && !s.frozen) { s.last = 0; s.raf = requestAnimationFrame(frame); } };
    addEventListener('resize', s.onResize);
    document.addEventListener('visibilitychange', s.onVisible);
    if (document.fonts) document.fonts.ready.then(() => { if (state === s) { s.rects = textRects(); s.maskDirty = true; } });

    s.raf = requestAnimationFrame(frame);
  }

  function stop() {
    const s = state;
    if (!s) return;
    cancelAnimationFrame(s.raf);
    removeEventListener('resize', s.onResize);
    document.removeEventListener('visibilitychange', s.onVisible);
    const ext = s.gl.getExtension('WEBGL_lose_context');
    if (ext) ext.loseContext();
    s.canvas.remove();
    state = null;
  }

  // For tuning from the console: KaiwrenLive.day(0..1) pins the time of day
  // (null hands it back to the scroll); KaiwrenLive.seek(seconds) jumps the clock
  function day(f) { if (state) state.dayOverride = f; }
  function seek(seconds) { if (state) state.timeOffset = seconds - (performance.now() - state.t0) / 1000; }

  window.KaiwrenLive = { start, stop, seek, day, state: () => state };
})();
