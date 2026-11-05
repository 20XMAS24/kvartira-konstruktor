// 3D-вид на three.js. 1 единица = 1 см; x как на плане, z = y плана, y вверх.
(function () {
  const state = { ready: false, failed: false, cut: 254, dirty: true };
  let renderer, scene, camera, content, host;
  const orbit = { theta: 0.5, phi: 0.62, dist: 1250, target: null };

  function mount(el) {
    host = el;
    if (state.ready || state.failed) return;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    } catch (e) {
      state.failed = true;
      el.innerHTML = '<p class="msg">Браузер не смог запустить 3D (WebGL недоступен). План и стены работают как обычно.</p>';
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0xeceae4);
    el.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(42, 1, 5, 8000);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb8b2a6, 0.85));
    const sun = new THREE.DirectionalLight(0xffffff, 0.55);
    sun.position.set(-300, 900, -500);
    scene.add(sun);
    content = new THREE.Group();
    scene.add(content);
    orbit.target = new THREE.Vector3(270, 40, 240);
    bindControls(renderer.domElement);
    new ResizeObserver(() => { resize(); draw(); }).observe(el);
    state.ready = true;
    resize();
  }

  function resize() {
    if (!state.ready || !host) return;
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function draw() {
    if (!state.ready) return;
    const { theta, phi, dist, target } = orbit;
    camera.position.set(
      target.x + dist * Math.sin(phi) * Math.sin(theta),
      target.y + dist * Math.cos(phi),
      target.z + dist * Math.sin(phi) * Math.cos(theta),
    );
    camera.lookAt(target);
    renderer.render(scene, camera);
  }

  function bindControls(dom) {
    const pts = new Map();
    let last = null, pan = false, pinch = null;
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    dom.addEventListener('pointerdown', (e) => {
      dom.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      last = [e.clientX, e.clientY];
      pan = e.shiftKey || e.button === 2;
      pinch = null;
    });
    dom.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinch) orbit.dist = clamp(orbit.dist * (pinch / d), 150, 3000);
        pinch = d;
        draw();
        return;
      }
      const dx = e.clientX - last[0], dy = e.clientY - last[1];
      last = [e.clientX, e.clientY];
      if (pan) {
        const k = orbit.dist * 0.0013;
        const c = Math.cos(orbit.theta), s = Math.sin(orbit.theta);
        orbit.target.x += (-dx * c - dy * s) * k;
        orbit.target.z += (dx * s - dy * c) * k;
      } else {
        orbit.theta -= dx * 0.006;
        orbit.phi = clamp(orbit.phi - dy * 0.005, 0.08, 1.5);
      }
      draw();
    });
    const up = (e) => { pts.delete(e.pointerId); pinch = null; };
    dom.addEventListener('pointerup', up);
    dom.addEventListener('pointercancel', up);
    dom.addEventListener('wheel', (e) => {
      e.preventDefault();
      orbit.dist = clamp(orbit.dist * Math.exp(e.deltaY * 0.001), 150, 3000);
      draw();
    }, { passive: false });
  }

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function addBox(x0, y0, x1, y1, z0, z1, color, opts = {}) {
    if (z1 <= z0) return null;
    const geo = new THREE.BoxGeometry(x1 - x0, z1 - z0, y1 - y0);
    const mat = new THREE.MeshLambertMaterial({ color, transparent: opts.opacity != null, opacity: opts.opacity != null ? opts.opacity : 1 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((x0 + x1) / 2, (z0 + z1) / 2, (y0 + y1) / 2);
    content.add(mesh);
    if (opts.edges) {
      const lines = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x3b3b38, transparent: true, opacity: 0.45 }));
      lines.position.copy(mesh.position);
      content.add(lines);
    }
    return mesh;
  }

  function clear() {
    while (content.children.length) {
      const c = content.children.pop();
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    }
  }

  function update(items, selectedId) {
    if (!state.ready) return;
    clear();
    const cut = state.cut;

    APT.rooms.forEach((r) => {
      const shape = new THREE.Shape();
      r.poly.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
      const geo = new THREE.ShapeGeometry(shape);
      const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: r.floor3d, side: THREE.DoubleSide }));
      mesh.rotation.x = Math.PI / 2; // y плана становится z сцены
      content.add(mesh);
    });

    Geo.wallBoxes(APT).forEach((w) => addBox(w.x0, w.y0, w.x1, w.y1, 0, cut, 0xf1efe9));
    APT.openings.forEach((o) => {
      const [x0, y0, x1, y1] = o.rect;
      addBox(x0, y0, x1, y1, Math.min(o.top, cut), cut, 0xf1efe9);
      if (o.sill) addBox(x0, y0, x1, y1, 0, Math.min(o.sill, cut), 0xf1efe9);
      if (o.type === 'window') {
        const mx = (y0 + y1) / 2;
        addBox(x0, mx - 1, x1, mx + 1, o.sill, Math.min(o.top, cut), 0x9fc7d8, { opacity: 0.45 });
      }
      if (o.type === 'balcony') addBox(x0, y0 + 17, x1, y0 + 21, o.sill, Math.min(o.top, cut), 0x9fc7d8, { opacity: 0.4 });
    });
    APT.fixed.forEach((f) => {
      addBox(f.rect[0], f.rect[1], f.rect[2], f.rect[3], f.z, Math.min(f.z + f.h, cut), f.kind === 'radiator' ? 0xe6e3dc : 0xbdbdb8, { edges: true });
    });

    items.forEach((it) => {
      const b = Geo.box(it);
      const z = it.z || 0;
      if (z >= cut) return;
      const color = new THREE.Color(it.color || '#cccccc');
      if (it.role === 'point') {
        addBox(b.x0, b.y0, b.x1, b.y1, z, z + it.h, 0xd9542b);
        return;
      }
      if (it.id === selectedId) color.lerp(new THREE.Color(0x1f8f9b), 0.35);
      addBox(b.x0, b.y0, b.x1, b.y1, z, Math.min(z + it.h, cut), color, { edges: true });
      if (it.kind === 'stove') addBox(b.x0 + 2, b.y0 + 2, b.x1 - 2, b.y1 - 2, z + it.h, z + it.h + 0.8, 0x1c1c1c);
      if (it.role === 'base') addBox(b.x0, b.y0, b.x1, b.y1, z + it.h - 4, z + it.h, 0xa8927a);
      if (it.kind === 'sink' && it.role === 'base') addBox(b.x0 + 8, b.y0 + 8, b.x1 - 8, b.y1 - 8, z + it.h, z + it.h + 0.6, 0xc4cbd0);
    });

    APT.outlets.forEach((p) => {
      if (p.h >= cut) return;
      const onLeft = p.x < 100;
      addBox(p.x + (onLeft ? 0 : -1.5), p.y - 4, p.x + (onLeft ? 1.5 : 0), p.y + 4, p.h - 4, p.h + 4, 0xd9542b);
    });
    draw();
  }

  function setCut(v) { state.cut = v; }
  function focus(bounds) {
    if (!state.ready) return;
    orbit.target.set((bounds.x0 + bounds.x1) / 2, 40, (bounds.y0 + bounds.y1) / 2);
    orbit.dist = clamp(Math.max(bounds.x1 - bounds.x0, bounds.y1 - bounds.y0) * 2.1, 300, 1500);
    draw();
  }
  function png() {
    if (!state.ready) return null;
    draw();
    return renderer.domElement.toDataURL('image/png');
  }

  window.View3D = { mount, update, setCut, resize, draw, focus, png, get ready() { return state.ready; } };
})();
