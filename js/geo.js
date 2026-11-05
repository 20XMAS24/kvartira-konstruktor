// Геометрия и проверки. Без DOM: этот же файл запускается в тестах под Node.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Geo = factory();
})(this, function () {
  const EPS = 0.5;

  function box(it) {
    const turned = ((it.rot || 0) % 180) !== 0;
    const w = turned ? it.d : it.w;
    const d = turned ? it.w : it.d;
    return { x0: it.x, y0: it.y, x1: it.x + w, y1: it.y + d, w, d };
  }

  function frontDir(rot) {
    return { 0: [0, 1], 90: [-1, 0], 180: [0, -1], 270: [1, 0] }[((rot || 0) % 360 + 360) % 360];
  }

  function overlap(a, b, eps = EPS) {
    return a.x0 < b.x1 - eps && b.x0 < a.x1 - eps && a.y0 < b.y1 - eps && b.y0 < a.y1 - eps;
  }

  function pointInPoly(px, py, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  function roomAt(apt, x, y) {
    return apt.rooms.find((r) => pointInPoly(x, y, r.poly)) || null;
  }

  function roomOf(apt, it) {
    const b = box(it);
    return roomAt(apt, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
  }

  // Прямоугольник целиком внутри контура (с допуском, контур кухни чуть скошен).
  function boxInPoly(b, poly, tol = 1.3) {
    const s = { x0: b.x0 + tol, y0: b.y0 + tol, x1: b.x1 - tol, y1: b.y1 - tol };
    const corners = [[s.x0, s.y0], [s.x1, s.y0], [s.x1, s.y1], [s.x0, s.y1]];
    if (!corners.every(([x, y]) => pointInPoly(x, y, poly))) return false;
    return !poly.some(([x, y]) => x > s.x0 && x < s.x1 && y > s.y0 && y < s.y1);
  }

  function polyArea(poly) {
    let a = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
    return Math.abs(a) / 2 / 10000;
  }

  function polyBox(poly) {
    const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  }

  const fixedBox = (f) => ({ x0: f.rect[0], y0: f.rect[1], x1: f.rect[2], y1: f.rect[3] });

  // Стены как набор прямоугольников: сетка строится по всем значимым координатам,
  // клетка — стена, если она не в комнате, не в проёме и рядом с какой-то комнатой.
  function wallBoxes(apt, thickness = 20) {
    const xs = new Set(), ys = new Set();
    const expanded = apt.rooms.map((r) => {
      const b = polyBox(r.poly);
      return { x0: b.x0 - thickness, y0: b.y0 - thickness, x1: b.x1 + thickness, y1: b.y1 + thickness };
    });
    expanded.forEach((b) => { xs.add(b.x0); xs.add(b.x1); ys.add(b.y0); ys.add(b.y1); });
    apt.rooms.forEach((r) => r.poly.forEach(([x, y]) => { xs.add(x); ys.add(y); }));
    apt.openings.forEach((o) => { xs.add(o.rect[0]); xs.add(o.rect[2]); ys.add(o.rect[1]); ys.add(o.rect[3]); });
    const X = [...xs].sort((a, b) => a - b), Y = [...ys].sort((a, b) => a - b);
    const out = [];
    for (let j = 0; j < Y.length - 1; j++) {
      let run = null;
      for (let i = 0; i < X.length - 1; i++) {
        const cx = (X[i] + X[i + 1]) / 2, cy = (Y[j] + Y[j + 1]) / 2;
        const wall = !roomAt(apt, cx, cy)
          && !apt.openings.some((o) => cx > o.rect[0] && cx < o.rect[2] && cy > o.rect[1] && cy < o.rect[3])
          && expanded.some((b) => cx > b.x0 && cx < b.x1 && cy > b.y0 && cy < b.y1);
        if (wall) {
          if (run) run.x1 = X[i + 1];
          else run = { x0: X[i], y0: Y[j], x1: X[i + 1], y1: Y[j + 1] };
        } else if (run) { out.push(run); run = null; }
      }
      if (run) out.push(run);
    }
    return out;
  }

  function doorState(op, overrides) {
    const o = (overrides && overrides[op.id]) || {};
    return { hinge: o.hinge || op.hinge, dir: o.dir || op.dir };
  }

  // Квадрат, который заметает открывающееся полотно.
  function swingBox(op, overrides) {
    if (!op.dir) return null;
    const { hinge, dir } = doorState(op, overrides);
    const H = hinge === 'a' ? op.a : op.b;
    const C = hinge === 'a' ? op.b : op.a;
    const W = Math.hypot(C[0] - H[0], C[1] - H[1]);
    const O = [H[0] + dir[0] * W, H[1] + dir[1] * W];
    return {
      x0: Math.min(H[0], C[0], O[0]), y0: Math.min(H[1], C[1], O[1]),
      x1: Math.max(H[0], C[0], O[0]), y1: Math.max(H[1], C[1], O[1]),
      H, C, O, W,
    };
  }

  const isFloorItem = (it) => it.role !== 'point' && (it.z || 0) < 120;

  // Расстояние от края предмета до стены вдоль полосы (x или y фиксирован).
  function rayToWall(room, x, y, dx, dy) {
    let best = Infinity;
    const P = room.poly;
    for (let i = 0; i < P.length; i++) {
      const [ax, ay] = P[i], [bx, by] = P[(i + 1) % P.length];
      const ex = bx - ax, ey = by - ay;
      const denom = dx * ey - dy * ex;
      if (Math.abs(denom) < 1e-9) continue;
      const t = ((ax - x) * ey - (ay - y) * ex) / denom;
      const u = ((ax - x) * dy - (ay - y) * dx) / denom;
      if (t >= -0.01 && u >= -1e-6 && u <= 1 + 1e-6) best = Math.min(best, Math.max(t, 0));
    }
    return best;
  }

  // Свободное место от предмета в заданную сторону: до стены или ближайшего предмета.
  function clearance(apt, it, items, dir, minSpan = 1) {
    const b = box(it);
    const room = roomOf(apt, it);
    if (!room) return null;
    const [dx, dy] = dir;
    const mx = (b.x0 + b.x1) / 2, my = (b.y0 + b.y1) / 2;
    const sx = dx > 0 ? b.x1 : dx < 0 ? b.x0 : mx;
    const sy = dy > 0 ? b.y1 : dy < 0 ? b.y0 : my;
    let dist = rayToWall(room, sx, sy, dx, dy), hit = 'стены';
    const obstacles = items
      .filter((o) => o.id !== it.id && isFloorItem(o) && !o.loose && roomOf(apt, o) === room)
      .map((o) => ({ b: box(o), name: o.name }))
      .concat(apt.fixed.filter((f) => f.room === room.id).map((f) => ({ b: fixedBox(f), name: f.name })));
    for (const o of obstacles) {
      const span = dx !== 0 ? Math.min(b.y1, o.b.y1) - Math.max(b.y0, o.b.y0) : Math.min(b.x1, o.b.x1) - Math.max(b.x0, o.b.x0);
      if (span < minSpan) continue;
      const g = dx > 0 ? o.b.x0 - b.x1 : dx < 0 ? b.x0 - o.b.x1 : dy > 0 ? o.b.y0 - b.y1 : b.y0 - o.b.y1;
      if (g >= -EPS && g < dist) { dist = Math.max(g, 0); hit = o.name; }
    }
    return { dist, hit, from: [sx, sy], to: [sx + dx * dist, sy + dy * dist] };
  }

  // Можно ли дойти от входной двери: сетка 5 см, запас 20 см от препятствий (плечи 40 см).
  const STEP = 5;
  function baseMask(apt) {
    const all = apt.rooms.map((r) => polyBox(r.poly));
    const x0 = Math.min(...all.map((b) => b.x0)) - 10, y0 = Math.min(...all.map((b) => b.y0)) - 10;
    const x1 = Math.max(...all.map((b) => b.x1)) + 10, y1 = Math.max(...all.map((b) => b.y1)) + 10;
    const nx = Math.ceil((x1 - x0) / STEP), ny = Math.ceil((y1 - y0) / STEP);
    const free = new Uint8Array(nx * ny);
    const passable = apt.openings.filter((o) => o.type !== 'window');
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const cx = x0 + (i + 0.5) * STEP, cy = y0 + (j + 0.5) * STEP;
      if (roomAt(apt, cx, cy)
        || passable.some((o) => cx >= o.rect[0] && cx <= o.rect[2] && cy >= o.rect[1] && cy <= o.rect[3])) free[j * nx + i] = 1;
    }
    return { x0, y0, nx, ny, free };
  }

  function reachable(apt, items, cache) {
    const m = cache || baseMask(apt);
    const { x0, y0, nx, ny } = m;
    const blocked = new Uint8Array(m.free);
    const stamp = (b) => {
      const i0 = Math.max(0, Math.floor((b.x0 - x0) / STEP)), i1 = Math.min(nx - 1, Math.floor((b.x1 - 0.01 - x0) / STEP));
      const j0 = Math.max(0, Math.floor((b.y0 - y0) / STEP)), j1 = Math.min(ny - 1, Math.floor((b.y1 - 0.01 - y0) / STEP));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) blocked[j * nx + i] = 0;
    };
    items.filter((it) => isFloorItem(it) && !it.loose).forEach((it) => stamp(box(it)));
    apt.fixed.forEach((f) => { if (f.kind !== 'radiator') stamp(fixedBox(f)); });

    // Сужаем свободную зону на ширину плеч: квадрат 40×40 см (20 см в каждую сторону от центра).
    const R = 3; // клеток: центр ± 15 см плюс половина клетки ≈ 17,5 см
    const walk = new Uint8Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if (!blocked[j * nx + i]) continue;
      let ok = true;
      for (let a = -R; a <= R && ok; a++) for (let c = -R; c <= R; c++) {
        const I = i + c, J = j + a;
        if (I < 0 || J < 0 || I >= nx || J >= ny || !blocked[J * nx + I]) { ok = false; break; }
      }
      walk[j * nx + i] = ok ? 1 : 0;
    }
    const idx = (x, y) => {
      const i = Math.floor((x - x0) / STEP), j = Math.floor((y - y0) / STEP);
      return i < 0 || j < 0 || i >= nx || j >= ny ? -1 : j * nx + i;
    };
    const seen = new Uint8Array(nx * ny);
    let start = idx(apt.entry[0], apt.entry[1]);
    if (start < 0 || !walk[start]) {
      // Сразу у двери стоит предмет: ищем ближайшую проходимую клетку у порога.
      start = -1;
      for (let r = 1; r <= 8 && start < 0; r++) {
        for (const [dx, dy] of [[r, 0], [-r, 0], [0, -r], [r, -r], [-r, -r]]) {
          const c = idx(apt.entry[0] + dx * STEP, apt.entry[1] + dy * STEP);
          if (c >= 0 && walk[c]) { start = c; break; }
        }
      }
    }
    if (start >= 0) {
      const q = [start]; seen[start] = 1;
      while (q.length) {
        const c = q.pop(), i = c % nx;
        const nb = [i > 0 ? c - 1 : -1, i < nx - 1 ? c + 1 : -1, c - nx, c + nx];
        for (const n of nb) if (n >= 0 && n < seen.length && walk[n] && !seen[n]) { seen[n] = 1; q.push(n); }
      }
    }
    const reached = {};
    apt.rooms.forEach((r) => { reached[r.id] = false; });
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if (!seen[j * nx + i]) continue;
      const room = roomAt(apt, x0 + (i + 0.5) * STEP, y0 + (j + 0.5) * STEP);
      if (room) reached[room.id] = true;
    }
    return reached;
  }

  function allOutlets(apt, items) {
    const custom = items.filter((it) => it.role === 'point').map((it) => {
      const b = box(it);
      const room = roomOf(apt, it);
      return { id: it.id, room: room && room.id, x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, h: (it.z || 0) + (it.h || 0) / 2, tag: null, custom: true };
    });
    return apt.outlets.concat(custom);
  }

  function distToBox(x, y, b) {
    const dx = Math.max(b.x0 - x, 0, x - b.x1), dy = Math.max(b.y0 - y, 0, y - b.y1);
    return Math.hypot(dx, dy);
  }

  const cm = (v) => String(Math.round(v * 10) / 10).replace('.', ',');

  function runChecks(apt, items, opts = {}) {
    const out = [];
    const minPass = (room) => (opts.minPass && opts.minPass[room.id]) || room.minPass;
    const push = (level, code, text, ids = []) => out.push({ level, code, text, ids });
    const solid = items.filter((it) => it.role !== 'point');
    const boxes = new Map(items.map((it) => [it.id, box(it)]));
    const rooms = new Map(items.map((it) => [it.id, roomOf(apt, it)]));

    // Стены и потолок
    for (const it of items) {
      const b = boxes.get(it.id), room = rooms.get(it.id);
      if (it.role !== 'point' && (!room || !boxInPoly(b, room.poly))) push('error', 'outside', `«${it.name}» выходит за стены`, [it.id]);
      if ((it.z || 0) + it.h > apt.CEILING + EPS) push('error', 'ceiling', `«${it.name}» выше потолка: ${cm(it.z + it.h)} при потолке ${apt.CEILING}`, [it.id]);
    }

    // Пересечения с учётом высоты: верхний шкаф над нижним не конфликтует
    for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) {
      const a = solid[i], c = solid[j];
      const vertical = (a.z || 0) < (c.z || 0) + c.h - EPS && (c.z || 0) < (a.z || 0) + a.h - EPS;
      if (vertical && overlap(boxes.get(a.id), boxes.get(c.id))) push('error', 'collision', `«${a.name}» и «${c.name}» пересекаются`, [a.id, c.id]);
    }

    // Батарея, короба, шахты
    for (const it of solid) for (const f of apt.fixed) {
      const vertical = (it.z || 0) < f.z + f.h - EPS && f.z < (it.z || 0) + it.h - EPS;
      const b = boxes.get(it.id), fb = fixedBox(f);
      if (vertical && overlap(b, fb)) {
        push('error', 'fixed', `«${it.name}» стоит на месте объекта «${f.name}»`, [it.id]);
      } else if (f.kind === 'radiator' && it.h + (it.z || 0) > f.h && (it.z || 0) < f.h) {
        const near = { x0: fb.x0 - 3, x1: fb.x1 + 3, y0: fb.y0, y1: fb.y1 + 15 };
        if (overlap(b, near)) push('warn', 'radiator', `«${it.name}» вплотную к батарее: тепло будет хуже расходиться`, [it.id]);
      }
    }

    // Двери
    for (const op of apt.openings) {
      const s = swingBox(op, opts.doors);
      if (!s) continue;
      for (const it of solid) {
        if ((it.z || 0) >= op.top) continue;
        if (overlap(boxes.get(it.id), s)) push('warn', 'door', `«${it.name}» мешает открывать: ${op.name.toLowerCase()}`, [it.id]);
      }
    }

    // Окна: высокая мебель у стены с окном
    for (const op of apt.openings.filter((o) => o.type === 'window' || o.type === 'balcony')) {
      const zone = { x0: op.rect[0], x1: op.rect[2], y0: op.rect[1] - 10, y1: op.rect[3] + 25 };
      for (const it of solid) {
        if ((it.z || 0) + it.h > (op.sill || 0) + 5 && (it.z || 0) < op.top && overlap(boxes.get(it.id), zone)) {
          push(op.type === 'balcony' ? 'error' : 'info', 'window', `«${it.name}» перекрывает: ${op.name.toLowerCase()}`, [it.id]);
        }
      }
    }

    // Проходы: перед фасадом и между предметами без фасада. Боковые зазоры внутри
    // одного ряда шкафов и щели у сантехники проходом не считаются.
    const floor = solid.filter((it) => isFloorItem(it) && !it.loose);
    for (const it of floor) {
      const room = rooms.get(it.id);
      if (!room) continue;
      const need = minPass(room);
      if (it.front) {
        const c = clearance(apt, it, items, frontDir(it.rot), 20);
        if (c && c.dist < need - EPS) {
          push('warn', 'pass', `${room.name}: перед «${it.name}» ${cm(c.dist)} см до ${c.hit === 'стены' ? 'стены' : `«${c.hit}»`}, нужно от ${need}`, [it.id]);
        }
      }
      for (const o of floor) {
        if (it.front || o.front || o.id <= it.id || rooms.get(o.id) !== room) continue;
        const a = boxes.get(it.id), b = boxes.get(o.id);
        const gx = Math.max(a.x0 - b.x1, b.x0 - a.x1), gy = Math.max(a.y0 - b.y1, b.y0 - a.y1);
        const spanY = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0), spanX = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
        const gap = gx > 0 && spanY >= 30 ? gx : gy > 0 && spanX >= 30 ? gy : null;
        if (gap === null || gap < 25 || gap >= need - EPS) continue;
        push('warn', 'pass', `${room.name}: между «${it.name}» и «${o.name}» ${cm(gap)} см, нужно от ${need}`, [it.id, o.id]);
      }
    }

    // Розетки
    const outlets = allOutlets(apt, items);
    for (const p of outlets) {
      for (const it of solid) {
        if (rooms.get(it.id) && p.room && rooms.get(it.id).id !== p.room) continue;
        const b = boxes.get(it.id);
        const inPlan = p.x >= b.x0 - 3 && p.x <= b.x1 + 3 && p.y >= b.y0 - 3 && p.y <= b.y1 + 3;
        const z0 = it.z || 0, z1 = z0 + it.h;
        if (inPlan && p.h >= z0 && p.h <= z1) {
          if (p.tag === 'stove' && it.kind === 'stove') continue;
          if (p.h < 50 && it.role !== 'tall') {
            push('info', 'outlet-low', `Розетка на высоте ${cm(p.h)} за «${it.name}»: нужен вырез в задней стенке`, [it.id]);
          } else {
            push('warn', 'outlet-hidden', `«${it.name}» закрывает розетку на высоте ${cm(p.h)}`, [it.id]);
          }
        } else if (inPlan && it.role === 'base' && p.h > z1 && p.h - z1 < 10) {
          push('warn', 'outlet-low-top', `Розетка всего на ${cm(p.h - z1)} см над столешницей «${it.name}»`, [it.id]);
        }
        if (p.h > 50 && p.h < 150) {
          const d = distToBox(p.x, p.y, b);
          if (it.kind === 'stove' && d < 15) push('warn', 'outlet-stove', `Розетка на высоте ${cm(p.h)} ближе 15 см к плите: ${cm(d)} см`, [it.id]);
          if (it.kind === 'sink' && d < 30) push('warn', 'outlet-sink', `Розетка на высоте ${cm(p.h)} ближе 30 см к мойке: ${cm(d)} см`, [it.id]);
        }
      }
    }

    // Питание техники
    for (const it of solid.filter((i) => i.power)) {
      const room = rooms.get(it.id);
      if (!room) continue;
      const b = boxes.get(it.id);
      const near = outlets.filter((p) => p.room === room.id);
      const hasData = apt.measuredOutletRooms.includes(room.id) || near.length > 0;
      if (!hasData) {
        push('info', 'power-unknown', `${room.name}: розетки ещё не обмерены, «${it.name}» проверить нечем`, [it.id]);
        continue;
      }
      if (it.kind === 'stove') {
        const own = near.filter((p) => p.tag === 'stove');
        if (own.length && own.every((p) => distToBox(p.x, p.y, b) > 60)) {
          push('warn', 'power-stove', `«${it.name}» дальше 60 см от силовой розетки под плиту`, [it.id]);
        }
        continue;
      }
      const best = near.reduce((m, p) => Math.min(m, distToBox(p.x, p.y, b)), Infinity);
      if (best > 150) push('warn', 'power', `Рядом с «${it.name}» нет розетки (ближайшая ${best === Infinity ? 'не найдена' : cm(best) + ' см'})`, [it.id]);
    }

    // Дойти можно?
    const reached = reachable(apt, items, opts.maskCache);
    for (const r of apt.rooms) {
      if (!reached[r.id]) push('error', 'reach', `${r.name}: от входной двери не пройти, путь перекрыт мебелью`);
    }

    const order = { error: 0, warn: 1, info: 2 };
    return out.sort((a, b) => order[a.level] - order[b.level]);
  }

  return {
    box, frontDir, overlap, pointInPoly, roomAt, roomOf, boxInPoly, polyArea, polyBox, fixedBox,
    wallBoxes, doorState, swingBox, clearance, reachable, baseMask, runChecks, allOutlets, isFloorItem, cm,
  };
});
