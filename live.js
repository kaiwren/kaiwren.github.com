// Live theme: a full-spectrum force of gaussian splats on a terracotta ground.
// The "hello." screen gets one big band; each "historically." entry gets a
// stratum in the margins, coloured by era. Everything flows around the text,
// never over it. Loaded lazily by index.html only on capable devices.
(function () {
  'use strict';

  const PALETTE = {
    yellow: [1.0, 0.72, 0.11],
    green: [0.18, 0.9, 0.35],
    cobalt: [0.12, 0.31, 1.0],
    magenta: [1.0, 0.18, 0.7],
    hot: [1.0, 0.96, 0.84]
  };
  // Recent years carry the whole spectrum; older years cool toward cobalt
  const ERA_WEIGHTS = [
    { from: 2022, weights: { yellow: 0.32, green: 0.3, cobalt: 0.2, magenta: 0.18 } },
    { from: 2016, weights: { green: 0.45, cobalt: 0.35, yellow: 0.12, magenta: 0.08 } },
    { from: 0, weights: { cobalt: 0.55, magenta: 0.3, green: 0.15 } }
  ];

  const VS = `#version 300 es
  precision highp float;
  layout(location=0) in vec2 aQuad;
  layout(location=1) in vec4 aSeed;   // u, v, phase, speed
  layout(location=2) in vec4 aKind;   // kind, entry, side, size
  layout(location=3) in vec4 aColor;  // rgb, alpha
  layout(location=4) in vec4 aLine;   // left, right, y, intensity
  uniform float uTime;
  uniform vec2 uRes;
  uniform float uScroll;
  uniform vec2 uMouse;
  uniform float uMouseOn;
  uniform float uHover;
  uniform float uBandH;
  uniform float uNarrow;
  uniform sampler2D uMask;
  out vec2 vUv;
  out vec4 vCol;

  vec2 bez(float t, vec2 a, vec2 b, vec2 c, vec2 d) {
    float s = 1.0 - t;
    return s*s*s*a + 3.0*s*s*t*b + 3.0*s*t*t*c + t*t*t*d;
  }

  float mask(vec2 page) {
    vec2 uv = vec2(page.x / uRes.x, (page.y - uScroll) / uRes.y);
    return texture(uMask, uv).r;
  }

  void main() {
    float W = uRes.x;
    float H = uBandH;
    vec2 pos; vec2 tang; float alpha = aColor.a; float len; float wid;
    float kind = aKind.x;

    if (kind < 1.5) {
      // Band (kind 0) and its haze (kind 1): a sweep from bottom-left to top-right
      float u = fract(aSeed.x + uTime * 0.010 * aSeed.w);
      vec2 A = vec2(-0.25*W, 1.02*H), B = vec2(0.30*W, 0.95*H);
      vec2 C = vec2(0.55*W, 0.05*H), D = vec2(1.25*W, -0.10*H);
      pos = bez(u, A, B, C, D);
      tang = normalize(bez(u + 0.002, A, B, C, D) - pos);
      vec2 nrm = vec2(-tang.y, tang.x);
      float width = max(0.10 * W, 90.0) * (0.8 + 0.25 * sin(u * 7.0 + uTime * 0.23));
      float v = aSeed.y + 0.22 * sin(u * 38.0 + aSeed.z * 6.283 + uTime * 0.5);
      pos += nrm * v * width;
      pos += vec2(sin(pos.y * 0.011 + uTime * 0.31 + aSeed.z * 3.0),
                  cos(pos.x * 0.009 - uTime * 0.27 + aSeed.z * 2.0)) * 14.0;
      tang = normalize(tang + nrm * 0.18 * sin(aSeed.z * 40.0 + uTime * 0.4));
      alpha *= smoothstep(0.0, 0.10, u) * smoothstep(1.0, 0.88, u);
      len = aKind.w; wid = aKind.w * (kind < 0.5 ? 0.16 : 0.7);
    } else {
      // Strata (kind 2): one per entry, reaching from the screen edge toward its line
      float side = aKind.z;
      float hov = 1.0 - step(0.5, abs(aKind.y - uHover));
      float gap = mix(26.0, 6.0, hov);
      float bank = side > 0.0 ? aLine.y + gap : aLine.x - gap;
      float room = side > 0.0 ? W - bank : bank;
      float reach = room * mix(0.35 + 0.6 * aLine.w, 1.0, hov) + 20.0;
      float t = fract(aSeed.x + uTime * 0.035 * aSeed.w);
      float e = 1.0 - pow(1.0 - t, 2.2);
      float x = bank + side * reach * (1.0 - e);
      float y = aLine.z + aSeed.y * mix(6.0, 9.0, hov) + sin(x * 0.02 + uTime * 0.9 + aSeed.z * 6.283) * 3.0;
      pos = vec2(x, y);
      tang = normalize(vec2(-side, 0.06 * sin(aSeed.z * 20.0 + uTime)));
      alpha *= pow(sin(3.14159 * t), 0.6) * (0.55 + 0.45 * aLine.w) * mix(1.0, 2.2, hov);
      alpha *= mix(1.0, 0.45, uNarrow);
      len = aKind.w * mix(1.0, 1.5, hov); wid = aKind.w * 0.18;
    }

    // Cursor: the force leans toward you, but never touches
    vec2 d = pos - uMouse;
    float r = length(d) + 0.001;
    float R = 220.0;
    if (uMouseOn > 0.5 && r < R) {
      float nr = max(30.0, r - (R - r) * 0.4);
      pos = uMouse + d / r * nr;
    }

    // Text is a riverbank: push splats down the mask gradient, then fade whatever is left
    float m = mask(pos);
    if (m > 0.01) {
      float ex = 6.0;
      vec2 g = vec2(mask(pos + vec2(ex, 0.0)) - mask(pos - vec2(ex, 0.0)),
                    mask(pos + vec2(0.0, ex)) - mask(pos - vec2(0.0, ex)));
      float gl = length(g);
      if (gl > 0.0001) pos -= g / gl * m * 46.0;
      alpha *= 1.0 - smoothstep(0.12, 0.55, mask(pos)) * mix(1.0, 0.75, uNarrow);
    }

    float sy = pos.y - uScroll;
    if (alpha < 0.003 || sy < -200.0 || sy > uRes.y + 200.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }
    vec2 nrm2 = vec2(-tang.y, tang.x);
    vec2 corner = pos + tang * aQuad.x * len + nrm2 * aQuad.y * wid;
    gl_Position = vec4(corner.x / W * 2.0 - 1.0, 1.0 - (corner.y - uScroll) / uRes.y * 2.0, 0.0, 1.0);
    vUv = aQuad;
    vCol = vec4(aColor.rgb, alpha);
  }`;

  const FS = `#version 300 es
  precision mediump float;
  in vec2 vUv;
  in vec4 vCol;
  out vec4 o;
  void main() {
    float a = exp(-4.5 * dot(vUv, vUv)) * vCol.a;
    if (a < 0.003) discard;
    o = vec4(vCol.rgb * a, a);
  }`;

  let state = null;

  function rand() { return Math.random(); }
  function gauss() {
    let u = 0, v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function pick(weights) {
    let r = rand(), last = null;
    for (const k in weights) { last = k; r -= weights[k]; if (r <= 0) return PALETTE[k]; }
    return PALETTE[last];
  }
  function bandColour(v) {
    // Stratified across the band: yellow-orange edge, green, cobalt, a magenta thread
    const j = v + gauss() * 0.25;
    if (rand() < 0.05) return PALETTE.hot;
    if (Math.abs(j - 0.55) < 0.12 && rand() < 0.8) return PALETTE.magenta;
    if (j < -0.7) return rand() < 0.6 ? PALETTE.yellow : PALETTE.green;
    if (j < 0.15) return rand() < 0.75 ? PALETTE.green : PALETTE.yellow;
    return rand() < 0.85 ? PALETTE.cobalt : PALETTE.magenta;
  }

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  function collectEntries() {
    const items = Array.from(document.querySelectorAll('ul.items > li'));
    const counts = {};
    const entries = items.map(li => {
      const m = li.textContent.match(/\((\d{4})\//);
      const year = m ? parseInt(m[1], 10) : 2000;
      counts[year] = (counts[year] || 0) + 1;
      return { li, year };
    });
    const max = Math.max(...Object.values(counts));
    entries.forEach(e => { e.intensity = counts[e.year] / max; });
    return entries;
  }

  // Tight per-line text rects in page coordinates, so the bank follows ragged lines
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

  function lineOf(li) {
    const range = document.createRange();
    range.selectNodeContents(li.querySelector('a') || li);
    const rs = Array.from(range.getClientRects()).filter(r => r.width > 0);
    if (!rs.length) return null;
    const left = Math.min(...rs.map(r => r.left));
    const right = Math.max(...rs.map(r => r.right));
    const top = Math.min(...rs.map(r => r.top));
    const bottom = Math.max(...rs.map(r => r.bottom));
    return [left, right, (top + bottom) / 2 + scrollY];
  }

  function buildInstances(s) {
    const W = innerWidth;
    const narrow = W < 700;
    const scale = narrow ? 0.5 : 1;
    const out = [];
    const push = (seed, kind, color, line) => out.push(...seed, ...kind, ...color, ...line);

    const bandN = Math.round(42000 * scale);
    for (let i = 0; i < bandN; i++) {
      const v = Math.max(-2.2, Math.min(2.2, gauss() * 0.8));
      const c = bandColour(v);
      const a = (0.10 + rand() * 0.22) * (1 - Math.min(1, Math.abs(v) / 2.4));
      const size = (narrow ? 0.7 : 1) * (8 + rand() * rand() * 46);
      push([rand(), v, rand(), 0.6 + rand() * 0.8], [0, -1, 0, size], [...c, c === PALETTE.hot ? a * 1.4 : a], [0, 0, 0, 0]);
    }
    const hazeN = Math.round(1400 * scale);
    for (let i = 0; i < hazeN; i++) {
      const v = gauss() * 0.7;
      const c = bandColour(v);
      push([rand(), v, rand(), 0.6 + rand() * 0.8], [1, -1, 0, 60 + rand() * 120], [...c, 0.03 + rand() * 0.04], [0, 0, 0, 0]);
    }

    s.entries.forEach((e, idx) => {
      const line = lineOf(e.li);
      if (!line) return;
      const era = ERA_WEIGHTS.find(w => e.year >= w.from).weights;
      const n = Math.round((140 + 260 * e.intensity) * scale);
      for (let i = 0; i < n; i++) {
        const c = rand() < 0.04 ? PALETTE.hot : pick(era);
        const side = rand() < 0.5 ? -1 : 1;
        push([rand(), gauss() * 0.6, rand(), 0.5 + rand()], [2, idx, side, 6 + rand() * rand() * 30],
          [...c, 0.12 + rand() * 0.25], [line[0], line[1], line[2], e.intensity]);
      }
    });

    // Shuffle so unsorted alpha blending mixes colours evenly
    const stride = 16;
    const count = out.length / stride;
    const data = new Float32Array(out);
    for (let i = count - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      for (let k = 0; k < stride; k++) {
        const t = data[i * stride + k];
        data[i * stride + k] = data[j * stride + k];
        data[j * stride + k] = t;
      }
    }
    return { data, count };
  }

  function upload(s) {
    const gl = s.gl;
    const { data, count } = buildInstances(s);
    gl.bindVertexArray(s.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, s.inst);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const stride = 16 * 4;
    for (let loc = 1; loc <= 4; loc++) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, stride, (loc - 1) * 16);
      gl.vertexAttribDivisor(loc, 1);
    }
    s.count = count;
    s.drawCount = count;
    s.rects = textRects();
    s.bandH = innerHeight;
    s.maskDirty = true;
  }

  function drawMask(s) {
    const mc = s.maskCanvas, ctx = s.maskCtx;
    const k = 0.25;
    mc.width = Math.ceil(innerWidth * k);
    mc.height = Math.ceil(innerHeight * k);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, mc.width, mc.height);
    ctx.fillStyle = '#fff';
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = 22 * k;
    const pad = 8;
    for (const [x, y, w, h] of s.rects) {
      const vy = y - scrollY;
      if (vy + h < -60 || vy > innerHeight + 60) continue;
      ctx.fillRect((x - pad) * k, (vy - pad) * k, (w + pad * 2) * k, (h + pad * 2) * k);
    }
    const gl = s.gl;
    gl.bindTexture(gl.TEXTURE_2D, s.maskTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, mc);
    s.maskDirty = false;
  }

  function resize(s) {
    const dpr = Math.min(devicePixelRatio || 1, innerWidth < 700 ? 1.5 : 2);
    s.canvas.width = Math.round(innerWidth * dpr);
    s.canvas.height = Math.round(innerHeight * dpr);
    s.gl.viewport(0, 0, s.canvas.width, s.canvas.height);
  }

  function frame(now) {
    const s = state;
    if (!s) return;
    const gl = s.gl;
    if (s.maskDirty || s.lastScroll !== scrollY) { s.lastScroll = scrollY; drawMask(s); }

    // Performance guard: halve the splats once if slow, then freeze into a still
    if (s.last) {
      s.frames.push(now - s.last);
      if (s.frames.length === 90) {
        const sorted = s.frames.slice().sort((a, b) => a - b);
        const median = sorted[45];
        if (median > 24) {
          if (s.drawCount === s.count) s.drawCount = Math.floor(s.count / 2);
          else s.frozen = true;
        }
        s.frames = [];
      }
    }
    s.last = now;

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(s.prog);
    const u = s.uniforms;
    gl.uniform1f(u.uTime, (now - s.t0) / 1000);
    gl.uniform2f(u.uRes, innerWidth, innerHeight);
    gl.uniform1f(u.uScroll, scrollY);
    gl.uniform2f(u.uMouse, s.mouse[0], s.mouse[1] + scrollY);
    gl.uniform1f(u.uMouseOn, s.mouseOn ? 1 : 0);
    gl.uniform1f(u.uHover, s.hover);
    gl.uniform1f(u.uBandH, s.bandH);
    gl.uniform1f(u.uNarrow, innerWidth < 700 ? 1 : 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, s.maskTex);
    gl.uniform1i(u.uMask, 0);
    gl.bindVertexArray(s.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, s.drawCount);

    if (!s.frozen && !document.hidden) s.raf = requestAnimationFrame(frame);
  }

  // "(2026/10/02) title": wrap the date so the theme can set it back from the title
  function wrapDates() {
    document.querySelectorAll('ul.items > li > a').forEach(a => {
      const t = a.firstChild;
      if (!t || t.nodeType !== 3) return;
      const m = t.nodeValue.match(/^(\s*)(\(\d{4}\/\d{2}\/\d{2}\))/);
      if (!m) return;
      const span = document.createElement('span');
      span.className = 'date';
      span.textContent = m[2];
      t.nodeValue = t.nodeValue.slice(m[0].length);
      a.insertBefore(span, t);
      a.insertBefore(document.createTextNode(' '), t);
    });
  }

  function start() {
    if (state) return;
    wrapDates();
    const canvas = document.createElement('canvas');
    canvas.className = 'live-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.prepend(canvas);
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, antialias: false, alpha: true });
    if (!gl) { canvas.remove(); return; }

    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));

    const uniforms = {};
    ['uTime', 'uRes', 'uScroll', 'uMouse', 'uMouseOn', 'uHover', 'uBandH', 'uNarrow', 'uMask']
      .forEach(n => { uniforms[n] = gl.getUniformLocation(prog, n); });

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const inst = gl.createBuffer();

    const maskTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, maskTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const maskCanvas = document.createElement('canvas');
    state = {
      gl, canvas, prog, uniforms, vao, inst, maskTex, maskCanvas,
      maskCtx: maskCanvas.getContext('2d'),
      entries: collectEntries(),
      mouse: [-9999, -9999], mouseOn: false, hover: -1,
      t0: performance.now(), frames: [], frozen: false, last: 0
    };
    const s = state;
    resize(s);
    upload(s);

    s.onMove = e => { s.mouse = [e.clientX, e.clientY]; s.mouseOn = true; };
    s.onLeave = () => { s.mouseOn = false; };
    s.onResize = () => { resize(s); upload(s); };
    s.onVisible = () => { if (!document.hidden && !s.frozen) { s.last = 0; s.raf = requestAnimationFrame(frame); } };
    s.onOver = e => {
      const li = e.target.closest && e.target.closest('ul.items > li');
      s.hover = li ? s.entries.findIndex(en => en.li === li) : -1;
    };
    addEventListener('pointermove', s.onMove, { passive: true });
    addEventListener('pointerdown', s.onMove, { passive: true });
    document.addEventListener('pointerleave', s.onLeave);
    addEventListener('resize', s.onResize);
    document.addEventListener('visibilitychange', s.onVisible);
    document.addEventListener('pointerover', s.onOver);
    // Fonts shift the line boxes, so rebuild once they settle
    if (document.fonts) document.fonts.ready.then(() => state === s && upload(s));

    s.raf = requestAnimationFrame(frame);
  }

  function stop() {
    const s = state;
    if (!s) return;
    cancelAnimationFrame(s.raf);
    removeEventListener('pointermove', s.onMove);
    removeEventListener('pointerdown', s.onMove);
    document.removeEventListener('pointerleave', s.onLeave);
    removeEventListener('resize', s.onResize);
    document.removeEventListener('visibilitychange', s.onVisible);
    document.removeEventListener('pointerover', s.onOver);
    const ext = s.gl.getExtension('WEBGL_lose_context');
    if (ext) ext.loseContext();
    s.canvas.remove();
    state = null;
  }

  window.KaiwrenLive = { start, stop };
})();
