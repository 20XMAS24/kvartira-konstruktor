// Базовые шейдеры: небо за окнами и постобработка кадра
// (мягкие тени в углах, коррекция цвета, тональная кривая, виньетка).
(function () {
  const fullscreenVert = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

  const SKY = {
    uniforms: { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, ground: { value: new THREE.Color() } },
    vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      varying vec3 vDir;
      uniform vec3 top; uniform vec3 horizon; uniform vec3 ground;
      void main() {
        float h = normalize(vDir).y;
        vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.55)) : mix(horizon, ground, min(1.0, -h * 6.0));
        gl_FragColor = vec4(c, 1.0);
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false,
  };

  const POST = {
    uniforms: {
      tColor: { value: null }, tDepth: { value: null },
      resolution: { value: new THREE.Vector2(1, 1) },
      near: { value: 5 }, far: { value: 8000 }, focal: { value: 1 },
      exposure: { value: 1 }, warmth: { value: 0 }, vignette: { value: 0.22 }, aoStrength: { value: 0.75 },
    },
    vertexShader: fullscreenVert,
    fragmentShader: `
      varying vec2 vUv;
      uniform sampler2D tColor; uniform sampler2D tDepth;
      uniform vec2 resolution;
      uniform float near; uniform float far; uniform float focal;
      uniform float exposure; uniform float warmth; uniform float vignette; uniform float aoStrength;

      float viewZ(vec2 uv) {
        float d = texture2D(tDepth, uv).x * 2.0 - 1.0;
        return 2.0 * near * far / (far + near - d * (far - near));
      }
      // Затенение углов: сравниваем глубину с соседними точками на диске вокруг пикселя.
      float occlusion(float z) {
        const int N = 14;
        const float RADIUS = 16.0; // см
        float px = min(RADIUS * focal / z, 60.0);
        float angle = 6.2832 * fract(52.9829 * fract(dot(gl_FragCoord.xy, vec2(0.0671, 0.00584))));
        float sum = 0.0;
        for (int i = 0; i < N; i++) {
          float t = (float(i) + 0.5) / float(N);
          float a = angle + float(i) * 2.39996;
          vec2 uv = vUv + vec2(cos(a), sin(a)) * sqrt(t) * px / resolution;
          float dz = z - viewZ(uv);
          float inRange = smoothstep(0.0, 1.0, RADIUS * 1.5 / max(abs(dz), 0.001));
          sum += smoothstep(0.6, 3.0, dz) * inRange;
        }
        return sum / float(N);
      }
      vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }

      void main() {
        vec3 c = texture2D(tColor, vUv).rgb;
        float z = viewZ(vUv);
        if (z < far * 0.9) c *= 1.0 - occlusion(z) * aoStrength;
        c *= exposure * 0.72;
        c *= vec3(1.0 + warmth * 0.1, 1.0, 1.0 - warmth * 0.14);
        c = aces(c);
        float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(vec3(luma), c, 1.08);
        vec2 q = vUv - 0.5;
        c *= 1.0 - vignette * smoothstep(0.25, 0.8, length(q));
        c = pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2));
        gl_FragColor = vec4(c, 1.0);
      }`,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  };

  window.Shaders3D = { SKY, POST };
})();
