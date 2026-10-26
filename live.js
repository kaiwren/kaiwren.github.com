// Seven Suns: one celestial clock, seven lights, one quiet landscape.
// Scroll turns the day. The sky, haze, stone and shadows share the same lights.
// Locally hosted CC0 ground scan; no particle simulation or rendering framework.
(function () {
  'use strict';

  const SLOW_KEY = 'liveSlow:seven-suns-2';
  const SUNS = [
    { offset: 0, declination: 0, colour: [1, 0.92, 0.80], power: 1.35, radius: 0.019 },
    { offset: 0.38, declination: -0.095, colour: [1, 0.25, 0.10], power: 0.62, radius: 0.009 },
    { offset: -0.32, declination: 0.105, colour: [1, 0.64, 0.20], power: 0.66, radius: 0.010 },
    { offset: 0.78, declination: 0.075, colour: [0.27, 0.49, 1], power: 0.72, radius: 0.011 },
    { offset: -0.76, declination: -0.045, colour: [0.35, 0.78, 0.48], power: 0.43, radius: 0.007 },
    { offset: 1.16, declination: -0.13, colour: [0.68, 0.42, 0.92], power: 0.47, radius: 0.008 },
    { offset: -1.12, declination: 0.16, colour: [0.25, 0.72, 0.76], power: 0.44, radius: 0.008 }
  ];

  const VS = `#version 300 es
  layout(location=0) in vec2 aQuad;
  out vec2 vUv;
  void main() { vUv = aQuad * 0.5 + 0.5; gl_Position = vec4(aQuad, 0.0, 1.0); }`;

  const FS = `#version 300 es
  precision highp float;
  in vec2 vUv;
  uniform vec2 uRes;
  uniform vec2 uBuffer;
  uniform float uTime;
  uniform float uDay;
  uniform float uPortrait;
  uniform vec3 uLight[7];
  uniform vec3 uEnergy[7];
  uniform float uRadius[7];
  uniform vec2 uMouse;
  uniform float uLens;
  uniform sampler2D uMask;
  uniform sampler2D uGroundColour;
  uniform sampler2D uGroundRelief;
  uniform float uMaterialReady;
  out vec4 o;
  const float PI = 3.14159265359;

  // Hoskins hash avoids the sin precision artifacts of some mobile GPUs.
  float hash(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * 0.1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
  }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
               mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float n = 0.0, a = 0.5;
    mat2 turn = mat2(0.8, -0.6, 0.6, 0.8);
    for (int i = 0; i < 4; i++) {
      n += noise(p) * a;
      p = turn * p * 2.04 + vec2(3.7, 8.2);
      a *= 0.5;
    }
    return n;
  }

  // A panoramic camera gives portrait its own field of view, without squashing
  // a desktop canvas. The ground and sky use this same projection.
  vec3 ray(vec2 px) {
    float az = (px.x / uRes.x - 0.5) * mix(2.55, 2.18, uPortrait);
    float horizon = mix(0.66, 0.69, uPortrait) * uRes.y;
    float el = atan((horizon - px.y) / (uRes.y * 0.65));
    return vec3(sin(az) * cos(el), sin(el), -cos(az) * cos(el));
  }

  vec3 atmosphere(vec3 d, bool discs) {
    float az = atan(d.x, -d.z);
    float el = asin(clamp(d.y, -1.0, 1.0));
    float weather = uTime * 0.010 + uDay * 0.65;
    // Two cloud decks in world space: the long sightline near the horizon
    // compresses distant structure, while nearby filaments pass overhead.
    // Portrait uses the same layers with its established panoramic framing.
    vec2 horizonPoint = d.xz / max(d.y + 0.20, 0.08);
    horizonPoint.x *= mix(1.0, 0.54, uPortrait);
    vec2 p = horizonPoint * 1.45 + vec2(weather, weather * 0.24);
    float warp = fbm(p * 0.32 + 8.2);
    float body = fbm(p * vec2(1.0, 1.55) + warp * 1.7);
    float detail = fbm(p * 4.2 - vec2(weather * 0.22, 1.7));
    float cloud = smoothstep(0.39, 0.67, body - (1.0 - detail) * 0.12);
    float thin = fbm(horizonPoint * vec2(1.8, 5.5) + vec2(-weather * 0.38, 7.4));
    float filaments = smoothstep(0.46, 0.74, thin) * 0.32;
    float depth = 1.0 / (max(d.y, 0.0) + 0.25);
    float optical = (cloud * 0.68 + filaments * 0.25) * min(depth, 2.4);
    float transmission = exp(-optical);
    float horizon = exp(-max(d.y, 0.0) * 5.0);
    vec3 col = mix(vec3(0.006, 0.012, 0.021), vec3(0.036, 0.037, 0.040), horizon);
    // Density gradients give the cloud a lit face and a shaded underside.
    float ex = 0.12;
    vec2 grad = vec2(noise(p + vec2(ex, 0)) - noise(p - vec2(ex, 0)),
                     noise(p + vec2(0, ex)) - noise(p - vec2(0, ex)));
    vec3 cloudNormal = normalize(vec3(-grad.x * 2.0, -0.34, -grad.y * 2.0));
    vec3 cloudLight = vec3(0.014, 0.019, 0.028);
    for (int i = 0; i < 7; i++) {
      float c = clamp(dot(d, uLight[i]), -1.0, 1.0);
      float angle = length(d - uLight[i]);
      // Forward scattering belongs to the air, and is strongest along a sun's
      // direction. The cloud itself mostly scatters a quieter, broader light.
      float mieBase = 1.0 + 0.72 * 0.72 - 2.0 * 0.72 * c;
      float mie = (1.0 - 0.72 * 0.72) / pow(mieBase, 1.5);
      float broad = 0.010 * mie * (0.38 + horizon * 0.18);
      float aureole = exp(-angle * 12.0) * 0.055;
      col += uEnergy[i] * (broad + aureole);
      float face = dot(cloudNormal, uLight[i]) * 0.5 + 0.5;
      float silver = pow(max(c, 0.0), 12.0) * (0.12 + filaments);
      float shade = 0.38 + face * 0.62;
      cloudLight += uEnergy[i] * (shade * 0.025 + silver * 0.11);
      if (discs) {
        // Use projected pixel distance for circular suns in either camera frame.
        float sunAz = atan(uLight[i].x, -uLight[i].z);
        float sunEl = asin(uLight[i].y);
        vec2 sunPx = vec2((sunAz / mix(2.55, 2.18, uPortrait) + 0.5) * uRes.x,
          mix(0.66, 0.69, uPortrait) * uRes.y - tan(sunEl) * uRes.y * 0.65);
        vec2 pointPx = vec2((az / mix(2.55, 2.18, uPortrait) + 0.5) * uRes.x,
          mix(0.66, 0.69, uPortrait) * uRes.y - tan(el) * uRes.y * 0.65);
        float radius = uRadius[i] * uRes.y * 0.65 / max(0.3, cos(sunEl) * cos(sunEl));
        radius = min(radius, i == 0 ? 14.0 : 7.0);
        float r = length(pointPx - sunPx);
        float aa = max(0.65, uRes.y / uBuffer.y);
        float disc = 1.0 - smoothstep(radius - aa, radius + aa, r);
        float limb = sqrt(max(0.0, 1.0 - pow(r / max(radius, 0.1), 2.0)));
        float envelope = exp(-r * r / max(1.0, radius * radius * 5.0));
        float sunTransmission = exp(-optical * 0.8);
        vec3 core = mix(normalize(uEnergy[i] + 0.001), vec3(1.0, 0.97, 0.90), i == 0 ? 0.88 : 0.48);
        float risen = smoothstep(-0.035, 0.035, uLight[i].y);
        col += (core * disc * (0.42 + limb * 2.20) + uEnergy[i] * (envelope * 0.30 + exp(-r / max(radius, 1.0)) * 0.18)) * sunTransmission * risen;
      }
    }
    col = col * transmission + cloudLight * (1.0 - transmission);
    // Sparse distant stars are part of the sky. Lensing samples them and the
    // haze together; there are no independent particles to shove around.
    vec2 st = vec2(az, el) * 220.0;
    vec2 cell = floor(st);
    vec2 at = vec2(hash(cell), hash(cell + 41.7));
    float star = (1.0 - smoothstep(0.03, 0.16, length(fract(st) - at))) * step(0.991, hash(cell + 9.1));
    col += vec3(0.32, 0.37, 0.43) * star * exp(-cloud * 3.0) * smoothstep(0.08, 0.4, d.y);
    return col;
  }

  // Cylinder geometry and its seven projected shadows share the same position.
  vec4 pillar() { return mix(vec4(-11.0, -11.5, 0.16, 1.75), vec4(-12.4, -10.5, 0.18, 1.75), uPortrait); }

  float visibility(vec3 p, vec3 light, float radius) {
    vec4 col = pillar();
    float horizontal = dot(light.xz, light.xz);
    float along = dot(col.xy - p.xz, light.xz) / max(horizontal, 0.0001);
    if (along < 0.0 || light.y < 0.0) return 1.0;
    float height = p.y + along * light.y;
    float width = col.z + max(0.0, along) * radius * 0.6;
    float dist = length(p.xz + along * light.xz - col.xy);
    float penumbra = max(0.025, along * radius * 0.8);
    float body = 1.0 - smoothstep(width - penumbra, width + penumbra, dist);
    float end = 1.0 - smoothstep(col.w - penumbra, col.w + penumbra, height);
    return 1.0 - body * end;
  }


  // A four-metre photogrammetry tile. Trilinear mipmaps and anisotropic sampling
  // preserve gravel and cracks at grazing angles without distant shimmer.
  vec2 groundUV(vec3 p) { return p.xz * vec2(0.25, -0.25); }
  vec4 relief(vec2 uv, vec2 dx, vec2 dy) { return textureGrad(uGroundRelief, uv, dx, dy); }
  vec2 surfaceUV(vec3 p, vec3 d, vec2 dx, vec2 dy) {
    vec2 uv = groundUV(p);
    float depth = 0.010 * exp(-length(p.xz) * 0.015) * uMaterialReady;
    vec2 travel = d.xz * vec2(1.0, -1.0) / max(-d.y, 0.10) * depth;
    vec2 at = uv - travel;
    float layer = 0.0, stepSize = 1.0 / 10.0;
    float height = 1.0 - relief(at, dx, dy).a;
    vec2 previous = at;
    float previousHeight = height;
    for (int j = 0; j < 10; j++) {
      if (layer >= height) break;
      previous = at; previousHeight = height;
      at += travel * stepSize;
      layer += stepSize;
      height = 1.0 - relief(at, dx, dy).a;
    }
    float after = height - layer;
    float before = previousHeight - (layer - stepSize);
    return mix(at, previous, clamp(after / min(after - before, -0.0001), 0.0, 1.0));
  }

  // A rough dielectric BRDF: each sun can catch the stone's curved edge, while
  // the body remains matte. No painted highlight that stays fixed as day moves.
  vec3 specular(vec3 n, vec3 view, vec3 light, float roughness) {
    vec3 h = normalize(view + light);
    float nv = max(dot(n, view), 0.001), nl = max(dot(n, light), 0.0);
    float nh = max(dot(n, h), 0.0), vh = max(dot(view, h), 0.0);
    float a = roughness * roughness, a2 = a * a;
    float denominator = nh * nh * (a2 - 1.0) + 1.0;
    float distribution = a2 / max(PI * denominator * denominator, 0.00001);
    float k = (roughness + 1.0) * (roughness + 1.0) / 8.0;
    float geometry = nv / (nv * (1.0 - k) + k) * nl / (nl * (1.0 - k) + k);
    vec3 fresnel = vec3(0.035) + vec3(0.965) * pow(1.0 - vh, 5.0);
    return fresnel * distribution * geometry / max(4.0 * nv, 0.001);
  }

  float pillarDistance(vec3 p) {
    vec4 col = pillar();
    float bevel = 0.018;
    vec2 q = vec2(length(p.xz - col.xy) - (col.z - bevel),
                  abs(p.y - col.w * 0.5) - (col.w * 0.5 - bevel));
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - bevel;
  }

  vec3 landscape(vec3 d, vec3 sky) {
    vec3 eye = vec3(0.0, 1.35, 0.0);
    vec4 col = pillar();
    float t = d.y < -0.0001 ? -eye.y / d.y : 1e5;
    float groundT = t;
    vec3 n = vec3(0, 1, 0);
    bool stone = false;
    vec2 q = eye.xz - col.xy;
    float A = dot(d.xz, d.xz), B = dot(q, d.xz);
    float discriminant = B * B - A * (dot(q, q) - col.z * col.z);
    if (discriminant > 0.0) {
      float tc = (-B - sqrt(discriminant)) / A;
      float y = eye.y + tc * d.y;
      if (tc > 0.0 && tc < t && y > 0.0 && y < col.w) {
        t = tc; stone = true;
        n = normalize(vec3(q.x + tc * d.x, 0.0, q.y + tc * d.z));
      }
    }
    if (abs(d.y) > 0.0001) {
      float cap = (col.w - eye.y) / d.y;
      if (cap > 0.0 && cap < t && length(eye.xz + cap * d.xz - col.xy) < col.z) {
        t = cap; stone = true; n = vec3(0, 1, 0);
      }
    }
    if (t > 900.0) {
      float az = atan(d.x, -d.z);
      float ridge = 0.003 + noise(vec2(az * 9.0, 4.0)) * noise(vec2(az * 3.0, 1.0)) * 0.022;
      float edge = max(fwidth(d.y), 0.001);
      return mix(mix(sky, vec3(0.020, 0.023, 0.027), 0.50), sky, smoothstep(ridge - edge, ridge + edge, d.y));
    }
    if (stone) {
      // Refine the analytic hit against an actually rounded stone edge. This is
      // confined to the pillar's few pixels, rather than marching the whole sky.
      for (int j = 0; j < 8; j++) {
        float distance = pillarDistance(eye + d * t);
        if (distance < 0.0005) break;
        t += distance;
      }
      vec3 at = eye + d * t;
      if (pillarDistance(at) > 0.003) { stone = false; t = groundT; }
      vec2 e = vec2(0.002, 0.0);
      n = normalize(vec3(pillarDistance(at + e.xyy) - pillarDistance(at - e.xyy),
                         pillarDistance(at + e.yxy) - pillarDistance(at - e.yxy),
                         pillarDistance(at + e.yyx) - pillarDistance(at - e.yyx)));
    }
    if (!stone) n = vec3(0, 1, 0);
    vec3 p = eye + d * t;
    vec2 uv = groundUV(p), dx = dFdx(uv), dy = dFdy(uv);
    vec3 albedo;
    float ao = 1.0, roughness = 0.72;
    if (stone) {
      // Subtle mineral variation at actual stone scale, with a softly rounded
      // arris catching the light at the top. The silhouette and dimensions stay put.
      float angle = atan(n.z, n.x);
      vec2 mineral = vec2(angle * 4.0, p.y * 6.0);
      float pores = noise(mineral * 15.0);
      float vein = smoothstep(0.44, 0.51, fbm(mineral * vec2(0.7, 0.15)));
      albedo = mix(vec3(0.76, 0.75, 0.71), vec3(0.88, 0.865, 0.82), vein * 0.45) * (0.97 + 0.03 * pores);
      roughness = 0.34 + pores * 0.11;
      // Small ground bounce warms the foot; the exposed top sees cooler sky.
      ao = 0.78 + 0.22 * smoothstep(0.0, 0.22, p.y);
    } else {
      uv = surfaceUV(p, d, dx, dy);
      vec4 colourMap = textureGrad(uGroundColour, uv, dx, dy);
      vec4 normalMap = relief(uv, dx, dy);
      vec2 xy = (normalMap.rg * 2.0 - 1.0) * 0.72;
      n = normalize(vec3(xy.x, sqrt(max(0.05, 1.0 - dot(xy, xy))), -xy.y));
      albedo = mix(vec3(0.16, 0.14, 0.11), pow(colourMap.rgb, vec3(2.2)) * 1.05, uMaterialReady);
      ao = mix(1.0, 0.28 + 0.72 * normalMap.b, uMaterialReady);
      roughness = 0.78 + (1.0 - normalMap.b) * 0.16;
    }
    vec3 lit = stone ? vec3(0.43, 0.445, 0.46) : vec3(0.024, 0.030, 0.040);
    vec3 glint = vec3(0.0);
    vec3 distantAir = vec3(0.026, 0.033, 0.043);
    float shadowDensity = 0.0;
    for (int i = 0; i < 7; i++) {
      float v = stone ? 1.0 : visibility(p, uLight[i], uRadius[i]);
      float diffuse = max(dot(n, uLight[i]), 0.0);
      if (stone) lit += uEnergy[i] * (dot(n, uLight[i]) * 0.5 + 0.5) * 0.08;
      lit += uEnergy[i] * diffuse * v * 0.68;
      glint += uEnergy[i] * specular(n, -d, uLight[i], roughness) * v * (stone ? 1.0 : 0.35);
      shadowDensity += (1.0 - v) * min(length(uEnergy[i]), 1.0);
      distantAir += uEnergy[i] * 0.009;
    }
    // Modest local contrast keeps the secondary shadows visible at page exposure.
    vec3 surface = (albedo * lit * ao + glint) * exp(-shadowDensity * 0.35);
    if (!stone) {
      float contact = exp(-length(p.xz - col.xy) * 3.0);
      surface *= 1.0 - contact * 0.5;
    }
    // Air perspective joins land to sky instead of leaving a hard stage edge.
    float fog = 1.0 - exp(-t * 0.009);
    surface = mix(surface, distantAir, fog);
    float horizonFade = smoothstep(0.0, 0.024, -d.y);
    return stone ? surface : mix(sky, surface, horizonFade);
  }

  void main() {
    vec2 px = vec2(vUv.x, 1.0 - vUv.y) * uRes;
    vec3 d = ray(px);
    vec2 delta = px - uMouse;
    float r = length(delta);
    float lensRadius = min(125.0, uRes.x * 0.24);
    float falloff = 1.0 - smoothstep(lensRadius * 0.50, lensRadius, r);
    // Soft-core thin-lens mapping: bend the sampled sky, not the objects. Sources
    // passing behind the pointer form small arcs; there is no drawn lens bubble.
    float einstein = 16.0;
    vec2 bent = px - delta * (einstein * einstein / (dot(delta, delta) + 38.0)) * falloff * uLens;
    vec3 skyRay = ray(mix(px, bent, smoothstep(0.0, 0.13, d.y)));
    vec3 sky = atmosphere(skyRay, true);
    vec3 colour = landscape(d, sky);

    // A soft, low-resolution text mask is sampled in screen space AFTER lensing,
    // so letters stay still and light never creates hard line-box rectangles.
    vec2 uv = px / uRes, e = 15.0 / uRes;
    float mask = texture(uMask, uv).r * 0.28;
    mask += (texture(uMask, uv + vec2(e.x, 0)).r + texture(uMask, uv - vec2(e.x, 0)).r
           + texture(uMask, uv + vec2(0, e.y)).r + texture(uMask, uv - vec2(0, e.y)).r) * 0.12;
    mask += (texture(uMask, uv + e).r + texture(uMask, uv - e).r
           + texture(uMask, uv + vec2(e.x, -e.y)).r + texture(uMask, uv - vec2(e.x, -e.y)).r) * 0.06;
    colour *= 1.0 - mask * 0.67;
    // Gentle filmic shoulder preserves a hot sun without lifting the whole page.
    colour = 1.0 - exp(-colour * 1.35);
    colour = pow(max(colour, vec3(0)), vec3(0.85));
    vec2 v = uv - 0.5;
    colour *= 1.0 - 0.35 * dot(v, v);
    colour += (hash(px) - 0.5) / 255.0;
    o = vec4(colour, 1.0);
  }`;

  let state = null;
  const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, n));
  const smooth = (a, b, n) => { const t = clamp((n - a) / (b - a)); return t * t * (3 - 2 * t); };
  const saved = (key, value) => { try { localStorage.setItem(key, value); } catch (_) {} };
  const progress = () => clamp(scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight));

  function compile(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(message);
    }
    return shader;
  }

  function textRects() {
    const rects = [];
    const range = document.createRange();
    document.querySelectorAll('.kaiwren h1, .kaiwren a').forEach(el => {
      range.selectNodeContents(el);
      for (const r of range.getClientRects()) if (r.width && r.height) rects.push([r.left, r.top + scrollY, r.width, r.height]);
    });
    return rects;
  }

  function drawMask(s) {
    const c = s.maskCanvas, ctx = s.maskCtx, k = 0.20;
    const w = Math.ceil(innerWidth * k), h = Math.ceil(innerHeight * k);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighten';
    // Radial gradients work consistently on mobile canvas implementations.
    for (const [x, y, width, height] of s.rects) {
      const top = y - scrollY;
      if (top + height < -90 || top > innerHeight + 90) continue;
      ctx.save();
      ctx.translate((x + width / 2) * k, (top + height / 2) * k);
      ctx.scale((width / 2 + 45) * k, (height / 2 + 38) * k);
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      gradient.addColorStop(0, '#fff'); gradient.addColorStop(0.55, '#ddd'); gradient.addColorStop(1, '#000');
      ctx.fillStyle = gradient; ctx.fillRect(-1, -1, 2, 2);
      ctx.restore();
    }
    const gl = s.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, s.maskTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    s.maskDirty = false; s.lastScroll = scrollY;
  }


  function materialTexture(s, url, unit, initial) {
    const gl = s.gl, texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(initial));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
    const image = new Image();
    image.onload = () => {
      if (state !== s) return;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.generateMipmap(gl.TEXTURE_2D);
      const ext = gl.getExtension('EXT_texture_filter_anisotropic');
      if (ext) gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT,
        Math.min(8, gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
      s.materialsLoaded++;
      if (s.materialsLoaded === 2) s.materialTarget = 1;
    };
    image.src = url;
    return texture;
  }

  function layout(s) {
    // Resolve thin stone edges and foreground grains at up to 2x density.
    // Adaptive quality lowers this on slower devices before falling back.
    const dpr = Math.min(devicePixelRatio || 1, 2) * s.quality;
    s.canvas.width = Math.max(1, Math.round(innerWidth * dpr));
    s.canvas.height = Math.max(1, Math.round(innerHeight * dpr));
    s.gl.viewport(0, 0, s.canvas.width, s.canvas.height);
    s.rects = textRects(); s.maskDirty = true;
  }

  function lights(s) {
    // Over one planetary day the stellar configuration is nearly fixed. One
    // rotation of the planet moves every direction around the same tilted spin
    // axis; distinct declinations produce distinct tracks, rather than a parade.
    // This is an authored sky configuration, not a seven-body orbital solution.
    const axis = [0.10, 0.90, Math.sqrt(0.18)];
    const rotation = -(s.day * 2.30 + Math.sin(s.time * 0.045) * 0.025);
    const cosine = Math.cos(rotation), sine = Math.sin(rotation);
    SUNS.forEach((sun, i) => {
      const az = -0.60 + sun.offset;
      const el = 0.10 + 0.50 * Math.cos(az) + sun.declination;
      const initial = [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)];
      const dot = axis.reduce((sum, n, j) => sum + n * initial[j], 0);
      const cross = [axis[1] * initial[2] - axis[2] * initial[1],
        axis[2] * initial[0] - axis[0] * initial[2], axis[0] * initial[1] - axis[1] * initial[0]];
      const direction = initial.map((n, j) => n * cosine + cross[j] * sine + axis[j] * dot * (1 - cosine));
      s.directions.set(direction, i * 3);
      s.radii[i] = sun.radius;
      const air = 1 / (Math.max(direction[1], 0) + 0.15);
      const risen = smooth(-0.09, 0.08, direction[1]);
      sun.colour.forEach((c, j) => {
        s.energy[i * 3 + j] = c * sun.power * Math.exp(-[0.025, 0.045, 0.080][j] * air) * risen;
      });
    });
  }

  function frame(now) {
    const s = state;
    if (!s || document.hidden) return;
    const dt = Math.min(0.05, Math.max(0, (now - (s.last || now)) / 1000));
    const elapsed = s.last ? now - s.last : 0;
    s.last = now; s.time += dt;
    const ease = 1 - Math.exp(-dt / 0.16);
    s.day += ((s.dayOverride === null ? progress() : s.dayOverride) - s.day) * ease;
    s.lens += ((s.pointerOn ? 1 : 0) - s.lens) * (1 - Math.exp(-dt / 0.13));
    s.mouse[0] += (s.targetMouse[0] - s.mouse[0]) * (1 - Math.exp(-dt / 0.045));
    s.mouse[1] += (s.targetMouse[1] - s.mouse[1]) * (1 - Math.exp(-dt / 0.045));
    if (s.maskDirty || s.lastScroll !== scrollY) drawMask(s);
    s.materialReady += (s.materialTarget - s.materialReady) * ease;
    lights(s);
    const gl = s.gl, u = s.uniforms;
    gl.useProgram(s.program);
    gl.uniform2f(u.uRes, innerWidth, innerHeight);
    gl.uniform2f(u.uBuffer, s.canvas.width, s.canvas.height);
    gl.uniform1f(u.uTime, s.time);
    gl.uniform1f(u.uDay, s.day);
    gl.uniform1f(u.uPortrait, smooth(1.10, 0.65, innerWidth / innerHeight));
    gl.uniform3fv(u.uLight, s.directions);
    gl.uniform3fv(u.uEnergy, s.energy);
    gl.uniform1fv(u.uRadius, s.radii);
    gl.uniform2fv(u.uMouse, s.mouse);
    gl.uniform1f(u.uLens, s.lens);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, s.maskTex);
    gl.uniform1i(u.uMask, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, s.groundColour); gl.uniform1i(u.uGroundColour, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, s.groundRelief); gl.uniform1i(u.uGroundRelief, 2);
    gl.uniform1f(u.uMaterialReady, s.materialReady);
    gl.bindVertexArray(s.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Allow shader compilation to settle, then lower resolution before giving up.
    // Background tabs are excluded and the decision expires after one day.
    if (++s.warmup > 90 && elapsed > 0) {
      s.frames.push(elapsed);
      if (s.frames.length === 120) {
        const median = s.frames.slice().sort((a, b) => a - b)[60];
        if (median > 38) {
          if (s.quality > 0.60) { s.quality *= 0.75; layout(s); s.warmup = 0; }
          else { saved(SLOW_KEY, String(Date.now())); fallback(); return; }
        }
        s.frames.length = 0;
      }
    }
    s.raf = requestAnimationFrame(frame);
  }

  function wrapDates() {
    document.querySelectorAll('ul.items > li > a').forEach(a => {
      const t = a.firstChild;
      if (!t || t.nodeType !== 3) return;
      const m = t.nodeValue.match(/^(\s*)(\(\d{4}\/\d{2}\/\d{2}\))/);
      if (!m) return;
      const date = document.createElement('span'); date.className = 'date'; date.textContent = m[2];
      t.nodeValue = ' ' + t.nodeValue.slice(m[0].length);
      a.insertBefore(date, t);
    });
  }

  function fallback() {
    stop();
    if (typeof window.setTheme === 'function') window.setTheme('dark');
    else { document.documentElement.dataset.theme = 'dark'; saved('theme', 'dark'); }
  }

  function start() {
    if (state) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || (navigator.connection && navigator.connection.saveData)) { fallback(); return; }
    const canvas = document.createElement('canvas');
    canvas.className = 'live-canvas'; canvas.setAttribute('aria-hidden', 'true');
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, powerPreference: 'low-power' });
    if (!gl) { fallback(); return; }
    try {
      const vert = compile(gl, gl.VERTEX_SHADER, VS), frag = compile(gl, gl.FRAGMENT_SHADER, FS);
      const program = gl.createProgram();
      gl.attachShader(program, vert); gl.attachShader(program, frag); gl.linkProgram(program);
      gl.deleteShader(vert); gl.deleteShader(frag);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      const uniforms = {};
      ['uRes', 'uBuffer', 'uTime', 'uDay', 'uPortrait', 'uLight', 'uEnergy', 'uRadius', 'uMouse', 'uLens', 'uMask', 'uGroundColour', 'uGroundRelief', 'uMaterialReady'].forEach(n => { uniforms[n] = gl.getUniformLocation(program, n); });
      const vao = gl.createVertexArray(), quad = gl.createBuffer();
      gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      const maskTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, maskTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const maskCanvas = document.createElement('canvas');
      const s = state = {
        canvas, gl, program, uniforms, vao, quad, maskTex, maskCanvas, maskCtx: maskCanvas.getContext('2d'),
        directions: new Float32Array(21), energy: new Float32Array(21), radii: new Float32Array(7),
        materialReady: 0, materialTarget: 0, materialsLoaded: 0,
        time: 0, day: progress(), dayOverride: null, quality: 1, last: 0, frames: [], warmup: 0,
        mouse: [innerWidth / 2, innerHeight / 2], targetMouse: [innerWidth / 2, innerHeight / 2], lens: 0, pointerOn: false
      };
      s.groundColour = materialTexture(s, 'assets/live/ground-colour.webp', 1, [128, 111, 85, 255]);
      s.groundRelief = materialTexture(s, 'assets/live/ground-relief.webp', 2, [128, 128, 220, 128]);
      document.body.prepend(canvas); wrapDates(); layout(s);
      s.onMove = e => {
        if (e.pointerType !== 'mouse') return;
        if (!s.pointerOn) s.mouse = [e.clientX, e.clientY];
        s.targetMouse = [e.clientX, e.clientY]; s.pointerOn = true;
      };
      s.onLeave = () => { s.pointerOn = false; };
      s.onResize = () => layout(s);
      s.onVisibility = () => {
        cancelAnimationFrame(s.raf); s.last = 0; s.warmup = 0; s.frames.length = 0;
        if (!document.hidden) s.raf = requestAnimationFrame(frame);
      };
      s.onMotion = e => { if (e.matches) fallback(); };
      s.motion = matchMedia('(prefers-reduced-motion: reduce)');
      s.onLost = e => { e.preventDefault(); fallback(); };
      addEventListener('pointermove', s.onMove, { passive: true });
      document.documentElement.addEventListener('pointerleave', s.onLeave);
      addEventListener('blur', s.onLeave);
      addEventListener('resize', s.onResize, { passive: true });
      document.addEventListener('visibilitychange', s.onVisibility);
      s.motion.addEventListener('change', s.onMotion);
      canvas.addEventListener('webglcontextlost', s.onLost);
      if (document.fonts) document.fonts.ready.then(() => { if (state === s) { s.rects = textRects(); s.maskDirty = true; } });
      s.raf = requestAnimationFrame(frame);
    } catch (error) {
      console.warn('Live background unavailable:', error.message);
      canvas.remove(); fallback();
    }
  }

  function stop() {
    const s = state;
    if (!s) return;
    state = null; cancelAnimationFrame(s.raf);
    removeEventListener('pointermove', s.onMove);
    document.documentElement.removeEventListener('pointerleave', s.onLeave);
    removeEventListener('blur', s.onLeave); removeEventListener('resize', s.onResize);
    document.removeEventListener('visibilitychange', s.onVisibility);
    if (s.motion) s.motion.removeEventListener('change', s.onMotion);
    s.canvas.removeEventListener('webglcontextlost', s.onLost);
    s.gl.deleteBuffer(s.quad); s.gl.deleteVertexArray(s.vao);
    s.gl.deleteTexture(s.maskTex); s.gl.deleteTexture(s.groundColour); s.gl.deleteTexture(s.groundRelief); s.gl.deleteProgram(s.program);
    const ext = s.gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext();
    s.canvas.remove();
  }

  // Deterministic day/clock controls for inspecting framing and shadow motion.
  window.KaiwrenLive = {
    start, stop, state: () => state,
    day: value => { if (state) state.dayOverride = value === null ? null : clamp(value); },
    seek: seconds => { if (state) state.time = Math.max(0, seconds); }
  };
})();
