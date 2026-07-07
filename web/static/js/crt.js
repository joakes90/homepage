// CRT overlay: WebGL2 fullscreen-triangle pass adding grain, organic
// flicker, a pulsing vignette, a slow vertical-hold roll band, and an
// occasional "degauss" burst on top of the existing CSS scanlines (see
// .crt::before in style.css, left untouched by this file). The CSS
// vignette (.crt::after) is disabled via the `crt-canvas-active` class
// added to <html> once the shader takes over that job, so the two never
// double up. The roll band is frozen out entirely under
// prefers-reduced-motion (see uReducedMotion), same as the degauss timer.
//
// No build step, no dependencies. If WebGL2 is unavailable - or the device
// is touch-primary (phones/tablets; see the touchPrimary check in init(),
// which works around a WebKit fixed-position + mix-blend-mode compositing
// bug rather than a missing feature) - this script quietly does nothing and
// the CSS-only scanline/vignette treatment remains the whole effect.
(function () {
  'use strict';

  var VERT_SRC =
    '#version 300 es\n' +
    'void main() {\n' +
    '  vec2 pos = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);\n' +
    '  gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);\n' +
    '}\n';

  // Gray-centered output (0.5 = no change) meant to be composited onto the
  // page with `mix-blend-mode: overlay` (see #crt-overlay in style.css) so
  // the effect is purely a luminance modulation and stays theme-agnostic
  // (works the same whether the accent color is green, amber, whatever).
  var FRAG_SRC =
    '#version 300 es\n' +
    'precision highp float;\n' +
    'uniform vec2 uResolution;\n' +
    'uniform float uTime;\n' +
    'uniform float uIntensity;\n' +
    'uniform float uDegauss;\n' +
    'uniform float uReducedMotion;\n' +
    'out vec4 fragColor;\n' +
    '\n' +
    'float hash(vec2 p) {\n' +
    '  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);\n' +
    '}\n' +
    '\n' +
    // Organic, non-periodic flicker: a gentle sine wobble plus occasional,
    // brief brightness dips that never go below a ~0.85 floor (delta -0.15).
    'float flickerDelta(float t) {\n' +
    '  float base = sin(t * 2.0) * 0.014 + sin(t * 0.73) * 0.02;\n' +
    '\n' +
    '  float slotLen = 8.0;\n' +
    '  float slot = floor(t / slotLen);\n' +
    '  float slotRand = hash(vec2(slot, 1.0));\n' +
    '  float slotRand2 = hash(vec2(slot, 2.0));\n' +
    '\n' +
    '  float dipCenter = slotRand * slotLen;\n' +
    '  float dipDepth = 0.07 + slotRand2 * 0.08;\n' + // 0.07 - 0.15 -> floor >= 0.85
    '  float dist = abs(mod(t, slotLen) - dipCenter);\n' +
    '  float dipShape = smoothstep(0.06, 0.0, dist);\n' +
    '  float dip = -dipDepth * dipShape;\n' +
    '\n' +
    '  return base + dip;\n' +
    '}\n' +
    '\n' +
    // Radial vignette, aspect-corrected, tuned to roughly match the
    // darkening profile of the CSS radial-gradient it replaces (transparent
    // to ~62% radius, ~45% relative darken at the corners under the
    // overlay blend-mode math). Widens/deepens slightly during a degauss
    // burst for a "screen edges pulse" feel, and rides on the same flicker
    // delta as the rest of the frame since both feed the same `gray` sum.
    'float vignetteDarken(vec2 uv, float degauss) {\n' +
    '  vec2 c = uv - 0.5;\n' +
    '  c.x *= uResolution.x / uResolution.y;\n' +
    '  float dist = length(c) * 1.15;\n' +
    '  float vig = smoothstep(0.62, 1.0, dist);\n' +
    '  vig *= (1.0 + degauss * 0.3);\n' +
    '  return -vig * 0.225;\n' +
    '}\n' +
    '\n' +
    // Horizontal "vertical hold" roll band drifting slowly down the screen
    // (tens-of-seconds period), like an old CRT's vertical-sync drift.
    // uv.y follows gl_FragCoord convention (0 = bottom, 1 = top), so
    // counting bandCenter down from 1 makes the band visually drift
    // downward as t increases, wrapping smoothly back to the top. The
    // falloff is asymmetric - a tighter cutoff on the leading (lower-uv.y,
    // not-yet-passed) side and a longer, softer decay on the trailing
    // (higher-uv.y, just-passed) side - to read more like a real phosphor
    // afterglow than a symmetric blob. Frozen out entirely under
    // prefers-reduced-motion.
    'float rollBand(vec2 uv, float t, float reducedMotion) {\n' +
    '  float period = 27.0;\n' +
    '  float bandCenter = 1.0 - fract(t / period);\n' +
    '  float offset = uv.y - bandCenter;\n' +
    '  offset -= floor(offset + 0.5);\n' + // shortest signed distance, wraps seamlessly
    '  float leadWidth = 0.035;\n' +
    '  float trailWidth = 0.11;\n' +
    '  float width = offset < 0.0 ? leadWidth : trailWidth;\n' +
    '  float shape = smoothstep(width, 0.0, abs(offset));\n' +
    '  return shape * 0.12 * (1.0 - reducedMotion);\n' +
    '}\n' +
    '\n' +
    'void main() {\n' +
    '  vec2 fragPx = gl_FragCoord.xy;\n' +
    '  vec2 uv = fragPx / uResolution;\n' +
    '\n' +
    // Per-frame per-pixel grain.
    '  float n = hash(fragPx + vec2(uTime * 113.0, uTime * 71.0));\n' +
    '  float grain = (n - 0.5) * 2.0 * 0.045;\n' +
    '\n' +
    '  float flicker = flickerDelta(uTime);\n' +
    '  float vignette = vignetteDarken(uv, uDegauss);\n' +
    '  float roll = rollBand(uv, uTime, uReducedMotion);\n' +
    '\n' +
    // Degauss burst: a transient extra noise burst plus a brief brightness
    // flash, both scaled by the uDegauss envelope (0 -> 1 -> 0) driven from
    // JS on a randomized 25-50s timer, synced with a CSS skew/scale wobble
    // applied to the page container.
    '  float burstNoise = hash(fragPx + vec2(uTime * 400.0, uTime * 250.0)) - 0.5;\n' +
    '  float degaussTerm = uDegauss * burstNoise * 0.15 + uDegauss * 0.06;\n' +
    '\n' +
    '  float gray = clamp(0.5 + grain + flicker + vignette + degaussTerm + roll, 0.0, 1.0);\n' +
    '  fragColor = vec4(vec3(gray), uIntensity);\n' +
    '}\n';

  function compileShader(gl, type, src) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      var info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error('CRT shader compile error: ' + info);
    }
    return shader;
  }

  function createProgram(gl, vertSrc, fragSrc) {
    var vs = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
    var fs = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
    var program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      var info = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error('CRT program link error: ' + info);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return program;
  }

  function readStoredPreference() {
    try {
      return window.localStorage.getItem('crtEffect');
    } catch (e) {
      return null;
    }
  }

  function storePreference(value) {
    try {
      window.localStorage.setItem('crtEffect', value);
    } catch (e) {
      /* localStorage unavailable (private mode, etc) - ignore, non-critical */
    }
  }

  function easeOutCubic(t) {
    var f = 1 - t;
    return 1 - f * f * f;
  }

  // Fast attack (first 12% of the burst duration), slower easeOutCubic-shaped
  // decay for the remainder. Returns a 0..1 envelope value; 0 outside [0,1).
  function degaussEnvelope(elapsedMs, durationMs) {
    var t = elapsedMs / durationMs;
    if (t <= 0 || t >= 1) return 0;
    var attackFrac = 0.12;
    if (t < attackFrac) {
      return easeOutCubic(t / attackFrac);
    }
    var dt = (t - attackFrac) / (1 - attackFrac);
    return 1 - easeOutCubic(dt);
  }

  function init() {
    var canvas = document.getElementById('crt-overlay');
    var toggle = document.getElementById('crt-toggle');
    var crtRoot = document.querySelector('.crt');
    if (!canvas) return;

    var reducedMotion = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var params = new URLSearchParams(window.location.search);
    var queryPref = params.get('crt'); // 'on' | 'off' | null
    var stored = readStoredPreference(); // 'on' | 'off' | null

    var enabled;
    if (queryPref === 'on' || queryPref === 'off') {
      enabled = queryPref === 'on';
    } else if (stored === 'on' || stored === 'off') {
      enabled = stored === 'on';
    } else {
      enabled = !reducedMotion;
    }

    // Touch-primary devices (phones/tablets - coarse pointer, no hover; this
    // is how iOS/iPadOS Safari and friends present, as opposed to a mouse or
    // trackpad) are skipped entirely rather than handed a WebGL context.
    // #crt-overlay is `position: fixed` with `mix-blend-mode: overlay` (see
    // style.css); WebKit has a longstanding compositing bug where a fixed-
    // position element's blend mode is silently dropped in favor of plain
    // alpha-over compositing once it's promoted to its own layer (which a
    // WebGL canvas always is). Since the shader's output is a near-opaque,
    // ~50%-gray grain/vignette buffer meant to be *blended* rather than
    // painted, losing the blend mode makes it paint flat over the whole
    // page - the "black and white static that obscures everything" bug.
    // There's no script-observable way to test for that rendering bug
    // directly, so this proxies for it via input capability (not UA
    // sniffing) and falls back to the same CSS-only scanline/vignette
    // treatment used when WebGL2 itself is unavailable, below.
    var touchPrimary = !!(window.matchMedia &&
      window.matchMedia('(pointer: coarse) and (hover: none)').matches);

    var gl = touchPrimary ? null : canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      powerPreference: 'low-power'
    });

    if (!gl) {
      // No WebGL2 support (or a touch-primary device, see above): nothing to
      // draw. The CSS-only scanline/vignette treatment already applied via
      // .crt::before/::after remains as-is (crt-canvas-active is never
      // added, so that CSS stays untouched).
      console.info('crt.js: ' + (touchPrimary ? 'touch-primary device' : 'WebGL2 unavailable') +
        ', using CSS-only CRT fallback.');
      canvas.style.display = 'none';
      if (toggle) {
        toggle.textContent = 'CRT: N/A';
        toggle.disabled = true;
        toggle.setAttribute('aria-disabled', 'true');
      }
      return;
    }

    // The shader now owns the vignette (so it can pulse with flicker /
    // degauss); hide the static CSS vignette to avoid doubling up. The CSS
    // scanlines (.crt::before) are left alone.
    document.documentElement.classList.add('crt-canvas-active');

    var program = createProgram(gl, VERT_SRC, FRAG_SRC);
    var uResolution = gl.getUniformLocation(program, 'uResolution');
    var uTime = gl.getUniformLocation(program, 'uTime');
    var uIntensity = gl.getUniformLocation(program, 'uIntensity');
    var uDegauss = gl.getUniformLocation(program, 'uDegauss');
    var uReducedMotion = gl.getUniformLocation(program, 'uReducedMotion');
    var reducedMotionFlag = reducedMotion ? 1.0 : 0.0;

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    var DPR_CAP = 1.5;
    var backingWidth = 0;
    var backingHeight = 0;

    function resizeIfNeeded() {
      var dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
      var w = Math.max(1, Math.round(window.innerWidth * dpr));
      var h = Math.max(1, Math.round(window.innerHeight * dpr));
      if (w !== backingWidth || h !== backingHeight) {
        backingWidth = w;
        backingHeight = h;
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    }

    var startTime = performance.now();
    var rafId = null;
    var currentIntensity = enabled ? 1 : 0;
    var targetIntensity = enabled ? 1 : 0;
    var running = false;

    // Degauss burst state. degaussBurstStart is a performance.now() timestamp
    // while a burst is in flight, or null when idle.
    var DEGAUSS_DURATION_MS = 700;
    var degaussBurstStart = null;
    var degaussClassTimer = null;

    function render() {
      rafId = null;

      // Smoothly ease toward the target so toggling doesn't hard-cut.
      currentIntensity += (targetIntensity - currentIntensity) * 0.08;
      if (Math.abs(targetIntensity - currentIntensity) < 0.002) {
        currentIntensity = targetIntensity;
      }

      resizeIfNeeded();

      var now = performance.now();
      var t = (now - startTime) / 1000;

      var degaussValue = 0;
      if (degaussBurstStart !== null) {
        var elapsed = now - degaussBurstStart;
        if (elapsed >= DEGAUSS_DURATION_MS) {
          degaussBurstStart = null;
        } else {
          degaussValue = degaussEnvelope(elapsed, DEGAUSS_DURATION_MS);
        }
      }

      gl.useProgram(program);
      gl.uniform2f(uResolution, backingWidth, backingHeight);
      gl.uniform1f(uTime, t);
      gl.uniform1f(uIntensity, currentIntensity);
      gl.uniform1f(uDegauss, degaussValue);
      gl.uniform1f(uReducedMotion, reducedMotionFlag);

      gl.clear(gl.COLOR_BUFFER_BIT);
      if (currentIntensity > 0) {
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }

      if (currentIntensity === 0 && targetIntensity === 0 && degaussBurstStart === null) {
        // Fully faded out, staying off, and no burst in flight: stop the
        // loop to save GPU/battery rather than drawing transparent frames.
        running = false;
        return;
      }

      rafId = requestAnimationFrame(render);
    }

    function startLoop() {
      if (running) return;
      running = true;
      if (rafId === null) {
        rafId = requestAnimationFrame(render);
      }
    }

    function stopLoop() {
      running = false;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    }

    // Randomized 25-50s interval, re-rolled after every trigger (not a fixed
    // loop) so bursts feel occasional/intermittent rather than mechanical.
    function scheduleNextDegauss() {
      var delay = 25000 + Math.random() * 25000;
      setTimeout(triggerDegauss, delay);
    }

    function triggerDegauss() {
      if (enabled) {
        degaussBurstStart = performance.now();

        if (crtRoot) {
          crtRoot.classList.remove('is-degaussing');
          // Force a reflow so re-adding the class restarts the CSS
          // animation even if a previous burst's class hadn't cleared yet.
          void crtRoot.offsetWidth;
          crtRoot.classList.add('is-degaussing');
        }

        if (degaussClassTimer !== null) {
          clearTimeout(degaussClassTimer);
        }
        degaussClassTimer = setTimeout(function () {
          if (crtRoot) crtRoot.classList.remove('is-degaussing');
          degaussClassTimer = null;
        }, DEGAUSS_DURATION_MS);

        if (document.visibilityState !== 'hidden') {
          startLoop();
        }
      }

      scheduleNextDegauss();
    }

    function setEnabled(next) {
      enabled = next;
      targetIntensity = enabled ? 1 : 0;
      if (enabled && document.visibilityState !== 'hidden') {
        startLoop();
      }
      if (toggle) {
        toggle.setAttribute('aria-pressed', String(enabled));
        toggle.textContent = enabled ? 'CRT: ON' : 'CRT: OFF';
      }
    }

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') {
        stopLoop();
      } else if (enabled || targetIntensity > 0 || currentIntensity > 0 || degaussBurstStart !== null) {
        startLoop();
      }
    });

    if (toggle) {
      toggle.setAttribute('aria-pressed', String(enabled));
      toggle.textContent = enabled ? 'CRT: ON' : 'CRT: OFF';
      toggle.disabled = false;
      toggle.removeAttribute('aria-disabled');
      toggle.addEventListener('click', function () {
        var next = !enabled;
        storePreference(next ? 'on' : 'off');
        setEnabled(next);
      });
    }

    // No degauss timers at all under prefers-reduced-motion - not merely
    // "skip the CSS wobble", the JS never schedules the shader burst either.
    if (!reducedMotion) {
      scheduleNextDegauss();
    }

    if (document.visibilityState !== 'hidden') {
      // Draw at least one frame immediately even when starting disabled, so
      // the canvas is correctly sized/cleared rather than stale.
      startLoop();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
