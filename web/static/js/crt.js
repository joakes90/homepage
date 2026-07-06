// Phase 1 CRT overlay: WebGL2 fullscreen-triangle pass adding subtle grain +
// organic flicker on top of the existing CSS scanlines/vignette (see
// .crt::before / .crt::after in style.css, left untouched by this file).
//
// No build step, no dependencies. If WebGL2 is unavailable, this script
// quietly does nothing and the CSS-only treatment remains the whole effect.
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
    'out vec4 fragColor;\n' +
    '\n' +
    'float hash(vec2 p) {\n' +
    '  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);\n' +
    '}\n' +
    '\n' +
    // Organic, non-periodic flicker: a slow gentle sine wobble plus rare,
    // brief brightness dips that never go below a 0.85 floor (delta -0.15).
    'float flickerDelta(float t) {\n' +
    '  float base = sin(t * 2.0) * 0.008 + sin(t * 0.73) * 0.012;\n' +
    '\n' +
    '  float slotLen = 8.0;\n' +
    '  float slot = floor(t / slotLen);\n' +
    '  float slotRand = hash(vec2(slot, 1.0));\n' +
    '  float slotRand2 = hash(vec2(slot, 2.0));\n' +
    '\n' +
    '  float dipCenter = slotRand * slotLen;\n' +
    '  float dipDepth = 0.05 + slotRand2 * 0.10;\n' + // 0.05 - 0.15 -> floor >= 0.85
    '  float dist = abs(mod(t, slotLen) - dipCenter);\n' +
    '  float dipShape = smoothstep(0.045, 0.0, dist);\n' +
    '  float dip = -dipDepth * dipShape;\n' +
    '\n' +
    '  return base + dip;\n' +
    '}\n' +
    '\n' +
    'void main() {\n' +
    '  vec2 fragPx = gl_FragCoord.xy;\n' +
    '\n' +
    // Per-frame per-pixel grain, amplitude in the ±0.025-0.04 range.
    '  float n = hash(fragPx + vec2(uTime * 113.0, uTime * 71.0));\n' +
    '  float grain = (n - 0.5) * 2.0 * 0.032;\n' +
    '\n' +
    '  float flicker = flickerDelta(uTime);\n' +
    '\n' +
    '  float gray = clamp(0.5 + grain + flicker, 0.0, 1.0);\n' +
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

  function init() {
    var canvas = document.getElementById('crt-overlay');
    var toggle = document.getElementById('crt-toggle');
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

    var gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      powerPreference: 'low-power'
    });

    if (!gl) {
      // No WebGL2 support: nothing to draw. The CSS-only scanline/vignette
      // treatment already applied via .crt::before/::after remains as-is.
      console.info('crt.js: WebGL2 unavailable, using CSS-only CRT fallback.');
      canvas.style.display = 'none';
      if (toggle) {
        toggle.textContent = 'CRT: N/A';
        toggle.disabled = true;
        toggle.setAttribute('aria-disabled', 'true');
      }
      return;
    }

    var program = createProgram(gl, VERT_SRC, FRAG_SRC);
    var uResolution = gl.getUniformLocation(program, 'uResolution');
    var uTime = gl.getUniformLocation(program, 'uTime');
    var uIntensity = gl.getUniformLocation(program, 'uIntensity');

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

    function render() {
      rafId = null;

      // Smoothly ease toward the target so toggling doesn't hard-cut.
      currentIntensity += (targetIntensity - currentIntensity) * 0.08;
      if (Math.abs(targetIntensity - currentIntensity) < 0.002) {
        currentIntensity = targetIntensity;
      }

      resizeIfNeeded();

      var t = (performance.now() - startTime) / 1000;
      gl.useProgram(program);
      gl.uniform2f(uResolution, backingWidth, backingHeight);
      gl.uniform1f(uTime, t);
      gl.uniform1f(uIntensity, currentIntensity);

      gl.clear(gl.COLOR_BUFFER_BIT);
      if (currentIntensity > 0) {
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }

      if (currentIntensity === 0 && targetIntensity === 0) {
        // Fully faded out and staying off: stop the loop to save GPU/battery
        // rather than continuing to draw a fully-transparent frame forever.
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
      } else if (enabled || targetIntensity > 0 || currentIntensity > 0) {
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

    if (document.visibilityState !== 'hidden') {
      // Draw at least one frame immediately even when starting disabled, so
      // the canvas is correctly sized/cleared rather than stale.
      startLoop();
      if (!enabled) {
        // With targetIntensity already 0 the loop will fade (instantly, since
        // currentIntensity starts at 0 too) and stop itself after one frame.
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
