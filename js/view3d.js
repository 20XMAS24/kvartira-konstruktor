// 3D-сцена: реалистичный показ и редактирование мышью. 1 единица = 1 см; x как на плане, z = y плана, y вверх.
(function () {
  const ACCENT = 0x1f8f9b, RED = 0xd8452b, AMBER = 0xd9920a;
  const state = { ready: false, failed: false, cut: 254, autoHide: true, theme: null, hideDist: 285 };
  let renderer, scene, camera, host, staticG, itemsG, marker, sun, tools;
  let handlers = {};
  let lastItems = [], selectedId = null;
  const orbit = { theta: 0.45, phi: 0.6, dist: 1120, target: null };
  const entries = new Map(); // id предмета → { group, sig }
  let walls = [];
  const raycaster = new THREE.Raycaster();
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

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
    renderer.setClearColor(0xe9e6df);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.92;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    camera = new THREE.PerspectiveCamera(38, 1, 5, 8000);

    sun = new THREE.DirectionalLight(0xfff3e0, 1.35);
    sun.position.set(-260, 800, -520);
    sun.target.position.set(270, 0, 240);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -560, right: 560, top: 560, bottom: -560, near: 50, far: 2000 });
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.6;
    scene.add(sun, sun.target);

    staticG = new THREE.Group();
    itemsG = new THREE.Group();
    scene.add(staticG, itemsG);

    marker = new THREE.Group();
    marker.visible = false;
    marker.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
      new THREE.LineBasicMaterial({ color: ACCENT, depthTest: false, transparent: true }),
    ));
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.22, depthWrite: false }));
    plate.rotation.x = -Math.PI / 2;
    plate.position.y = -0.495;
    marker.add(plate);
    marker.renderOrder = 5;
    scene.add(marker);

    orbit.target = new THREE.Vector3(270, 30, 240);
    tools = document.createElement('div');
    tools.className = 'd3-tools';
    tools.hidden = true;
    tools.innerHTML = '<button data-a="rotate" title="Клавиша R">Повернуть</button><button data-a="lift" title="Тяните вверх или вниз">Выше / ниже</button><button data-a="dup">Копия</button><button data-a="del" class="danger">Удалить</button>';
    el.appendChild(tools);
    bindTools();
    bindControls(renderer.domElement);
    Models3D.setOnChange(() => { if (state.ready) { update(lastItems, selectedId); } });
    new ResizeObserver(() => { resize(); draw(); }).observe(el);
    state.ready = true;
    buildStatic();
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

  /* ---------- Неподвижная часть ---------- */
  function floorGeometry(poly) {
    const shape = new THREE.Shape();
    poly.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
    const flat = new THREE.ShapeGeometry(shape);
    const pos = flat.attributes.position, nor = flat.attributes.normal, uv = flat.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      uv.setXY(i, x, y);
      pos.setXYZ(i, x, 0, y);
      nor.setXYZ(i, 0, 1, 0);
    }
    const idx = flat.index.array;
    for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    return flat;
  }
  const FLOORS = {
    kitchen: { name: 'laminate_floor_03', scale: 1 / 200, color: 0xb8d9ff, gain: 1.7 },
    room: { name: 'laminate_floor_03', scale: 1 / 200, color: 0xb8d9ff, gain: 1.7 },
    hall: { name: 'laminate_floor_03', scale: 1 / 200, color: 0xb8d0f0, gain: 1.6 },
    bath: { name: 'long_white_tiles', scale: 1 / 140, color: 0xffffff, gain: 1.05 },
    balcony: { name: 'long_white_tiles', scale: 1 / 140, color: 0xdcdcd6, gain: 1 },
  };
  function floorMaterial(room) {
    const custom = state.theme && state.theme.floors[room.id];
    const f = custom ? { name: custom.tex, scale: custom.scale, color: custom.color, gain: custom.gain } : FLOORS[room.id];
    const scale = f.scale;
    const params = { color: new THREE.Color(f.color).multiplyScalar(f.gain || 1), roughness: 0.42, metalness: 0, envMapIntensity: 0.42 };
    const d = f.name ? Models3D.tex(`${f.name}_Diffuse`, true, scale) : null;
    if (d) {
      params.map = d;
      params.normalMap = Models3D.tex(`${f.name}_nor_gl`, false, scale);
      params.roughnessMap = Models3D.tex(`${f.name}_Rough`, false, scale);
      params.roughness = 1;
    } else if (f.name) params.color = custom ? new THREE.Color(custom.plan) : room.floor3d;
    return new THREE.MeshStandardMaterial(params);
  }

  function wallBox(x0, y0, x1, y1, z0, z1, material, hideable = true) {
    if (z1 <= z0) return null;
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, z1 - z0, y1 - y0), material);
    m.position.set((x0 + x1) / 2, (z0 + z1) / 2, (y0 + y1) / 2);
    m.castShadow = m.receiveShadow = true;
    staticG.add(m);
    if (hideable) walls.push(m);
    return m;
  }

  function buildStatic() {
    while (staticG.children.length) {
      const c = staticG.children.pop();
      if (c.geometry) c.geometry.dispose();
    }
    walls = [];
    const cut = state.cut;
    const theme = state.theme;
    const plaster = theme ? Models3D.M.paint(theme.walls) : Models3D.M.whiteMatte();
    const frame = Models3D.M.enamel();
    const glass = Models3D.M.glass();
    const doorWood = theme ? Models3D.M.paint(theme.door) : Models3D.M.wood('#c9b597');

    const b = Draw.planBounds();
    const base = new THREE.Mesh(new THREE.BoxGeometry(b.x1 - b.x0 + 60, 4, b.y1 - b.y0 + 60), new THREE.MeshStandardMaterial({ color: 0xd8d4cb, roughness: 1, envMapIntensity: 0.42 }));
    base.position.set((b.x0 + b.x1) / 2, -2.4, (b.y0 + b.y1) / 2);
    base.receiveShadow = true;
    staticG.add(base);

    APT.rooms.forEach((r) => {
      const m = new THREE.Mesh(floorGeometry(r.poly), floorMaterial(r));
      m.receiveShadow = true;
      staticG.add(m);
    });
    Geo.wallBoxes(APT).forEach((w) => wallBox(w.x0, w.y0, w.x1, w.y1, 0, cut, plaster));

    APT.openings.forEach((o) => {
      const [x0, y0, x1, y1] = o.rect;
      const horiz = x1 - x0 > y1 - y0;
      wallBox(x0, y0, x1, y1, Math.min(o.top, cut), cut, plaster);
      if (o.sill) wallBox(x0, y0, x1, y1, 0, Math.min(o.sill, cut), plaster);
      const top = Math.min(o.top, cut);
      if (o.type === 'window' || o.type === 'balcony') {
        const mid = horiz ? (y0 + y1) / 2 : (x0 + x1) / 2;
        const t = 3;
        const pane = (a, c) => (horiz ? wallBox(a, mid - 0.6, c, mid + 0.6, o.sill, top, glass) : wallBox(mid - 0.6, a, mid + 0.6, c, o.sill, top, glass));
        const bar = (a, c, z0, z1) => (horiz ? wallBox(a, mid - t, c, mid + t, z0, z1, frame) : wallBox(mid - t, a, mid + t, c, z0, z1, frame));
        const lo = horiz ? x0 : y0, hi = horiz ? x1 : y1;
        pane(lo, hi);
        bar(lo, hi, o.sill, o.sill + 5);
        bar(lo, hi, top - 5, top);
        const parts = Math.max(1, Math.round((hi - lo) / 75));
        for (let i = 0; i <= parts; i++) {
          const p = lo + ((hi - lo) * i) / parts;
          bar(Math.max(lo, p - 2.5), Math.min(hi, p + 2.5), o.sill, top);
        }
      } else if (o.type === 'door') {
        const s = Geo.swingBox(o, handlers.doors ? handlers.doors() : null);
        if (s) {
          const [hx, hy] = s.H, [ox, oy] = s.O;
          const t = 2;
          const lx0 = Math.min(hx, ox) - (hx === ox ? t : 0), lx1 = Math.max(hx, ox) + (hx === ox ? t : 0);
          const ly0 = Math.min(hy, oy) - (hy === oy ? t : 0), ly1 = Math.max(hy, oy) + (hy === oy ? t : 0);
          wallBox(lx0, ly0, lx1, ly1, 0.5, top, doorWood, false);
        }
      } else if (o.type === 'entry') {
        wallBox(x0, y1 - 8, x1, y1 - 2, 0, top, Models3D.M.paint('#4b4238'));
      }
    });

    APT.fixed.forEach((f) => {
      const [x0, y0, x1, y1] = f.rect;
      if (f.kind === 'radiator') {
        for (let x = x0; x < x1 - 1; x += 8) wallBox(x + 0.6, y0 + 2, x + 7.4, y1, 10, Math.min(f.h, cut), Models3D.M.enamel(), false);
      } else wallBox(x0, y0, x1, y1, f.z, Math.min(f.z + f.h, cut), Models3D.M.paint('#d9d6cf'), false);
    });

    const plate = Models3D.M.enamel();
    APT.outlets.forEach((p) => {
      if (p.h >= cut) return;
      const onLeft = p.x < 100;
      const m = wallBox(p.x + (onLeft ? 0 : -1), p.y - 4, p.x + (onLeft ? 1 : 0), p.y + 4, p.h - 4, p.h + 4, plate, false);
      if (m) m.castShadow = false;
    });
  }

  /* ---------- Предметы ---------- */
  function update(items, selId, issues) {
    if (!state.ready) return;
    lastItems = items;
    selectedId = selId;
    const keep = new Set();
    for (const it of items) {
      keep.add(it.id);
      const sig = Models3D.signature(it);
      let e = entries.get(it.id);
      if (!e || e.sig !== sig) {
        if (e) { itemsG.remove(e.group); Models3D.dispose(e.group); }
        const group = Models3D.build(it);
        group.userData.itemId = it.id;
        itemsG.add(group);
        // Сигнатура считается после build: шаблон модели мог только что начать загрузку.
        e = { group, sig: Models3D.signature(it) };
        entries.set(it.id, e);
      }
      const b = Geo.box(it);
      e.group.position.set((b.x0 + b.x1) / 2, it.z || 0, (b.y0 + b.y1) / 2);
      e.group.rotation.y = (-(it.rot || 0) * Math.PI) / 180;
      e.group.visible = (it.z || 0) < state.cut;
    }
    for (const [id, e] of entries) {
      if (!keep.has(id)) { itemsG.remove(e.group); Models3D.dispose(e.group); entries.delete(id); }
    }
    const sel = items.find((i) => i.id === selId);
    marker.visible = !!sel;
    if (sel) {
      const b = Geo.box(sel);
      marker.position.set((b.x0 + b.x1) / 2, (sel.z || 0) + sel.h / 2, (b.y0 + b.y1) / 2);
      marker.scale.set(b.w + 1, sel.h + 1, b.d + 1);
      const level = issues && issues.get(sel.id);
      marker.children[0].material.color.setHex(level === 'error' ? RED : level === 'warn' ? AMBER : ACCENT);
      marker.children[1].material.color.setHex(level === 'error' ? RED : level === 'warn' ? AMBER : ACCENT);
    }
    draw();
  }

  // Срез: стены между камерой и центром вида прячутся, иначе за ними ничего не видно.
  function applyAutoHide() {
    const { target } = orbit;
    let dx = camera.position.x - target.x, dz = camera.position.z - target.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    const top = orbit.phi < 0.25;
    for (const m of walls) {
      const p = (m.position.x - target.x) * dx + (m.position.z - target.z) * dz;
      m.visible = !state.autoHide || top || p < state.hideDist;
    }
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
    applyAutoHide();
    renderer.render(scene, camera);
    placeTools();
  }

  function placeTools() {
    const sel = lastItems.find((i) => i.id === selectedId);
    if (!sel || !tools || !host) { if (tools) tools.hidden = true; return; }
    const b = Geo.box(sel);
    const v = new THREE.Vector3((b.x0 + b.x1) / 2, (sel.z || 0) + sel.h + 6, (b.y0 + b.y1) / 2).project(camera);
    const W = host.clientWidth, H = host.clientHeight;
    tools.hidden = false;
    const tw = tools.offsetWidth, th = tools.offsetHeight;
    tools.style.left = `${clamp(((v.x + 1) / 2) * W - tw / 2, 6, Math.max(6, W - tw - 6))}px`;
    tools.style.top = `${clamp(((1 - v.y) / 2) * H - th - 8, 6, Math.max(6, H - th - 6))}px`;
  }

  /* ---------- Указатель ---------- */
  function setRay(clientX, clientY) {
    const r = renderer.domElement.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), camera);
  }
  function hitPlane(clientX, clientY, y) {
    setRay(clientX, clientY);
    const p = new THREE.Vector3();
    return raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), p);
  }
  // Что под указателем: предмет, если его не загораживает видимая стена.
  function pick(clientX, clientY) {
    setRay(clientX, clientY);
    const visible = walls.filter((m) => m.visible);
    const objs = [...itemsG.children.filter((g) => g.visible), ...visible];
    const hit = raycaster.intersectObjects(objs, true)[0];
    if (!hit) return null;
    let o = hit.object;
    while (o && !o.userData.itemId) o = o.parent;
    return o ? { id: o.userData.itemId, point: hit.point } : null;
  }

  function bindControls(dom) {
    const pts = new Map();
    let mode = null, pinch = null;
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    dom.addEventListener('pointerdown', (e) => {
      dom.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      pinch = null;
      if (pts.size === 2) { mode = mode && mode.type === 'item' ? mode : null; return; }
      const start = { sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, moved: false };
      const hit = e.button === 0 && !e.shiftKey ? pick(e.clientX, e.clientY) : null;
      if (hit) {
        const it = lastItems.find((i) => i.id === hit.id);
        const b = Geo.box(it);
        const y = hit.point.y;
        mode = { type: 'item', id: hit.id, y, ox: hit.point.x - (b.x0 + b.x1) / 2, oz: hit.point.z - (b.y0 + b.y1) / 2, ...start };
        if (handlers.select) handlers.select(hit.id);
      } else {
        mode = { type: e.shiftKey || e.button === 2 ? 'pan' : 'orbit', ...start };
      }
    });
    dom.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) {
        if (!mode && e.pointerType === 'mouse') dom.style.cursor = pick(e.clientX, e.clientY) ? 'grab' : 'default';
        return;
      }
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinch) orbit.dist = clamp(orbit.dist * (pinch / d), 150, 3000);
        pinch = d;
        draw();
        return;
      }
      if (!mode) return;
      const dx = e.clientX - mode.lx, dy = e.clientY - mode.ly;
      mode.lx = e.clientX; mode.ly = e.clientY;
      if (Math.hypot(e.clientX - mode.sx, e.clientY - mode.sy) > 4) mode.moved = true;
      if (mode.type === 'item') {
        if (!mode.moved) return;
        if (!mode.started) { mode.started = true; if (handlers.dragStart) handlers.dragStart(mode.id); }
        const p = hitPlane(e.clientX, e.clientY, mode.y);
        if (p && handlers.dragMove) handlers.dragMove(p.x - mode.ox, p.z - mode.oz, e.altKey);
      } else if (mode.type === 'pan') {
        const k = orbit.dist * 0.0013;
        const c = Math.cos(orbit.theta), s = Math.sin(orbit.theta);
        orbit.target.x += (-dx * c - dy * s) * k;
        orbit.target.z += (dx * s - dy * c) * k;
        draw();
      } else {
        orbit.theta -= dx * 0.006;
        orbit.phi = clamp(orbit.phi - dy * 0.005, 0.08, 1.5);
        draw();
      }
    });
    const up = (e) => {
      pts.delete(e.pointerId);
      pinch = null;
      if (!mode || pts.size) return;
      if (mode.type === 'item' && mode.started && handlers.dragEnd) handlers.dragEnd();
      if (mode.type === 'orbit' && !mode.moved && handlers.select) handlers.select(null);
      mode = null;
    };
    dom.addEventListener('pointerup', up);
    dom.addEventListener('pointercancel', up);
    dom.addEventListener('wheel', (e) => {
      e.preventDefault();
      orbit.dist = clamp(orbit.dist * Math.exp(e.deltaY * 0.001), 150, 3000);
      draw();
    }, { passive: false });
  }

  function bindTools() {
    let lift = null;
    tools.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b && b.dataset.a !== 'lift' && handlers.action) handlers.action(b.dataset.a);
    });
    tools.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('[data-a="lift"]');
      if (!b) return;
      e.preventDefault();
      b.setPointerCapture(e.pointerId);
      lift = { sy: e.clientY, k: (2 * orbit.dist * Math.tan((camera.fov * Math.PI) / 360)) / host.clientHeight };
      if (handlers.liftStart) handlers.liftStart();
    });
    tools.addEventListener('pointermove', (e) => {
      if (lift && handlers.liftMove) handlers.liftMove((lift.sy - e.clientY) * lift.k);
    });
    const end = () => { if (lift) { lift = null; if (handlers.liftEnd) handlers.liftEnd(); } };
    tools.addEventListener('pointerup', end);
    tools.addEventListener('pointercancel', end);
  }

  /* ---------- Снаружи ---------- */
  function setTheme(t) {
    if (state.theme === t) return;
    state.theme = t;
    Models3D.setTheme(t);
    if (state.ready) buildStatic();
  }
  function setCut(v) { state.cut = v; if (state.ready) buildStatic(); }
  function setAutoHide(v) { state.autoHide = v; draw(); }
  function rebuildStatic() { if (state.ready) { buildStatic(); draw(); } }
  function focus(bounds) {
    if (!state.ready) return;
    orbit.target.set((bounds.x0 + bounds.x1) / 2, 30, (bounds.y0 + bounds.y1) / 2);
    const size = Math.max(bounds.x1 - bounds.x0, bounds.y1 - bounds.y0);
    orbit.dist = clamp(size * 1.75, 300, 1500);
    state.hideDist = size * 0.33;
    draw();
  }
  function png() {
    if (!state.ready) return null;
    const m = marker.visible;
    marker.visible = false;
    draw();
    const url = renderer.domElement.toDataURL('image/png');
    marker.visible = m;
    draw();
    return url;
  }
  function floorPoint(e) { return state.ready ? hitPlane(e.clientX, e.clientY, 0) : null; }

  window.View3D = {
    mount, update, setTheme, setCut, setAutoHide, rebuildStatic, resize, draw, focus, png, floorPoint,
    setHandlers: (h) => { handlers = h; },
    get ready() { return state.ready; },
    _debug: { orbit, draw },
  };
})();
