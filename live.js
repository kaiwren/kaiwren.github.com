// Live theme: "Against the Fall of Night". A figure on a terracotta plain under
// seven suns that rise and set on their own arcs, each throwing its own coloured
// shadow. Scrolling down the page is the fall of night: the arcs sink, fewer suns
// rise, and the stars come out. Rendered as gaussian splats; loaded lazily by
// index.html on capable devices.
(function () {
  'use strict';

  // amp/offset shape each sun's arc (altitude = amp * cos(angle) + offset);
  // suns cross the sky left to right at different speeds, so they overtake each other
  const SUNS = [
    { colour: [1.0, 0.95, 0.86], amp: 0.85, offset: 0.06, period: 150, phase: -0.35, size: 1.3 },
    { colour: [1.0, 0.72, 0.11], amp: 0.78, offset: 0.0, period: 110, phase: 0.55, size: 1.0 },
    { colour: [0.18, 0.9, 0.35], amp: 0.62, offset: -0.04, period: 95, phase: -1.2, size: 0.85 },
    { colour: [0.1, 0.85, 0.85], amp: 0.9, offset: -0.14, period: 132, phase: 1.35, size: 0.9 },
    { colour: [0.12, 0.31, 1.0], amp: 0.7, offset: 0.1, period: 175, phase: -2.1, size: 1.1 },
    { colour: [0.6, 0.32, 1.0], amp: 0.56, offset: -0.06, period: 88, phase: 2.6, size: 0.75 },
    { colour: [1.0, 0.18, 0.7], amp: 0.82, offset: -0.02, period: 122, phase: -1.65, size: 0.95 }
  ];
  const HORIZON = 0.64;   // fraction of viewport height

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

  // Sky and plain. uSun[i] = (x, y, altitude); light rises and falls with the suns
  const BG_VS = `#version 300 es
  layout(location=0) in vec2 aQuad;
  out vec2 vP;
  void main() { vP = aQuad * 0.5 + 0.5; vP.y = 1.0 - vP.y; gl_Position = vec4(aQuad, 0.0, 1.0); }`;

  const BG_FS = `#version 300 es
  precision highp float;
  in vec2 vP;
  uniform vec2 uRes;
  uniform float uLight;
  uniform float uTime;
  uniform vec3 uSun[7];
  uniform vec3 uSunCol[7];
  out vec4 o;
  ${NOISE}
  void main() {
    float h = ${HORIZON.toFixed(2)};
    vec2 px = vP * uRes;
    float hy = h * uRes.y;
    vec3 col;
    float L = uLight;
    if (vP.y < h) {
      float t = vP.y / h;
      vec3 dayTop = vec3(0.68, 0.22, 0.10), dayLow = vec3(0.92, 0.45, 0.21);
      vec3 duskTop = vec3(0.30, 0.09, 0.10), duskLow = vec3(0.62, 0.22, 0.13);
      vec3 nightTop = vec3(0.07, 0.04, 0.09), nightLow = vec3(0.20, 0.08, 0.10);
      vec3 day = mix(dayTop, dayLow, t * t);
      vec3 dusk = mix(duskTop, duskLow, t * t);
      vec3 night = mix(nightTop, nightLow, t * t);
      col = L > 0.5 ? mix(dusk, day, (L - 0.5) * 2.0) : mix(night, dusk, L * 2.0);
    } else {
      float t = (vP.y - h) / (1.0 - h);
      vec3 day = mix(vec3(0.86, 0.38, 0.18), vec3(0.76, 0.28, 0.13), t);
      vec3 dusk = mix(vec3(0.46, 0.16, 0.10), vec3(0.36, 0.12, 0.08), t);
      vec3 night = mix(vec3(0.18, 0.07, 0.06), vec3(0.13, 0.05, 0.04), t);
      col = L > 0.5 ? mix(dusk, day, (L - 0.5) * 2.0) : mix(night, dusk, L * 2.0);
      col *= 0.94 + 0.08 * fbm(vec2(px.x * 0.004, px.y * 0.02 / (t + 0.05)));
    }
    for (int i = 0; i < 7; i++) {
      vec3 s = uSun[i];
      vec3 c = uSunCol[i];
      // A halo in the sun's own colour
      vec2 d = px - s.xy;
      float up = smoothstep(-0.04, 0.05, s.z);
      col += c * exp(-dot(d, d) / (uRes.y * uRes.y * 0.02)) * 0.16 * up;
      // Dawn and dusk: a low sun floods the horizon with its colour, sky and plain alike
      float low = smoothstep(-0.16, 0.0, s.z) * (1.0 - smoothstep(0.05, 0.3, s.z));
      float dx = (px.x - s.x) / (uRes.x * 0.28);
      float dy = (px.y - hy) / (uRes.y * (px.y < hy ? 0.16 : 0.07));
      col += c * exp(-dx * dx - dy * dy) * low * 0.55;
    }
    // The horizon: a confident ink line
    float line = 1.0 - smoothstep(0.0, 1.4, abs(px.y - hy));
    col = mix(col, vec3(0.14, 0.04, 0.02), line * 0.75);
    o = vec4(col, 1.0);
  }`;

  const VS = `#version 300 es
  precision highp float;
  layout(location=0) in vec2 aQuad;
  layout(location=1) in vec4 aSeed;   // randoms
  layout(location=2) in vec4 aKind;   // kind, sun index, size, aspect or hardness
  layout(location=3) in vec4 aColor;  // rgb, alpha (negative = adds light)
  uniform float uTime;
  uniform vec2 uRes;
  uniform float uLight;
  uniform vec3 uSun[7];
  uniform vec2 uFoot;
  uniform sampler2D uMask;
  out vec2 vUv;
  out vec4 vCol;
  out float vHard;
  out float vSky;
  ${NOISE}

  void main() {
    float H = uRes.y, W = uRes.x;
    float horizon = ${HORIZON.toFixed(2)} * H;
    int si = int(aKind.y);
    vec3 sun = uSun[si];
    float up = smoothstep(-0.04, 0.03, sun.z);
    vec2 pos; vec2 tang = vec2(1.0, 0.0);
    float alpha = abs(aColor.a);
    float len = aKind.z, wid = aKind.z;
    float kind = aKind.x;
    vHard = 0.0;
    vSky = 0.0;
    vec3 rgb = aColor.rgb;

    if (kind < 0.5) {
      // Sun disc, glow and halo. Low suns swell and warm, like ours do.
      float lowness = 1.0 - smoothstep(0.0, 0.35, sun.z);
      pos = sun.xy;
      len = wid = aKind.z * (1.0 + 0.35 * lowness);
      rgb = mix(rgb, rgb * vec3(1.0, 0.82, 0.7) + vec3(0.08, 0.0, 0.0), lowness * 0.5 * step(0.5, aKind.w));
      alpha *= up;
      vHard = aKind.w;
      vSky = 1.0;
    } else if (kind < 1.5) {
      // A living corona: soft splats drifting round the disc on fBm
      float ang = aSeed.x * 6.283 + uTime * 0.05 * (aSeed.w - 0.5);
      float n = fbm(vec2(ang * 2.0, uTime * 0.25 + float(si) * 7.0));
      pos = sun.xy + vec2(cos(ang), sin(ang)) * aKind.z * (0.55 + 0.9 * n * aSeed.y);
      len = wid = aKind.z * (0.25 + 0.35 * aSeed.z);
      alpha *= up * n;
      vSky = 1.0;
    } else if (kind < 2.5) {
      // Shadow: thrown away from its sun, long and flat when the sun is low
      float elev = max(sun.z, 0.012);
      float side = (uFoot.x - sun.x) / W;
      vec2 dir = normalize(vec2(side * 2.4, 0.18 + 0.9 * elev));
      float L = clamp(0.045 * H / elev, 16.0, 0.75 * W);
      float t = aSeed.x;
      vec2 nrm = vec2(-dir.y, dir.x);
      float taper = mix(3.2, 11.0, t);
      pos = uFoot + dir * t * L + nrm * (aSeed.y - 0.5) * taper;
      tang = dir;
      len = max(6.0, L * 0.06); wid = taper * 0.45;
      float sunUp = smoothstep(0.0, 0.03, sun.z);
      alpha *= sunUp * (1.0 - t) * (0.55 + 0.45 * smoothstep(0.0, 0.25, sun.z));
    } else if (kind < 3.5) {
      // Stars, out when the suns are down
      pos = vec2(aSeed.x * W, aSeed.y * horizon * 0.98);
      float tw = 0.6 + 0.4 * sin(uTime * (1.0 + aSeed.w * 3.0) + aSeed.z * 40.0);
      alpha *= (1.0 - smoothstep(0.08, 0.45, uLight)) * tw;
      vSky = 1.0;
    } else {
      // Dust hanging in the air near the figure, lit by whichever sun is nearest
      vec2 home = uFoot + vec2((aSeed.x - 0.5) * 0.5 * W, -aSeed.y * 0.28 * H);
      vec2 drift = vec2(fbm(vec2(aSeed.z * 9.0, uTime * 0.05)) - 0.5, fbm(vec2(uTime * 0.04, aSeed.w * 9.0)) - 0.5);
      pos = home + drift * 90.0;
      float best = 0.0;
      for (int i = 0; i < 7; i++) {
        float lit = smoothstep(0.0, 0.2, uSun[i].z) * exp(-abs(uSun[i].x - pos.x) / (0.35 * W));
        if (lit > best) { best = lit; rgb = vec3(0.0); }
      }
      vec3 acc = vec3(0.0); float tot = 0.001;
      for (int i = 0; i < 7; i++) {
        float lit = smoothstep(0.0, 0.2, uSun[i].z) * exp(-abs(uSun[i].x - pos.x) / (0.35 * W));
        tot += lit;
      }
      rgb = aColor.rgb;
      alpha *= clamp(tot, 0.0, 1.0) * (0.5 + 0.5 * sin(uTime * 0.7 + aSeed.z * 30.0));
      vSky = pos.y < horizon ? 1.0 : 0.0;
    }

    // Text stays readable: suns dim behind it, everything else gives way entirely
    float m = texture(uMask, pos / uRes).r;
    alpha *= 1.0 - smoothstep(0.1, 0.5, m) * (kind < 1.5 ? 0.6 : 1.0);

    if (alpha < 0.003) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    vec2 nrm2 = vec2(-tang.y, tang.x);
    vec2 corner = pos + tang * aQuad.x * len + nrm2 * aQuad.y * wid;
    gl_Position = vec4(corner.x / W * 2.0 - 1.0, 1.0 - corner.y / H * 2.0, 0.0, 1.0);
    vUv = aQuad;
    vCol = vec4(rgb, aColor.a < 0.0 ? -alpha : alpha);
  }`;

  const FS = `#version 300 es
  precision mediump float;
  in vec2 vUv;
  in vec4 vCol;
  in float vHard;
  in float vSky;
  uniform float uHorizonDev;
  out vec4 o;
  void main() {
    // Anything in the sky is cut cleanly by the horizon, so a setting sun sinks behind it
    if (vSky > 0.5 && gl_FragCoord.y < uHorizonDev) discard;
    float r2 = dot(vUv, vUv);
    float soft = exp(-4.5 * r2);
    float disc = 1.0 - smoothstep(0.2, 0.3, r2);
    float add = step(vCol.a, 0.0);
    float a = mix(soft, disc, step(0.5, vHard)) * abs(vCol.a);
    if (a < 0.003) discard;
    o = vec4(vCol.rgb * a, a * (1.0 - add));
  }`;

  // A small figure seen from behind: white, with an ink contour
  const FIGURE_SVG = `<svg viewBox="0 0 20 52" xmlns="http://www.w3.org/2000/svg">
    <circle cx="10" cy="5.2" r="3.5" fill="#fff6e8" stroke="#2a0f06" stroke-width="0.8"/>
    <path d="M6.3 10.4 Q10 8.9 13.7 10.4 L14.8 25 L13.2 25.4 L12.8 49 L10.7 49 L10 31 L9.3 49 L7.2 49 L6.8 25.4 L5.2 25 Z"
          fill="#fff6e8" stroke="#2a0f06" stroke-width="0.8" stroke-linejoin="round"/>
  </svg>`;

  let state = null;
  const rand = Math.random;

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  function program(gl, vs, fs, names) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    names.forEach(n => { u[n] = gl.getUniformLocation(p, n); });
    return { p, u };
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

  function buildInstances() {
    const k = innerWidth < 700 ? 0.65 : 1;
    const out = [];
    const push = (seed, kind, color) => out.push(...seed, ...kind, ...color);
    SUNS.forEach((sun, i) => {
      const c = sun.colour, r = 22 * sun.size * k;
      push([0, 0, 0, 0], [0, i, r * 3.2, 0], [...c, -0.42]);           // glow, adds light
      push([0, 0, 0, 0], [0, i, r, 1], [...c, 0.97]);                  // the disc itself
      push([0, 0, 0, 0], [0, i, r * 0.55, 0], [1, 0.98, 0.93, -0.55]); // hot centre
      for (let j = 0; j < 140; j++) push([rand(), rand(), rand(), rand()], [1, i, r * 1.6, 0], [...c, -(0.05 + rand() * 0.08)]);
      for (let j = 0; j < 1600; j++) push([Math.pow(rand(), 0.85), rand(), rand(), rand()], [2, i, 0, 0], [...c.map(x => x * 0.9), 0.07 + rand() * 0.1]);
    });
    for (let j = 0; j < 1600; j++) {
      const tint = SUNS[1 + Math.floor(rand() * 6)].colour.map(x => 0.75 + x * 0.25);
      push([rand(), rand(), rand(), rand()], [3, 0, (1 + rand() * rand() * 3.5) * k, 0], [...tint, -(0.4 + rand() * 0.6)]);
    }
    for (let j = 0; j < 260; j++) {
      push([rand(), rand(), rand(), rand()], [4, 0, (1.2 + rand() * 2.2) * k, 0], [1, 0.93, 0.78, -(0.25 + rand() * 0.35)]);
    }
    return new Float32Array(out);
  }

  function upload(s) {
    const gl = s.gl;
    const data = buildInstances();
    gl.bindVertexArray(s.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, s.inst);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const stride = 12 * 4;
    for (let loc = 1; loc <= 3; loc++) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, stride, (loc - 1) * 16);
      gl.vertexAttribDivisor(loc, 1);
    }
    s.count = data.length / 12;
    s.rects = textRects();
    s.maskDirty = true;
  }

  function drawMask(s) {
    const mc = s.maskCanvas, ctx = s.maskCtx, k = 0.25;
    mc.width = Math.ceil(innerWidth * k);
    mc.height = Math.ceil(innerHeight * k);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, mc.width, mc.height);
    ctx.fillStyle = '#fff';
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = 18 * k;
    for (const [x, y, w, h] of s.rects) {
      const vy = y - scrollY;
      if (vy + h < -40 || vy > innerHeight + 40) continue;
      ctx.fillRect((x - 6) * k, (vy - 6) * k, (w + 12) * k, (h + 12) * k);
    }
    const gl = s.gl;
    gl.bindTexture(gl.TEXTURE_2D, s.maskTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, mc);
  }

  function layout(s) {
    const narrow = innerWidth < 700;
    s.dpr = Math.min(devicePixelRatio || 1, narrow ? 1.5 : 2);
    s.canvas.width = Math.round(innerWidth * s.dpr);
    s.canvas.height = Math.round(innerHeight * s.dpr);
    s.gl.viewport(0, 0, s.canvas.width, s.canvas.height);
    const h = narrow ? 30 : 46;
    s.foot = [innerWidth * (narrow ? 0.14 : 0.2), innerHeight * HORIZON + (narrow ? 26 : 44)];
    Object.assign(s.figure.style, {
      height: h + 'px', width: (h * 20 / 52) + 'px',
      left: (s.foot[0] - h * 10 / 52) + 'px', top: (s.foot[1] - h * 49 / 52) + 'px'
    });
  }

  // Each sun rides its own arc across one shared sky. Night (from scrolling)
  // lowers every arc, so fewer suns clear the horizon.
  function sunPositions(time, night) {
    const W = innerWidth, H = innerHeight;
    const horizon = H * HORIZON;
    const pos = new Float32Array(21), col = new Float32Array(21);
    let light = 0;
    const rim = [0, 0, 0];
    let rimW = 0;
    SUNS.forEach((sun, i) => {
      const a = time / sun.period * Math.PI * 2 + sun.phase;
      const alt = sun.amp * Math.cos(a) + sun.offset - night * 1.15;
      pos[i * 3] = W * 0.6 + W * 0.62 * Math.sin(a);
      pos[i * 3 + 1] = horizon - alt * horizon * 0.9;
      pos[i * 3 + 2] = alt;
      col.set(sun.colour, i * 3);
      light += Math.max(0, Math.min(1, (alt + 0.06) / 0.35)) * 0.32;
      const low = Math.max(0, 1 - Math.abs(alt - 0.06) / 0.2);
      for (let c = 0; c < 3; c++) rim[c] += sun.colour[c] * low;
      rimW += low;
    });
    return { pos, col, light: Math.min(1, light), rim: rimW > 0.05 ? rim.map(c => c / rimW) : null, rimW };
  }

  function frame(now) {
    const s = state;
    if (!s) return;
    const gl = s.gl;
    if (s.lastScroll !== scrollY || s.maskDirty) { s.lastScroll = scrollY; s.maskDirty = false; drawMask(s); }

    // Performance guard: if it can't hold ~40fps, freeze into a still
    if (s.last) {
      s.frames.push(now - s.last);
      if (s.frames.length === 90) {
        if (s.frames.slice().sort((a, b) => a - b)[45] > 24) s.frozen = true;
        s.frames = [];
      }
    }
    s.last = now;

    const time = (now - s.t0) / 1000 + s.timeOffset;
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    s.night += (Math.min(1, scrollY / max) - s.night) * 0.06;
    const sky = sunPositions(time, s.night);
    s.light += (sky.light - s.light) * 0.05;

    gl.useProgram(s.bg.p);
    gl.uniform2f(s.bg.u.uRes, innerWidth, innerHeight);
    gl.uniform1f(s.bg.u.uLight, s.light);
    gl.uniform1f(s.bg.u.uTime, time);
    gl.uniform3fv(s.bg.u['uSun[0]'], sky.pos);
    gl.uniform3fv(s.bg.u['uSunCol[0]'], sky.col);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(s.bgVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(s.sp.p);
    const u = s.sp.u;
    gl.uniform1f(u.uTime, time);
    gl.uniform2f(u.uRes, innerWidth, innerHeight);
    gl.uniform1f(u.uLight, s.light);
    gl.uniform3fv(u['uSun[0]'], sky.pos);
    gl.uniform2f(u.uFoot, s.foot[0], s.foot[1]);
    gl.uniform1f(u.uHorizonDev, s.canvas.height * (1 - HORIZON));
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, s.maskTex);
    gl.uniform1i(u.uMask, 0);
    gl.bindVertexArray(s.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, s.count);

    // Rim light: the figure picks up the colour of whichever suns are low
    if (sky.rim) {
      const [r, g, b] = sky.rim.map(c => Math.round(c * 255));
      const a = Math.min(0.9, sky.rimW * 0.7).toFixed(2);
      s.figure.style.filter = `drop-shadow(0 0 2px rgba(${r},${g},${b},${a})) drop-shadow(0 0 6px rgba(${r},${g},${b},${(a * 0.5).toFixed(2)}))`;
    } else {
      s.figure.style.filter = 'none';
    }
    s.figure.style.opacity = String(0.55 + 0.45 * Math.min(1, s.light * 1.6));
    if (!s.frozen && !document.hidden) s.raf = requestAnimationFrame(frame);
  }

  function start() {
    if (state) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'live-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.prepend(canvas);
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, antialias: false, alpha: false });
    if (!gl) { canvas.remove(); return; }

    const figure = document.createElement('div');
    figure.className = 'live-figure';
    figure.setAttribute('aria-hidden', 'true');
    figure.innerHTML = FIGURE_SVG;
    document.body.prepend(figure);

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const bgVao = gl.createVertexArray();
    gl.bindVertexArray(bgVao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const maskTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, maskTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const maskCanvas = document.createElement('canvas');
    state = {
      gl, canvas, figure, vao, bgVao, maskTex, maskCanvas,
      inst: gl.createBuffer(),
      maskCtx: maskCanvas.getContext('2d'),
      bg: program(gl, BG_VS, BG_FS, ['uRes', 'uLight', 'uTime', 'uSun[0]', 'uSunCol[0]']),
      sp: program(gl, VS, FS, ['uTime', 'uRes', 'uLight', 'uSun[0]', 'uFoot', 'uMask', 'uHorizonDev']),
      t0: performance.now(), timeOffset: 0, frames: [], frozen: false, last: 0, night: 0, light: 0.8
    };
    const s = state;
    layout(s);
    upload(s);

    s.onResize = () => { layout(s); upload(s); };
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
    s.figure.remove();
    state = null;
  }

  // Exposed for tuning from the console: KaiwrenLive.seek(seconds) jumps the sky
  function seek(seconds) { if (state) state.timeOffset = seconds - (performance.now() - state.t0) / 1000; }

  window.KaiwrenLive = { start, stop, seek };
})();
