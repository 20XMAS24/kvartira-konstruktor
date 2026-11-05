// Состояние и интерфейс: каталог, перетаскивание, свойства, проверки, смета, файлы.
(function () {
  const { box, roomAt, roomOf, cm } = Geo;
  const { esc } = Draw;
  const $ = (id) => document.getElementById(id);
  const STORE = 'kvartira-konstruktor-v1';
  const CAT = new Map(CATALOG.map((c) => [c.id, c]));
  const maskCache = Geo.baseMask(APT);

  const S = {
    items: [], doors: {}, minPass: {}, design: null,
    sel: null,          // { type: 'item' | 'outlet' | 'opening', id }
    view: 'plan', tab: 'props', focus: 'all',
    wallRoom: 'kitchen', wallEdge: 3,
    guides: [], checks: [],
    layers: { upper: true, outlets: true, dims: true, hints: false },
    cam: null,
  };
  const history = { past: [], future: [] };
  let seq = 1;
  const newId = () => `i${Date.now().toString(36)}${(seq++).toString(36)}`;

  const snapshot = () => JSON.stringify({ items: S.items, doors: S.doors, minPass: S.minPass, design: S.design });
  function restore(json) {
    const d = JSON.parse(json);
    S.items = d.items; S.doors = d.doors || {}; S.minPass = d.minPass || {}; S.design = d.design || null;
    if (S.sel && S.sel.type === 'item' && !S.items.some((i) => i.id === S.sel.id)) S.sel = null;
  }
  function commit(before) {
    if (before !== undefined && before !== snapshot()) {
      history.past.push(before);
      if (history.past.length > 200) history.past.shift();
      history.future.length = 0;
    }
    save();
    refresh();
  }
  function mutate(fn) { const before = snapshot(); fn(); commit(before); }
  function save() { try { localStorage.setItem(STORE, snapshot()); } catch (e) { /* без хранилища работаем в памяти */ } }

  function makeItem(catId, x = 0, y = 0, rot = 0) {
    const c = CAT.get(catId);
    if (!c) return null;
    const { group, id, hug, ...rest } = c;
    return { ...rest, id: newId(), cat: catId, hug, x, y, rot };
  }
  function loadPreset(name) {
    S.items = PRESETS[name].items.map(([id, x, y, rot]) => makeItem(id, x, y, rot));
    S.design = null;
    S.sel = null;
  }
  // Цвет мебели в дизайне зависит от типа предмета; техника и сантехника остаются своими.
  function designColor(c, paint) {
    if (c.kind === 'sofa' || c.kind === 'bed' || c.kind === 'chair') return paint.soft;
    if (c.kind === 'table') return paint.table;
    if (c.role === 'base' || c.role === 'upper' || c.role === 'tall' || c.kind === 'cabinet' || c.kind === 'wardrobe') return paint.cabinet;
    return c.color;
  }
  function designItems(d) {
    return d.items.map(([id, x, y, rot]) => {
      const it = makeItem(id, x, y, rot);
      if (it.role !== 'plumbing' && it.kind !== 'hood') it.color = designColor(CAT.get(id), d.paint);
      return it;
    });
  }
  const currentTheme = () => { const d = DESIGNS.find((x) => x.id === S.design); return d ? d.theme : null; };

  // Проверка файла: всё, что не похоже на предмет, отбрасываем.
  function sanitize(data) {
    if (!data || !Array.isArray(data.items)) throw new Error('В файле нет списка предметов');
    const num = (v, d) => (Number.isFinite(+v) ? +v : d);
    const items = data.items.filter((i) => i && typeof i === 'object').map((i) => {
      const base = CAT.get(i.cat) || {};
      const rot = [0, 90, 180, 270].includes(+i.rot) ? +i.rot : 0;
      return {
        ...base, group: undefined,
        id: String(i.id || newId()), cat: String(i.cat || ''), name: String(i.name || base.name || 'Предмет').slice(0, 80),
        w: Math.max(1, num(i.w, base.w || 60)), d: Math.max(1, num(i.d, base.d || 60)), h: Math.max(1, num(i.h, base.h || 60)),
        z: Math.max(0, num(i.z, base.z || 0)), x: num(i.x, 0), y: num(i.y, 0), rot,
        role: String(i.role || base.role || 'furniture'), kind: String(i.kind || base.kind || 'cabinet'),
        color: /^#[0-9a-f]{3,8}$/i.test(i.color) ? i.color : base.color || '#cccccc',
        price: i.price != null ? Math.max(0, num(i.price, 0)) : undefined,
      };
    });
    return {
      items,
      doors: data.doors && typeof data.doors === 'object' ? data.doors : {},
      minPass: data.minPass && typeof data.minPass === 'object' ? data.minPass : {},
      design: DESIGNS.some((d) => d.id === data.design) ? data.design : null,
    };
  }

  /* ---------- Камера плана ---------- */
  const svg = $('plan');
  function fitCam(bounds) {
    const r = svg.getBoundingClientRect();
    const W = r.width || 800, H = r.height || 600;
    const bw = bounds.x1 - bounds.x0, bh = bounds.y1 - bounds.y0;
    const k = Math.max(bw / W, bh / H);
    S.cam = { x: (bounds.x0 + bounds.x1) / 2 - (W * k) / 2, y: (bounds.y0 + bounds.y1) / 2 - (H * k) / 2, k };
  }
  function focusBounds() {
    if (S.focus === 'all') return Draw.planBounds();
    const b = Geo.polyBox(APT.rooms.find((r) => r.id === S.focus).poly);
    const m = 34;
    return { x0: b.x0 - m, y0: b.y0 - m, x1: b.x1 + m, y1: b.y1 + m };
  }
  function toWorld(e) {
    const r = svg.getBoundingClientRect();
    return { x: S.cam.x + (e.clientX - r.left) * S.cam.k, y: S.cam.y + (e.clientY - r.top) * S.cam.k };
  }
  function zoomAt(cx, cy, factor) {
    const r = svg.getBoundingClientRect();
    const k = Math.max(0.12, Math.min(2.5, S.cam.k * factor));
    const wx = S.cam.x + (cx - r.left) * S.cam.k, wy = S.cam.y + (cy - r.top) * S.cam.k;
    S.cam = { k, x: wx - (cx - r.left) * k, y: wy - (cy - r.top) * k };
    renderPlan();
  }

  /* ---------- Привязка ---------- */
  function snapCandidates(moving, room) {
    const xs = [], ys = [];
    const push = (poly) => poly.forEach(([x, y]) => { xs.push(x); ys.push(y); });
    if (room) push(room.poly); else APT.rooms.forEach((r) => push(r.poly));
    S.items.forEach((o) => {
      if (o.id === moving.id || o.role === 'point') return;
      if (room && roomOf(APT, o) !== room) return;
      const b = box(o);
      xs.push(b.x0, b.x1); ys.push(b.y0, b.y1);
    });
    if (room) APT.fixed.filter((f) => f.room === room.id).forEach((f) => {
      xs.push(f.rect[0], f.rect[2]); ys.push(f.rect[1], f.rect[3]);
    });
    return { xs, ys };
  }
  function bestSnap(lo, hi, cands, thr) {
    let best = null;
    for (const c of cands) for (const edge of [lo, hi]) {
      const d = c - edge;
      if (Math.abs(d) <= thr && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, v: c };
    }
    return best;
  }
  // Спинкой к ближайшей стене — для новых предметов из каталога.
  function hugRotation(room, x, y) {
    const b = Geo.polyBox(room.poly);
    const opts = [[y - b.y0, 0], [b.x1 - x, 90], [b.y1 - y, 180], [x - b.x0, 270]];
    return opts.sort((p, q) => p[0] - q[0])[0][1];
  }
  function placeAt(it, wx, wy, freeMove) {
    const room = roomAt(APT, wx, wy);
    if (it._new && it.hug && room) it.rot = hugRotation(room, wx, wy);
    const b = box(it);
    let x = wx - b.w / 2, y = wy - b.d / 2;
    S.guides = [];
    if (!freeMove) {
      const { xs, ys } = snapCandidates(it, room);
      const thr = S.view === 'plan' && S.cam ? Math.max(7, 9 * S.cam.k) : 8;
      const sx = bestSnap(x, x + b.w, xs, thr), sy = bestSnap(y, y + b.d, ys, thr);
      if (sx) { x += sx.d; S.guides.push({ axis: 'x', v: sx.v }); } else x = Math.round(x / 5) * 5;
      if (sy) { y += sy.d; S.guides.push({ axis: 'y', v: sy.v }); } else y = Math.round(y / 5) * 5;
    }
    it.x = Math.round(x * 10) / 10;
    it.y = Math.round(y * 10) / 10;
  }

  // Первое свободное место вдоль стен выбранной комнаты.
  function autoPlace(it) {
    const room = APT.rooms.find((r) => r.id === S.focus) || lastRoom();
    const bb = Geo.polyBox(room.poly);
    const z0 = it.z || 0, z1 = z0 + it.h;
    const fits = () => {
      const b = box(it);
      if (!Geo.boxInPoly(b, room.poly)) return false;
      if (APT.fixed.some((f) => Geo.overlap(b, Geo.fixedBox(f)) && z0 < f.z + f.h && f.z < z1)) return false;
      if (APT.openings.some((o) => { const s = Geo.swingBox(o, S.doors); return s && Geo.overlap(b, s); })) return false;
      return !S.items.some((o) => o.role !== 'point' && o.id !== it.id && Geo.overlap(b, box(o)) && z0 < (o.z || 0) + o.h && (o.z || 0) < z1);
    };
    const tries = [];
    for (let t = 0; t <= 1000; t += 5) {
      tries.push([bb.x0 + t, bb.y0, 0], [bb.x1, bb.y0 + t, 90], [bb.x1 - t, bb.y1, 180], [bb.x0, bb.y1 - t, 270]);
    }
    for (const [ax, ay, rot] of tries) {
      if (!it.hug && rot !== 0) continue;
      it.rot = it.hug ? rot : 0;
      const b = box(it);
      it.x = rot === 90 ? ax - b.w : ax;
      it.y = rot === 180 ? ay - b.d : ay;
      if (rot === 180) it.x = ax - b.w;
      if (rot === 270) it.y = ay - b.d;
      if (fits()) return true;
    }
    if (!it.hug) {
      for (let y = bb.y0; y < bb.y1; y += 10) for (let x = bb.x0; x < bb.x1; x += 10) {
        it.x = x; it.y = y;
        if (fits()) return true;
      }
    }
    it.rot = 0; it.x = (bb.x0 + bb.x1 - it.w) / 2; it.y = (bb.y0 + bb.y1 - it.d) / 2;
    return false;
  }
  let activeRoom = 'kitchen';
  const lastRoom = () => APT.rooms.find((r) => r.id === activeRoom) || APT.rooms[0];

  /* ---------- Рисование ---------- */
  function issuesMap() {
    const m = new Map();
    S.checks.forEach((c) => c.ids.forEach((id) => {
      if (c.level === 'error' || (c.level === 'warn' && m.get(id) !== 'error')) m.set(id, c.level);
    }));
    return m;
  }
  function planCtx(u) {
    return {
      u, items: S.items, doors: S.doors, layers: S.layers, guides: S.guides, issues: issuesMap(),
      selected: S.sel && S.sel.type === 'item' ? S.sel.id : null,
      selectedOpening: S.sel && S.sel.type === 'opening' ? S.sel.id : null,
      selectedOutlet: S.sel && S.sel.type === 'outlet' ? S.sel.id : null,
    };
  }
  function renderPlan() {
    if (S.view !== 'plan') return;
    const r = svg.getBoundingClientRect();
    if (!r.width || !r.height) return;
    if (!S.cam) fitCam(focusBounds());
    svg.setAttribute('viewBox', `${S.cam.x} ${S.cam.y} ${r.width * S.cam.k} ${r.height * S.cam.k}`);
    svg.innerHTML = Draw.planMarkup(planCtx(S.cam.k));
  }
  function renderWall() {
    if (S.view !== 'wall') return;
    const room = APT.rooms.find((r) => r.id === S.wallRoom);
    if (S.wallEdge >= room.poly.length) S.wallEdge = 0;
    $('wallChips').innerHTML = room.walls.map((w, i) => `<button data-edge="${i}" class="${i === S.wallEdge ? 'on' : ''}">${esc(w)}</button>`).join('');
    const { markup, vb } = Draw.elevationMarkup(S.wallRoom, S.wallEdge, S.items);
    const el = $('elev');
    el.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    el.innerHTML = markup;
  }
  function render3d() {
    if (S.view !== 'd3') return;
    View3D.mount($('d3'));
    View3D.resize();
    View3D.update(S.items, S.sel && S.sel.type === 'item' ? S.sel.id : null, issuesMap());
  }
  function runChecks() {
    S.checks = Geo.runChecks(APT, S.items.filter((i) => !i._new), { doors: S.doors, minPass: S.minPass, maskCache });
  }
  function refresh() {
    const theme = currentTheme();
    Draw.setTheme(theme);
    View3D.setTheme(theme);
    runChecks();
    renderPlan(); renderWall(); render3d();
    renderSide(); renderStatus();
    $('undo').disabled = !history.past.length;
    $('redo').disabled = !history.future.length;
  }

  function renderStatus() {
    const count = (l) => S.checks.filter((c) => c.level === l).length;
    const e = count('error'), w = count('warn');
    const badge = $('checkBadge');
    badge.textContent = e + w || '';
    badge.className = 'badge' + (e ? '' : w ? ' warn' : ' none');
    const parts = [`Предметов: ${S.items.length}`, `Ошибок: ${e}`, `Замечаний: ${w}`, `Потолок: ${APT.CEILING} см`];
    if (S.cursor) parts.push(S.cursor);
    $('status').innerHTML = parts.map((p) => `<span>${esc(p)}</span>`).join('');
  }

  /* ---------- Каталог ---------- */
  function renderCatalog(q = '') {
    const query = q.trim().toLowerCase();
    const groups = new Map();
    CATALOG.filter((c) => !query || c.name.toLowerCase().includes(query) || c.group.toLowerCase().includes(query))
      .forEach((c) => { if (!groups.has(c.group)) groups.set(c.group, []); groups.get(c.group).push(c); });
    const html = [...groups].map(([g, list], i) => `<details class="cat-group"${query || i < 2 ? ' open' : ''}><summary>${esc(g)}</summary>${list.map((c) =>
      `<button class="card" data-cat="${c.id}" style="border-left-color:${c.color}"><span>${esc(c.name)}</span><small>${c.role === 'point' ? `h ${c.z}` : `${c.w}×${c.d}`}</small></button>`).join('')}</details>`).join('');
    $('catalogList').innerHTML = html || '<p class="hint">Ничего не нашлось.</p>';
  }

  /* ---------- Панель ---------- */
  function selectedItem() { return S.sel && S.sel.type === 'item' ? S.items.find((i) => i.id === S.sel.id) : null; }

  function sourceTag(src) {
    return src === 'measured' ? '<span class="tag">по замерам</span>' : '<span class="tag plan">по плану, уточнить</span>';
  }
  function renderProps() {
    const el = $('tab-props');
    const it = selectedItem();
    if (it) {
      const b = box(it), room = roomOf(APT, it);
      const rb = room ? Geo.polyBox(room.poly) : null;
      const isPoint = it.role === 'point';
      el.innerHTML = `
        <h3>${esc(it.name)}</h3>
        <div class="form">
          <label class="full">Название<input type="text" data-f="name" value="${esc(it.name)}" maxlength="80"></label>
          ${isPoint ? `<label class="full">Высота центра, см<input type="number" step="0.5" data-f="zc" value="${(it.z || 0) + it.h / 2}"></label>` : `
          <label>Ширина, см<input type="number" min="1" step="0.5" data-f="w" value="${it.w}"></label>
          <label>Глубина, см<input type="number" min="1" step="0.5" data-f="d" value="${it.d}"></label>
          <label>Высота, см<input type="number" min="1" step="0.5" data-f="h" value="${it.h}"></label>
          <label>Низ от пола, см<input type="number" min="0" step="0.5" data-f="z" value="${it.z || 0}"></label>`}
          <label>X, см${rb ? ` <span class="muted">от левой стены: ${cm(b.x0 - rb.x0)}</span>` : ''}<input type="number" step="0.5" data-f="x" value="${it.x}"></label>
          <label>Y, см${rb ? ` <span class="muted">от верхней: ${cm(b.y0 - rb.y0)}</span>` : ''}<input type="number" step="0.5" data-f="y" value="${it.y}"></label>
          ${isPoint ? '' : `<label>Цвет<input type="color" data-f="color" value="${/^#[0-9a-f]{6}$/i.test(it.color || '') ? it.color : '#cccccc'}"></label>`}
          ${isPoint ? '' : `<label class="full">Цена, ₽<input type="number" min="0" step="100" data-f="price" value="${it.price != null ? it.price : ''}" placeholder="для сметы"></label>`}
        </div>
        <div class="row">
          ${isPoint ? '' : '<button data-act="rotate" title="Клавиша R">Повернуть 90°</button>'}
          <button data-act="dup" title="Ctrl+D">Копия</button>
          <button data-act="del" class="danger" title="Delete">Удалить</button>
        </div>
        <p class="hint">${room ? esc(room.name) : 'Вне комнат'}. Стрелки двигают на 1 см, с Shift на 5 см. Alt при перетаскивании отключает привязку.</p>`;
      return;
    }
    if (S.sel && S.sel.type === 'outlet') {
      const p = APT.outlets.find((o) => o.id === S.sel.id);
      const over = S.items.filter((i) => i.role === 'base' && Geo.roomOf(APT, i) && p.x >= box(i).x0 - 3 && p.x <= box(i).x1 + 3 && p.y >= box(i).y0 - 3 && p.y <= box(i).y1 + 3 && i.z + i.h < p.h);
      el.innerHTML = `<h3>Розетка</h3><dl class="kv">
        <dt>Стена</dt><dd>${esc(p.wall)}</dd><dt>Высота</dt><dd>${cm(p.h)} см</dd><dt>Положение</dt><dd>${esc(p.note)}</dd>
        ${over.length ? `<dt>Над столешницей</dt><dd>${cm(p.h - over[0].z - over[0].h)} см</dd>` : ''}</dl>
        <div class="row"><span class="tag">по замерам</span></div>`;
      return;
    }
    if (S.sel && S.sel.type === 'opening') {
      const o = APT.openings.find((x) => x.id === S.sel.id);
      const w = o.rect[2] - o.rect[0] > o.rect[3] - o.rect[1] ? o.rect[2] - o.rect[0] : o.rect[3] - o.rect[1];
      el.innerHTML = `<h3>${esc(o.name)}</h3><dl class="kv"><dt>Ширина</dt><dd>${cm(w)} см</dd>
        <dt>По высоте</dt><dd>${cm(o.sill)}–${cm(o.top)} см</dd></dl>
        <div class="row">${sourceTag(o.source)}</div>
        ${o.dir ? '<div class="row"><button data-act="flipHinge">Петли на другую сторону</button><button data-act="flipDir">Открывать в другую сторону</button></div>' : ''}`;
      return;
    }
    el.innerHTML = `<h3>Квартира</h3>
      <table class="spec"><tbody>${APT.rooms.map((r) => `<tr><td><button data-focus="${r.id}">${esc(r.name)}</button></td><td class="num">${cm(Math.round(Geo.polyArea(r.poly) * 10) / 10)} м²</td><td>${sourceTag(r.source)}</td></tr>`).join('')}</tbody></table>
      <h4>Как пользоваться</h4>
      <p class="muted">Выберите предмет в каталоге и перетащите на план. Шкафы сами встают спиной к ближайшей стене и прилипают к стенам и соседям.</p>
      <p class="muted">Клик по предмету, двери или розетке открывает свойства. R поворачивает, Delete удаляет.</p>`;
  }
  function renderChecks() {
    const el = $('tab-checks');
    const list = S.checks.length
      ? S.checks.map((c, i) => `<button class="check ${c.level}" data-check="${i}">${esc(c.text)}</button>`).join('')
      : '<div class="check ok">Всё в порядке: пересечений нет, проходы в норме, путь от входа открыт везде.</div>';
    el.innerHTML = `<h3>Проверки</h3>${list}
      <h4>Минимальный проход, см</h4>
      <div class="passes">${APT.rooms.map((r) => `<label for="pass-${r.id}">${esc(r.name)}</label><input id="pass-${r.id}" type="number" min="30" max="200" data-pass="${r.id}" value="${S.minPass[r.id] || r.minPass}">`).join('')}</div>`;
  }
  function specRows() {
    const rooms = new Map();
    for (const it of S.items) {
      if (it.role === 'point') continue;
      const room = roomOf(APT, it);
      const rn = room ? room.name : 'Вне комнат';
      if (!rooms.has(rn)) rooms.set(rn, new Map());
      const key = `${it.name}|${it.w}|${it.d}|${it.h}|${it.price || 0}`;
      const g = rooms.get(rn);
      if (!g.has(key)) g.set(key, { name: it.name, size: `${cm(it.w)}×${cm(it.d)}×${cm(it.h)}`, qty: 0, price: it.price || 0 });
      g.get(key).qty++;
    }
    return rooms;
  }
  function renderSpec() {
    const rooms = specRows();
    let total = 0, html = '';
    for (const [rn, g] of rooms) {
      html += `<tr class="room"><td colspan="4">${esc(rn)}</td></tr>`;
      for (const r of g.values()) {
        total += r.price * r.qty;
        html += `<tr><td>${esc(r.name)}<br><small class="muted">${r.size}</small></td><td class="num">${r.qty}</td><td class="num">${r.price ? (r.price * r.qty).toLocaleString('ru-RU') + ' ₽' : '—'}</td></tr>`;
      }
    }
    $('tab-spec').innerHTML = `<h3>Смета</h3>${html
      ? `<table class="spec"><thead><tr><th>Предмет, Ш×Г×В</th><th class="num">Шт.</th><th class="num">Сумма</th></tr></thead><tbody>${html}</tbody></table>
         <p><strong>Итого: ${total.toLocaleString('ru-RU')} ₽</strong></p>
         <p class="hint">Цену вводите в свойствах предмета.</p>
         <div class="row"><button data-act="csv">Скачать таблицу (CSV)</button></div>`
      : '<p class="muted">Пока ничего не поставлено.</p>'}`;
  }
  function renderSide() {
    const active = document.activeElement;
    const typing = active && active.closest && active.closest('.side') && active.matches('input');
    // Не перерисовываем поле, в котором человек сейчас печатает.
    if (!typing || S.tab !== 'props') renderProps();
    if (!typing || S.tab !== 'checks') renderChecks();
    renderSpec();
    document.querySelectorAll('#tab-designs .design').forEach((b) => b.classList.toggle('on', b.dataset.design === S.design));
  }
  function renderDesigns() {
    const b = Draw.planBounds();
    const u = (b.x1 - b.x0) / 150;
    const layers = { upper: false, outlets: false, dims: false, hints: false };
    const cards = DESIGNS.map((d) => {
      Draw.setTheme(d.theme);
      const inner = Draw.planMarkup({ u, items: designItems(d), doors: {}, layers, guides: [], issues: new Map() });
      return `<button class="design" data-design="${d.id}">
        <svg viewBox="${b.x0} ${b.y0} ${b.x1 - b.x0} ${b.y1 - b.y0}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}</svg>
        <strong>${esc(d.title)}</strong><p>${esc(d.desc)}</p>
        <span class="swatches">${d.swatches.map((c) => `<i style="background:${c}"></i>`).join('')}</span>
      </button>`;
    }).join('');
    Draw.setTheme(currentTheme());
    $('tab-designs').innerHTML = `<h3>Дизайны</h3><p class="muted">Выбор заменяет текущую расстановку. Вернуть прежнюю можно кнопкой «Отменить». Лучше всего смотреть в 3D.</p>${cards}`;
  }

  /* ---------- Действия ---------- */
  function selectItem(id) { S.sel = id ? { type: 'item', id } : null; showTab('props'); }
  function showTab(t) {
    S.tab = t;
    document.querySelectorAll('#sideTabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    ['props', 'checks', 'spec', 'designs'].forEach((n) => { $('tab-' + n).hidden = n !== t; });
  }
  function showView(v) {
    S.view = v;
    document.querySelectorAll('#viewTabs button').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
    $('planPane').hidden = v !== 'plan';
    $('wallPane').hidden = v !== 'wall';
    $('d3Pane').hidden = v !== 'd3';
    if (v === 'plan') S.cam = S.cam || null;
    refresh();
    if (v === 'd3') View3D.focus(focusBounds());
  }
  function setFocus(id) {
    S.focus = id;
    if (id !== 'all') { activeRoom = id; S.wallRoom = id; S.wallEdge = 0; $('wallRoom').value = id; }
    $('focus').value = id;
    S.cam = null;
    refresh();
    if (S.view === 'd3') View3D.focus(focusBounds());
  }
  function deleteSelected() {
    const it = selectedItem();
    if (!it) return;
    mutate(() => { S.items = S.items.filter((i) => i !== it); S.sel = null; });
  }
  function rotateSelected() {
    const it = selectedItem();
    if (!it || it.role === 'point') return;
    mutate(() => {
      const b = box(it), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
      it.rot = ((it.rot || 0) + 90) % 360;
      const nb = box(it);
      it.x = Math.round((cx - nb.w / 2) * 10) / 10;
      it.y = Math.round((cy - nb.d / 2) * 10) / 10;
    });
  }
  function duplicateSelected() {
    const it = selectedItem();
    if (!it) return;
    mutate(() => {
      const copy = { ...it, id: newId() };
      const b = box(it);
      const horizontal = b.w <= b.d;
      if (horizontal) copy.y = it.y + b.d; else copy.x = it.x + b.w;
      S.items.push(copy);
      S.sel = { type: 'item', id: copy.id };
    });
  }
  function download(name, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function savePng() {
    if (S.view === 'd3') {
      const url = View3D.png();
      if (url) fetch(url).then((r) => r.blob()).then((b) => download('kvartira-3d.png', b));
      return;
    }
    let vb, inner, scale;
    if (S.view === 'wall') {
      const e = Draw.elevationMarkup(S.wallRoom, S.wallEdge, S.items);
      vb = e.vb; inner = e.markup; scale = 4;
    } else {
      const b = focusBounds();
      vb = { x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0 };
      scale = 2.4;
      inner = Draw.planMarkup({ ...planCtx(1 / scale), selected: null, selectedOpening: null, selectedOutlet: null, guides: [] });
    }
    const W = Math.round(vb.w * scale), H = Math.round(vb.h * scale);
    const src = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}"><rect x="${vb.x}" y="${vb.y}" width="${vb.w}" height="${vb.h}" fill="#fff"/>${inner}</svg>`;
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      c.getContext('2d').drawImage(img, 0, 0);
      c.toBlob((blob) => download(S.view === 'wall' ? 'kvartira-stena.png' : 'kvartira-plan.png', blob), 'image/png');
    };
    img.onerror = () => alert('Не получилось собрать картинку PNG.');
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(src);
  }
  function saveCsv() {
    const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [['Комната', 'Предмет', 'Размер Ш×Г×В, см', 'Количество', 'Цена, ₽', 'Сумма, ₽'].map(q).join(';')];
    for (const [rn, g] of specRows()) for (const r of g.values()) {
      lines.push([rn, r.name, r.size, r.qty, r.price, r.price * r.qty].map(q).join(';'));
    }
    download('kvartira-smeta.csv', new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  }

  /* ---------- Указатель на плане ---------- */
  let drag = null;
  const pointers = new Map();
  let pinch = null;

  svg.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    svg.setPointerCapture(e.pointerId);
    if (pointers.size === 2) { drag = null; pinch = null; return; }
    closeMenu();
    const t = e.target.closest ? e.target : e.target.parentElement;
    const itemEl = t.closest('[data-item]'), outEl = t.closest('[data-outlet]'), opEl = t.closest('[data-opening]');
    const w = toWorld(e);
    if (itemEl) {
      const it = S.items.find((i) => i.id === itemEl.dataset.item);
      const b = box(it);
      selectItem(it.id);
      drag = { type: 'item', it, ox: w.x - (b.x0 + b.x1) / 2, oy: w.y - (b.y0 + b.y1) / 2, before: snapshot(), moved: false, sx: e.clientX, sy: e.clientY };
      refresh();
    } else if (outEl) {
      S.sel = { type: 'outlet', id: outEl.dataset.outlet }; showTab('props'); refresh();
    } else if (opEl) {
      S.sel = { type: 'opening', id: opEl.dataset.opening }; showTab('props'); refresh();
    } else {
      const room = roomAt(APT, w.x, w.y);
      if (room) activeRoom = room.id;
      drag = { type: 'pan', sx: e.clientX, sy: e.clientY, cam: { ...S.cam }, moved: false };
    }
  });
  svg.addEventListener('pointermove', (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch) zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, pinch / d);
      pinch = d;
      return;
    }
    const w = toWorld(e);
    const room = roomAt(APT, w.x, w.y);
    S.cursor = room ? `${room.name}: x ${cm(Math.round(w.x))}, y ${cm(Math.round(w.y))}` : '';
    if (!drag) { renderStatus(); return; }
    if (drag.type === 'pan') {
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      S.cam.x = drag.cam.x - dx * S.cam.k;
      S.cam.y = drag.cam.y - dy * S.cam.k;
      renderPlan();
      return;
    }
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 3) return;
    drag.moved = true;
    placeAt(drag.it, w.x - drag.ox, w.y - drag.oy, e.altKey);
    runChecks();
    renderPlan(); renderStatus();
  });
  function endPointer(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!drag) return;
    if (drag.type === 'pan') {
      if (!drag.moved) { S.sel = null; refresh(); }
    } else {
      S.guides = [];
      if (drag.moved) commit(drag.before); else refresh();
    }
    drag = null;
  }
  svg.addEventListener('pointerup', endPointer);
  svg.addEventListener('pointercancel', endPointer);
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, Math.exp(e.deltaY * 0.0012));
  }, { passive: false });

  /* ---------- Перетаскивание из каталога ---------- */
  let cardDrag = null;
  $('catalogList').addEventListener('pointerdown', (e) => {
    const card = e.target.closest('.card');
    if (!card || e.button) return;
    cardDrag = { cat: card.dataset.cat, sx: e.clientX, sy: e.clientY, it: null, before: snapshot(), touch: e.pointerType === 'touch' };
  });
  window.addEventListener('pointermove', (e) => {
    if (!cardDrag || cardDrag.touch) return;
    if (S.view === 'wall') return;
    const r = (S.view === 'plan' ? svg : $('d3')).getBoundingClientRect();
    const over = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (over && !cardDrag.it) {
      cardDrag.it = makeItem(cardDrag.cat);
      cardDrag.it._new = true;
      S.items.push(cardDrag.it);
      S.sel = { type: 'item', id: cardDrag.it.id };
    }
    if (cardDrag.it) {
      const p = S.view === 'plan'
        ? { x: S.cam.x + (e.clientX - r.left) * S.cam.k, y: S.cam.y + (e.clientY - r.top) * S.cam.k }
        : (() => { const f = View3D.floorPoint(e); return f && { x: f.x, y: f.z }; })();
      if (p) placeAt(cardDrag.it, p.x, p.y, e.altKey);
      if (!over) {
        S.items = S.items.filter((i) => i !== cardDrag.it);
        S.sel = null; cardDrag.it = null; S.guides = [];
      }
      renderPlan(); render3d();
    }
  });
  window.addEventListener('pointerup', (e) => {
    if (!cardDrag) return;
    const c = cardDrag;
    cardDrag = null;
    if (c.it) {
      delete c.it._new;
      S.guides = [];
      const room = roomOf(APT, c.it);
      if (room) activeRoom = room.id;
      showTab('props');
      commit(c.before);
      return;
    }
    if (Math.hypot(e.clientX - c.sx, e.clientY - c.sy) > 8) return;
    if (!e.target.closest || !e.target.closest('.card')) return;
    // Простой клик: ставим в первое свободное место текущей комнаты.
    mutate(() => {
      const it = makeItem(c.cat);
      autoPlace(it);
      S.items.push(it);
      S.sel = { type: 'item', id: it.id };
    });
    showTab('props');
    if (S.view !== 'plan') showView(S.view);
  });
  window.addEventListener('pointercancel', () => { cardDrag = null; });

  /* ---------- Панели и кнопки ---------- */
  $('search').addEventListener('input', (e) => renderCatalog(e.target.value));
  $('sideTabs').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) showTab(b.dataset.tab);
  });
  $('viewTabs').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) showView(b.dataset.view);
  });
  $('focus').innerHTML = '<option value="all">Всю квартиру</option>' + APT.rooms.map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join('');
  $('focus').addEventListener('change', (e) => setFocus(e.target.value));
  $('wallRoom').innerHTML = APT.rooms.map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join('');
  $('wallRoom').value = S.wallRoom;
  $('wallRoom').addEventListener('change', (e) => { S.wallRoom = e.target.value; S.wallEdge = 0; renderWall(); });
  $('wallChips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-edge]');
    if (b) { S.wallEdge = +b.dataset.edge; renderWall(); }
  });
  $('elev').addEventListener('click', (e) => {
    const el = e.target.closest('[data-item]');
    if (el) { selectItem(el.dataset.item); refresh(); }
  });
  ['Upper', 'Outlets', 'Dims', 'Hints'].forEach((n) => {
    const key = n.toLowerCase();
    $('layer' + n).checked = S.layers[key];
    $('layer' + n).addEventListener('change', (e) => { S.layers[key] = e.target.checked; renderPlan(); });
  });
  const centerZoom = (f) => { const r = svg.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, f); };
  $('zoomIn').onclick = () => centerZoom(0.8);
  $('zoomOut').onclick = () => centerZoom(1.25);
  $('zoomFit').onclick = () => setFocus('all');
  $('cut').addEventListener('input', (e) => {
    $('cutVal').textContent = e.target.value;
    View3D.setCut(+e.target.value);
    render3d();
  });
  $('autoHide').addEventListener('change', (e) => View3D.setAutoHide(e.target.checked));

  /* ---------- Правка в 3D ---------- */
  let drag3d = null;
  View3D.setHandlers({
    doors: () => S.doors,
    select(id) {
      S.sel = id ? { type: 'item', id } : null;
      if (id) showTab('props');
      runChecks(); render3d(); renderSide();
    },
    dragStart(id) { drag3d = { it: S.items.find((i) => i.id === id), before: snapshot() }; },
    dragMove(x, y, alt) {
      if (!drag3d) return;
      placeAt(drag3d.it, x, y, alt);
      runChecks(); render3d(); renderStatus();
    },
    dragEnd() {
      if (!drag3d) return;
      S.guides = [];
      commit(drag3d.before);
      drag3d = null;
    },
    action(a) {
      if (a === 'rotate') rotateSelected();
      if (a === 'dup') duplicateSelected();
      if (a === 'del') deleteSelected();
    },
    liftStart() {
      const it = selectedItem();
      if (it) drag3d = { it, before: snapshot(), z0: it.z || 0 };
    },
    liftMove(dz) {
      if (!drag3d || drag3d.z0 === undefined) return;
      const it = drag3d.it;
      it.z = Math.max(0, Math.min(APT.CEILING - it.h, Math.round((drag3d.z0 + dz) / 1)));
      runChecks(); render3d(); renderStatus();
    },
    liftEnd() {
      if (!drag3d) return;
      commit(drag3d.before);
      drag3d = null;
    },
  });
  if (!Models3D.useAssets) $('d3Hint').textContent = 'Файл открыт с диска: модели и текстуры видны только на сайте или через локальный сервер.';

  function undo() {
    if (!history.past.length) return;
    history.future.push(snapshot());
    restore(history.past.pop());
    save(); refresh();
  }
  function redo() {
    if (!history.future.length) return;
    history.past.push(snapshot());
    restore(history.future.pop());
    save(); refresh();
  }
  $('undo').onclick = undo;
  $('redo').onclick = redo;

  const closeMenu = () => { $('fileMenu').open = false; };
  document.addEventListener('pointerdown', (e) => { if (!e.target.closest('#fileMenu')) closeMenu(); });
  $('savePng').onclick = () => { closeMenu(); savePng(); };
  $('saveJson').onclick = () => {
    closeMenu();
    download('kvartira-raskladka.json', new Blob([JSON.stringify({ version: 1, ...JSON.parse(snapshot()) }, null, 2)], { type: 'application/json' }));
  };
  $('loadJson').onclick = () => { closeMenu(); $('fileInput').click(); };
  $('fileInput').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const data = sanitize(JSON.parse(await f.text()));
      mutate(() => { S.items = data.items; S.doors = data.doors; S.minPass = data.minPass; S.design = data.design; S.sel = null; });
    } catch (err) {
      alert('Не получилось открыть файл: ' + err.message);
    }
  });
  document.querySelectorAll('[data-preset]').forEach((b) => {
    b.onclick = () => { closeMenu(); mutate(() => loadPreset(b.dataset.preset)); };
  });
  $('clearAll').onclick = () => { closeMenu(); mutate(() => { S.items = []; S.design = null; S.sel = null; }); };

  $('tab-props').addEventListener('click', (e) => {
    const f = e.target.closest('[data-focus]');
    if (f) { setFocus(f.dataset.focus); return; }
    const act = e.target.closest('[data-act]');
    if (!act) return;
    const a = act.dataset.act;
    if (a === 'rotate') rotateSelected();
    if (a === 'dup') duplicateSelected();
    if (a === 'del') deleteSelected();
    if (a === 'flipHinge' || a === 'flipDir') {
      const op = APT.openings.find((o) => o.id === S.sel.id);
      mutate(() => {
        const cur = Geo.doorState(op, S.doors);
        S.doors = { ...S.doors, [op.id]: a === 'flipHinge'
          ? { ...cur, hinge: cur.hinge === 'a' ? 'b' : 'a' }
          : { ...cur, dir: [-cur.dir[0], -cur.dir[1]] } };
      });
      View3D.rebuildStatic();
    }
  });
  $('tab-props').addEventListener('change', (e) => {
    const f = e.target.dataset.f, it = selectedItem();
    if (!f || !it) return;
    mutate(() => {
      if (f === 'name') { it.name = e.target.value.slice(0, 80) || it.name; return; }
      if (f === 'color') { it.color = e.target.value; return; }
      const v = parseFloat(e.target.value);
      if (f === 'price') { if (Number.isFinite(v) && v >= 0) it.price = v; else delete it.price; return; }
      if (!Number.isFinite(v)) return;
      if (f === 'zc') { it.z = Math.max(0, v - it.h / 2); return; }
      if (f === 'w' || f === 'd' || f === 'h') it[f] = Math.max(1, v);
      else if (f === 'z') it.z = Math.max(0, v);
      else it[f] = v;
    });
    e.target.blur();
  });
  $('tab-designs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-design]');
    if (!b) return;
    const d = DESIGNS.find((x) => x.id === b.dataset.design);
    mutate(() => { S.items = designItems(d); S.design = d.id; S.sel = null; });
    if (S.view === 'd3') View3D.focus(focusBounds());
  });
  $('tab-checks').addEventListener('click', (e) => {
    const b = e.target.closest('[data-check]');
    if (!b) return;
    const c = S.checks[+b.dataset.check];
    if (c.ids[0]) { S.sel = { type: 'item', id: c.ids[0] }; if (S.view !== 'plan') showView('plan'); refresh(); }
  });
  $('tab-checks').addEventListener('change', (e) => {
    const id = e.target.dataset.pass;
    if (!id) return;
    const v = parseFloat(e.target.value);
    mutate(() => { if (Number.isFinite(v) && v > 0) S.minPass = { ...S.minPass, [id]: v }; });
    e.target.blur();
  });
  $('tab-spec').addEventListener('click', (e) => {
    if (e.target.closest('[data-act="csv"]')) saveCsv();
  });

  document.addEventListener('keydown', (e) => {
    const typing = e.target.matches('input, select, textarea');
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && (key === 'z' || key === 'я')) { if (typing) return; e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && (key === 'y' || key === 'н')) { if (typing) return; e.preventDefault(); redo(); return; }
    if (typing) return;
    if (mod && (key === 'd' || key === 'в')) { e.preventDefault(); duplicateSelected(); return; }
    if (mod) return;
    if (key === 'delete' || key === 'backspace') { e.preventDefault(); deleteSelected(); }
    else if (key === 'r' || key === 'к') rotateSelected();
    else if (key === 'escape') { S.sel = null; refresh(); }
    else if (key.startsWith('arrow')) {
      const it = selectedItem();
      if (!it) return;
      e.preventDefault();
      const step = e.shiftKey ? 5 : 1;
      const dir = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] }[key];
      mutate(() => { it.x += dir[0] * step; it.y += dir[1] * step; });
    }
  });
  new ResizeObserver(() => { S.cam = null; renderPlan(); }).observe(svg);

  /* ---------- Запуск ---------- */
  renderCatalog();
  renderDesigns();
  let stored = null;
  try { stored = localStorage.getItem(STORE); } catch (e) { /* хранилище недоступно */ }
  try {
    if (stored) {
      const d = sanitize(JSON.parse(stored));
      S.items = d.items; S.doors = d.doors; S.minPass = d.minPass; S.design = d.design;
    } else loadPreset('example');
  } catch (e) { loadPreset('example'); }
  refresh();
})();
