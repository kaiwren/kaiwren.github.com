// Live theme: "The City and the Stars" meets "The Crystal World". A day on the
// planet of the Seven Suns. All seven suns ride one road across the sky; scrolling
// the page turns the planet, so the suns move forward as you scroll down and back
// as you scroll up. Every colour comes from those seven lights and the dusty sky
// they make. There is no night. Loaded lazily by index.html on capable devices.
(function () {
  'use strict';

  const DEG = Math.PI / 180;
  const HORIZON = 0.64;          // fraction of viewport height

  // The road: a great circle that sets on the horizon a little right of ahead and
  // climbs over the top-left of the frame. phi is the angle along it from the
  // setting point; the suns move toward smaller phi.
  const SET_AZ = 12 * DEG, ROAD_TILT = 45 * DEG;
  const S = [Math.sin(SET_AZ), 0, -Math.cos(SET_AZ)];
  const B = [-Math.cos(SET_AZ) * Math.cos(ROAD_TILT), Math.sin(ROAD_TILT), -Math.sin(SET_AZ) * Math.cos(ROAD_TILT)];

  // Clarke: a pearly white giant in an envelope of gas, and coloured suns; "he could
  // pick out red, blue, gold, and green, but the other tints eluded his eye".
  // off is the place on the road relative to the white sun, in degrees.
  const SUNS = [
    { off: 0, colour: [1.0, 0.93, 0.84], power: 7.0, radius: 2.1 },
    { off: 28, colour: [1.0, 0.16, 0.06], power: 1.4, radius: 0.32 },
    { off: -22, colour: [1.0, 0.6, 0.12], power: 1.3, radius: 0.28 },
    { off: 52, colour: [0.12, 0.3, 1.0], power: 1.6, radius: 0.36 },
    { off: 80, colour: [0.15, 1.0, 0.3], power: 0.7, radius: 0.27 },
    { off: -46, hues: [0.76, 0.93], power: 1.1, radius: 0.24 },
    { off: 110, hues: [0.44, 0.56], power: 1.1, radius: 0.24 }
  ];
  const DUST = [0.95, 0.56, 0.31];

  const NOISE = `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 w = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), w.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), w.x), w.y);
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
  vec3 sky(vec3 d) {
    float h = max(d.y, 0.0);
    float depth = 1.0 / (h * 1.7 + 0.1);
    vec3 col = vec3(0.0);
    for (int i = 0; i < 7; i++) {
      float c = dot(d, uL[i]);
      // Mars-like dust: butterscotch scatter, thicker toward the horizon, and a
      // tight bluish aureole close to each sun
      col += uEs[i] * vec3(${DUST.join(', ')}) * (hg(c, 0.6) * 0.55 + 0.035) * (1.0 - exp(-depth * 0.5));
      col += uEs[i] * vec3(0.55, 0.74, 1.0) * hg(c, 0.94) * 0.035;
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
  out vec4 o;
  ${LIGHT}

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

  void main() {
    vec2 px = vec2(vUv.x * uRes.x, (1.0 - vUv.y) * uRes.y);
    vec3 d = normalize(vec3((px.x - uRes.x * 0.5) / uF, (uHy - px.y) / uF, -1.0));
    vec3 col;
    if (d.y > 0.0) col = sky(d) + discs(d);
    else col = uAmb * 0.6;   // placeholder ground
    o = vec4(col, 1.0);
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
      const tau = [0.05, 0.085, 0.16];   // dust takes blue first, so low suns redden
      for (let c = 0; c < 3; c++) {
        const t = Math.exp(-tau[c] * air);
        E[i * 3 + c] = colour[c] * sun.power * t * ground;
        Es[i * 3 + c] = colour[c] * sun.power * t * skyFade;
        amb[c] += Es[i * 3 + c] * DUST[c] * 0.32 * (0.25 + Math.max(y, 0));
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

  function layout(s) {
    const gl = s.gl;
    s.dpr = Math.min(devicePixelRatio || 1, 2);
    s.canvas.width = Math.round(innerWidth * s.dpr);
    s.canvas.height = Math.round(innerHeight * s.dpr);
    s.f = Math.max(innerWidth, innerHeight * 1.25) / 2;
    s.hy = innerHeight * HORIZON;
    // the scene renders a little below screen resolution
    const k = s.scale * Math.min(s.dpr, 1.25);
    s.w = Math.round(innerWidth * k);
    s.h = Math.round(innerHeight * k);
    gl.bindTexture(gl.TEXTURE_2D, s.sceneTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, s.w, s.h, 0, gl.RGBA, gl.HALF_FLOAT, null);
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
    gl.useProgram(s.world.p);
    let u = s.world.u;
    gl.uniform2f(u.uRes, innerWidth, innerHeight);
    gl.uniform1f(u.uF, s.f);
    gl.uniform1f(u.uHy, s.hy);
    setLight(gl, u, sky);
    gl.bindVertexArray(s.quadVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

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

    const sceneTex = texture(gl);
    const fbo = gl.createFramebuffer();
    const maskCanvas = document.createElement('canvas');
    state = {
      gl, canvas, quadVao, sceneTex, fbo, maskCanvas,
      maskTex: texture(gl),
      maskCtx: maskCanvas.getContext('2d'),
      world: program(gl, QUAD_VS, WORLD_FS),
      post: program(gl, QUAD_VS, POST_FS),
      t0: performance.now(), timeOffset: 0, frames: [], frozen: false, last: 0,
      scroll: 0, exposure: 0.5, scale: 1, dayOverride: null
    };
    const s = state;
    layout(s);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sceneTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
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
