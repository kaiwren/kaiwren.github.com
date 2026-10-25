// Live theme: a solargraph of Clarke's Seven Suns. A pinhole camera left open
// burns each day's sun into the film as one thin arc; here every sun sweeps the
// sky as you scroll, and each sweep stays on the film, so the page records its
// own long exposure: the further down, the more days. Colour comes only from
// the suns, the white one pearly, the coloured ones faint. Strokes flow around
// the text, never over it. Loaded lazily by index.html on capable devices.
(function () {
  'use strict';

  // amp: arc height as a fraction of the viewport (the coloured suns run lower roads);
  // lead: how far ahead of the white sun each one travels
  const SUNS = [
    { colour: [1.0, 0.94, 0.84], weight: 1.0, amp: 0.78, size: 1.0, lead: 0 },    // white, nacreous
    { colour: [1.0, 0.32, 0.16], weight: 0.34, amp: 0.62, size: 0.7, lead: 0.11 },   // red
    { colour: [1.0, 0.72, 0.28], weight: 0.34, amp: 0.70, size: 0.7, lead: -0.08 },   // gold
    { colour: [0.38, 0.55, 1.0], weight: 0.38, amp: 0.55, size: 0.75, lead: 0.2 },  // blue
    { colour: [0.40, 0.95, 0.55], weight: 0.26, amp: 0.48, size: 0.6, lead: 0.3 },  // green
    { colour: [0.78, 0.50, 1.0], weight: 0.28, amp: 0.40, size: 0.55, lead: -0.16 },  // elusive, violet
    { colour: [0.35, 0.92, 0.86], weight: 0.28, amp: 0.33, size: 0.55, lead: 0.38 }  // elusive, teal
  ];
  const DAYS = 36;         // arcs per sun on a full exposure

  const VS = `#version 300 es
  precision highp float;
  layout(location=0) in vec2 aQuad;
  layout(location=1) in vec4 aSeed;   // u along the arc, day (0..1), phase, jitter
  layout(location=2) in vec4 aKind;   // kind (0 trail, 1 sun), sun, amp, size
  layout(location=3) in vec4 aColor;  // rgb, alpha
  uniform float uTime;
  uniform vec2 uRes;
  uniform float uExposure;            // how many days are on the film (0..1)
  uniform float uSweep;               // where today's suns are on their arcs (0..1)
  uniform vec2 uMouse;
  uniform float uMouseOn;
  uniform float uNarrow;
  uniform sampler2D uMask;
  out vec2 vUv;
  out vec4 vCol;
  out float vDisc;

  // one day's road: horizon to horizon, a little higher or lower each day
  vec2 arc(float u, float amp, float day) {
    float W = uRes.x, H = uRes.y;
    float x = W * (-0.08 + 1.16 * u);
    float a = amp * (0.86 + 0.28 * day);
    return vec2(x, H * 0.97 - H * a * sin(3.14159 * u));
  }

  float mask(vec2 p) { return texture(uMask, p / uRes).r; }

  void main() {
    float kind = aKind.x;
    float day = aSeed.y;
    float alpha = aColor.a;
    vec2 pos, tang; float len, wid;

    if (kind < 0.5) {
      // a trail stroke: lies on its day's arc, drifting slowly along it like light on film
      if (day > uExposure) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
      alpha *= smoothstep(uExposure, uExposure - 0.04, day);           // the newest day develops in
      float u = fract(aSeed.x + uTime * 0.004 * (0.5 + aSeed.z));
      pos = arc(u, aKind.z, day);
      tang = normalize(arc(u + 0.002, aKind.z, day) - pos);
      vec2 nrm = vec2(-tang.y, tang.x);
      pos += nrm * aSeed.w * 2.0;
      alpha *= smoothstep(0.0, 0.06, u) * smoothstep(1.0, 0.94, u);
      alpha *= 0.65 + 0.35 * sin(u * 40.0 + aSeed.z * 6.283 + uTime * 0.6);  // shimmer
      len = aKind.w; wid = mix(1.2, 0.9, uNarrow);
    } else {
      // today's sun on the newest arc, each in its own place on the road: a glow (1) and a disc (2)
      float u = uSweep + aSeed.z;
      pos = arc(u, aKind.z, uExposure);
      tang = vec2(1.0, 0.0);
      alpha *= smoothstep(0.0, 0.05, u) * smoothstep(1.0, 0.95, u);
      len = wid = aKind.w;
    }

    // Cursor: the light leans away from you, but never touches
    vec2 d = pos - uMouse;
    float r = length(d) + 0.001;
    float R = 180.0;
    if (uMouseOn > 0.5 && r < R) pos = uMouse + d / r * max(24.0, r - (R - r) * 0.35);

    // Text is a riverbank: push strokes down the mask gradient, then fade whatever is left
    float m = mask(pos);
    if (m > 0.01) {
      float ex = 6.0;
      vec2 g = vec2(mask(pos + vec2(ex, 0.0)) - mask(pos - vec2(ex, 0.0)),
                    mask(pos + vec2(0.0, ex)) - mask(pos - vec2(0.0, ex)));
      float gl = length(g);
      if (gl > 0.0001) pos -= g / gl * m * 30.0;
      alpha *= 1.0 - smoothstep(0.1, 0.5, mask(pos));
    }

    if (alpha < 0.002) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    vec2 nrm2 = vec2(-tang.y, tang.x);
    vec2 corner = pos + tang * aQuad.x * len + nrm2 * aQuad.y * wid;
    gl_Position = vec4(corner.x / uRes.x * 2.0 - 1.0, 1.0 - corner.y / uRes.y * 2.0, 0.0, 1.0);
    vUv = aQuad;
    vCol = vec4(aColor.rgb, alpha);
    vDisc = step(1.5, kind);
  }`;

  const FS = `#version 300 es
  precision mediump float;
  in vec2 vUv;
  in vec4 vCol;
  in float vDisc;
  out vec4 o;
  void main() {
    float r2 = dot(vUv, vUv);
    // strokes and glows fall off softly; a disc has a limb
    float a = mix(exp(-3.5 * r2), 1.0 - smoothstep(0.55, 0.8, r2), vDisc) * vCol.a;
    if (a < 0.002) discard;
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

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
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

  function buildInstances() {
    const narrow = innerWidth < 700;
    const per = narrow ? 70 : 140;     // strokes per arc
    const out = [];
    const push = (seed, kind, color) => out.push(...seed, ...kind, ...color);
    SUNS.forEach((sun, i) => {
      for (let d = 0; d < DAYS; d++) {
        const day = (d + rand() * 0.6) / DAYS;
        const dayAlpha = 0.5 + 0.5 * rand();           // some days were hazier than others
        for (let k = 0; k < per * (0.5 + sun.weight * 0.5); k++) {
          push([rand(), day, rand(), gauss() * 0.6], [0, i, sun.amp, 5 + rand() * rand() * 22],
            [...sun.colour, (0.45 + 0.55 * sun.weight) * dayAlpha * (0.09 + rand() * 0.14)]);
        }
      }
      // today's sun: a wide faint glow, then the disc
      push([0, 0, sun.lead, 0], [1, i, sun.amp, 60 * sun.size], [...sun.colour, 0.18 * sun.weight + 0.05]);
      push([0, 0, sun.lead, 0], [2, i, sun.amp, 7 * sun.size], [...sun.colour, 0.9]);
    });
    return { data: new Float32Array(out), count: out.length / 12 };
  }

  function upload(s) {
    const gl = s.gl;
    const { data, count } = buildInstances();
    gl.bindVertexArray(s.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, s.inst);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const stride = 12 * 4;
    for (let loc = 1; loc <= 3; loc++) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, stride, (loc - 1) * 16);
      gl.vertexAttribDivisor(loc, 1);
    }
    s.count = count;
    s.drawCount = count;
    s.rects = textRects();
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
    // scroll is time: the exposure grows down the page, and each screen of scroll is one sweep of the suns
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    const p = Math.min(1, scrollY / max);
    gl.uniform1f(u.uTime, (now - s.t0) / 1000);
    gl.uniform2f(u.uRes, innerWidth, innerHeight);
    gl.uniform1f(u.uExposure, 0.22 + 0.78 * p);
    gl.uniform1f(u.uSweep, (scrollY / innerHeight * 0.5 + 0.35 + (now - s.t0) / 1000 * 0.002) % 1);
    gl.uniform2f(u.uMouse, s.mouse[0], s.mouse[1]);
    gl.uniform1f(u.uMouseOn, s.mouseOn ? 1 : 0);
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
    ['uTime', 'uRes', 'uExposure', 'uSweep', 'uMouse', 'uMouseOn', 'uNarrow', 'uMask']
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
    gl.blendFunc(gl.ONE, gl.ONE);   // light on film adds up

    const maskCanvas = document.createElement('canvas');
    state = {
      gl, canvas, prog, uniforms, vao, inst, maskTex, maskCanvas,
      maskCtx: maskCanvas.getContext('2d'),
      mouse: [-9999, -9999], mouseOn: false,
      t0: performance.now(), frames: [], frozen: false, last: 0
    };
    const s = state;
    resize(s);
    upload(s);

    s.onMove = e => { s.mouse = [e.clientX, e.clientY]; s.mouseOn = true; };
    s.onLeave = () => { s.mouseOn = false; };
    s.onResize = () => { resize(s); upload(s); };
    s.onVisible = () => { if (!document.hidden && !s.frozen) { s.last = 0; s.raf = requestAnimationFrame(frame); } };
    addEventListener('pointermove', s.onMove, { passive: true });
    addEventListener('pointerdown', s.onMove, { passive: true });
    document.addEventListener('pointerleave', s.onLeave);
    addEventListener('resize', s.onResize);
    document.addEventListener('visibilitychange', s.onVisible);
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
    const ext = s.gl.getExtension('WEBGL_lose_context');
    if (ext) ext.loseContext();
    s.canvas.remove();
    state = null;
  }

  window.KaiwrenLive = { start, stop };
})();
