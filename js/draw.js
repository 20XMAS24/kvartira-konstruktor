// Рисование плана и развёртки стены: функции возвращают разметку SVG строкой.
// Цвета заданы атрибутами, чтобы экспорт в PNG выглядел так же, как экран.
(function () {
  const { box, swingBox, fixedBox, polyBox, polyArea, clearance, frontDir, cm, isFloorItem } = Geo;

  const INK = '#23262a', WALL = '#3a3d41', MUTED = '#666b70', ACCENT = '#1f6f78', RED = '#b3341f', AMBER = '#a86a00', OUTLET = '#d9542b';

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n = (v) => Math.round(v * 100) / 100;
  let colorOf = (r) => r.color;

  function text(x, y, str, size, opts = {}) {
    const { fill = INK, anchor = 'middle', weight, rotate, halo } = opts;
    const tr = rotate ? ` transform="rotate(${rotate} ${n(x)} ${n(y)})"` : '';
    const h = halo ? ` paint-order="stroke" stroke="${halo}" stroke-width="${n(size * 0.3)}" stroke-linejoin="round"` : '';
    return `<text x="${n(x)}" y="${n(y)}" font-size="${n(size)}" fill="${fill}" text-anchor="${anchor}" dominant-baseline="central"${weight ? ` font-weight="${weight}"` : ''}${tr}${h} pointer-events="none" font-family="-apple-system,'Segoe UI',Roboto,Arial,sans-serif">${esc(str)}</text>`;
  }

  // Значок предмета в своих координатах: центр в нуле, спинка сверху (y < 0), фасад снизу.
  function symbol(it, u) {
    const w = it.w, d = it.d, sw = n(u);
    const line = `stroke="${INK}" stroke-opacity=".55" stroke-width="${sw}" fill="none"`;
    switch (it.kind) {
      case 'stove': {
        const r = Math.min(w, d) * 0.15, dx = w * 0.23, dy = d * 0.22;
        return [[-dx, -dy], [dx, -dy], [-dx, dy], [dx, dy]].map(([x, y]) =>
          `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" stroke="#fff" stroke-width="${sw}" fill="none"/>`).join('');
      }
      case 'sink':
        return `<rect x="${n(-w * 0.32)}" y="${n(-d * 0.28)}" width="${n(w * 0.64)}" height="${n(d * 0.58)}" rx="${n(Math.min(w, d) * 0.1)}" ${line}/><circle cx="0" cy="${n(-d * 0.34)}" r="${n(Math.min(w, d) * 0.035)}" fill="${INK}"/>`;
      case 'fridge': case 'wardrobe':
        return `<path d="M${n(-w / 2)} ${n(-d / 2)}L${n(w / 2)} ${n(d / 2)}M${n(w / 2)} ${n(-d / 2)}L${n(-w / 2)} ${n(d / 2)}" stroke="${INK}" stroke-opacity=".3" stroke-width="${sw}" fill="none"/>`;
      case 'hood':
        return `<path d="M${n(-w / 2)} ${n(-d / 2)}L0 0L${n(w / 2)} ${n(-d / 2)}M${n(-w / 2)} ${n(d / 2)}L0 0L${n(w / 2)} ${n(d / 2)}" ${line}/>`;
      case 'dish': case 'oven':
        return `<rect x="${n(-w * 0.34)}" y="${n(-d * 0.3)}" width="${n(w * 0.68)}" height="${n(d * 0.6)}" ${line}/>`;
      case 'wm': return `<circle r="${n(Math.min(w, d) * 0.33)}" ${line}/>`;
      case 'bed': {
        const pw = w > 110 ? (w - 18) / 2 : w - 14;
        const p = (x) => `<rect x="${n(x)}" y="${n(-d / 2 + 6)}" width="${n(pw)}" height="36" rx="5" fill="#fff" fill-opacity=".75" stroke="${INK}" stroke-opacity=".4" stroke-width="${sw}"/>`;
        return (w > 110 ? p(-w / 2 + 6) + p(w / 2 - 6 - pw) : p(-pw / 2)) + `<path d="M${n(-w / 2)} ${n(-d / 2 + 50)}H${n(w / 2)}" ${line}/>`;
      }
      case 'sofa':
        return `<rect x="${n(-w / 2)}" y="${n(-d / 2)}" width="${n(w)}" height="${n(d * 0.24)}" fill="${INK}" fill-opacity=".14"/><path d="M${n(-w / 2 + 14)} ${n(-d / 2 + d * 0.24)}V${n(d / 2)}M${n(w / 2 - 14)} ${n(-d / 2 + d * 0.24)}V${n(d / 2)}" ${line}/>`;
      case 'tub':
        return `<rect x="${n(-w / 2 + 6)}" y="${n(-d / 2 + 6)}" width="${n(w - 12)}" height="${n(d - 12)}" rx="${n(Math.min(w, d) * 0.28)}" fill="#fff" fill-opacity=".7" stroke="${INK}" stroke-opacity=".45" stroke-width="${sw}"/>`;
      case 'toilet':
        return `<rect x="${n(-w / 2 + 2)}" y="${n(-d / 2)}" width="${n(w - 4)}" height="${n(d * 0.24)}" ${line}/><ellipse cy="${n(d * 0.12)}" rx="${n(w * 0.4)}" ry="${n(d * 0.32)}" fill="#fff" fill-opacity=".7" stroke="${INK}" stroke-opacity=".45" stroke-width="${sw}"/>`;
      case 'chair':
        return `<path d="M${n(-w / 2 + 3)} ${n(-d / 2 + 5)}H${n(w / 2 - 3)}" stroke="${INK}" stroke-opacity=".6" stroke-width="${n(u * 3)}"/>`;
      default: return '';
    }
  }

  function itemMarkup(it, ctx) {
    const b = box(it), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    const u = ctx.u;
    const isSel = ctx.selected === it.id;
    const issue = ctx.issues.get(it.id);
    const stroke = isSel ? ACCENT : issue === 'error' ? RED : issue === 'warn' ? AMBER : INK;
    const sw = (isSel ? 2.4 : issue === 'error' || issue === 'warn' ? 1.8 : 1) * u;

    if (it.role === 'point') {
      const r = 5 * u;
      return `<g data-item="${esc(it.id)}" style="cursor:move"><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r * 1.8)}" fill="#fff" fill-opacity="0"/><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="#fff" stroke="${isSel ? ACCENT : OUTLET}" stroke-width="${n(2 * u)}"/><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r * 0.4)}" fill="${OUTLET}"/>${text(cx + r * 1.5, cy, cm((it.z || 0) + it.h / 2), 10 * u, { anchor: 'start', fill: OUTLET, weight: 600, halo: '#fff' })}</g>`;
    }
    const upper = it.role === 'upper';
    let g = `<g data-item="${esc(it.id)}" style="cursor:move">`;
    g += `<rect x="${n(b.x0)}" y="${n(b.y0)}" width="${n(b.w)}" height="${n(b.d)}" fill="${esc(it.color || '#ccc')}" fill-opacity="${upper ? 0.5 : 1}" stroke="${stroke}" stroke-width="${n(sw)}"${upper ? ` stroke-dasharray="${n(5 * u)} ${n(3 * u)}"` : ''}/>`;
    g += `<g transform="translate(${n(cx)} ${n(cy)}) rotate(${it.rot || 0})" pointer-events="none">${symbol(it, u)}`;
    if (it.front) g += `<path d="M${n(-it.w / 2)} ${n(it.d / 2 - 1.5 * u)}H${n(it.w / 2)}" stroke="${INK}" stroke-width="${n(2.4 * u)}"/>`;
    g += '</g>';

    const size = 11 * u, pxW = b.w / u, pxH = b.d / u;
    const label = it.name, dark = it.kind === 'stove' ? '#fff' : INK;
    const halo = it.kind === 'stove' ? null : esc(it.color || '#fff');
    if (!upper || isSel) {
      if (pxW >= label.length * 6.1 && pxH >= 16) g += text(cx, cy, label, size, { fill: dark, halo });
      else if (pxH >= label.length * 6.1 && pxW >= 16) g += text(cx, cy, label, size, { fill: dark, rotate: -90, halo });
      else if (Math.max(pxW, pxH) >= 26 && Math.min(pxW, pxH) >= 14) {
        g += text(cx, cy, String(it.w), size, { fill: dark, rotate: pxH > pxW ? -90 : 0, halo });
      }
    }
    return g + '</g>';
  }

  function doorMarkup(op, ctx) {
    const u = ctx.u;
    const [x0, y0, x1, y1] = op.rect;
    let s = `<rect x="${n(x0)}" y="${n(y0)}" width="${n(x1 - x0)}" height="${n(y1 - y0)}" fill="#fff"/>`;
    const hit = `<rect data-opening="${esc(op.id)}" x="${n(x0)}" y="${n(y0)}" width="${n(x1 - x0)}" height="${n(y1 - y0)}" fill="#fff" fill-opacity="0" style="cursor:pointer"/>`;
    const sel = ctx.selectedOpening === op.id;
    const color = sel ? ACCENT : INK;
    if (op.type === 'window' || op.type === 'balcony') {
      const horiz = x1 - x0 > y1 - y0;
      const glass = op.type === 'balcony' ? '#8fbcd0' : '#a9cfe0';
      s += `<rect x="${n(x0)}" y="${n(y0)}" width="${n(x1 - x0)}" height="${n(y1 - y0)}" fill="${glass}" fill-opacity=".35" stroke="${color}" stroke-width="${n(u)}"/>`;
      if (horiz) s += `<path d="M${n(x0)} ${n((y0 + y1) / 2)}H${n(x1)}" stroke="${color}" stroke-width="${n(u)}"/>`;
    } else if (op.type === 'entry') {
      s += `<path d="M${n(x0)} ${n(y1)}H${n(x1)}" stroke="${color}" stroke-width="${n(3 * u)}"/>`;
      s += text((x0 + x1) / 2, (y0 + y1) / 2, 'вход', 10 * u, { fill: MUTED });
    } else {
      const sw = swingBox(op, ctx.doors);
      const cross = (sw.O[0] - sw.H[0]) * (sw.C[1] - sw.H[1]) - (sw.O[1] - sw.H[1]) * (sw.C[0] - sw.H[0]);
      s += `<path d="M${n(sw.H[0])} ${n(sw.H[1])}L${n(sw.O[0])} ${n(sw.O[1])}A${n(sw.W)} ${n(sw.W)} 0 0 ${cross > 0 ? 1 : 0} ${n(sw.C[0])} ${n(sw.C[1])}" fill="${sel ? ACCENT : INK}" fill-opacity="${sel ? 0.1 : 0.03}" stroke="${color}" stroke-width="${n(u)}" pointer-events="none"/>`;
      s += `<path data-opening="${esc(op.id)}" d="M${n(sw.H[0])} ${n(sw.H[1])}L${n(sw.O[0])} ${n(sw.O[1])}A${n(sw.W)} ${n(sw.W)} 0 0 ${cross > 0 ? 1 : 0} ${n(sw.C[0])} ${n(sw.C[1])}Z" fill="#fff" fill-opacity="0" style="cursor:pointer"/>`;
    }
    return s + hit;
  }

  function fixedMarkup(f, u) {
    const b = fixedBox(f);
    const w = b.x1 - b.x0, h = b.y1 - b.y0;
    const fill = f.kind === 'radiator' ? '#e0a48c' : '#9b9c9a';
    let s = `<rect x="${n(b.x0)}" y="${n(b.y0)}" width="${n(w)}" height="${n(h)}" fill="${fill}" stroke="${INK}" stroke-width="${n(u)}"/>`;
    if (f.kind === 'radiator') {
      for (let x = b.x0 + 6; x < b.x1; x += 6) s += `<path d="M${n(x)} ${n(b.y0)}V${n(b.y1)}" stroke="${INK}" stroke-opacity=".5" stroke-width="${n(u * 0.7)}"/>`;
    } else {
      s += `<path d="M${n(b.x0)} ${n(b.y0)}L${n(b.x1)} ${n(b.y1)}" stroke="${INK}" stroke-opacity=".5" stroke-width="${n(u)}"/>`;
    }
    return s;
  }

  // Длины стен снаружи контура.
  function roomDims(room, u) {
    let s = '';
    const P = room.poly;
    for (let i = 0; i < P.length; i++) {
      const [ax, ay] = P[i], [bx, by] = P[(i + 1) % P.length];
      const len = Math.hypot(bx - ax, by - ay);
      if (len / u < 34) continue;
      const nx = (by - ay) / len, ny = -(bx - ax) / len;
      const off = -9 * u; // чуть внутрь комнаты, иначе подпись ложится на соседнюю стену
      const mx = (ax + bx) / 2 + nx * off, my = (ay + by) / 2 + ny * off;
      const vertical = Math.abs(by - ay) > Math.abs(bx - ax);
      s += text(mx, my, cm(len), 10 * u, { fill: MUTED, rotate: vertical ? -90 : 0, halo: colorOf(room) });
    }
    return s;
  }

  function gapsMarkup(it, items, u) {
    if (it.role === 'point') return '';
    let s = '';
    for (const dir of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const c = clearance(APT, it, items, dir);
      if (!c || !isFinite(c.dist) || c.dist < 1) continue;
      const [ax, ay] = c.from, [bx, by] = c.to;
      s += `<path d="M${n(ax)} ${n(ay)}L${n(bx)} ${n(by)}" stroke="${ACCENT}" stroke-width="${n(1.2 * u)}" stroke-dasharray="${n(4 * u)} ${n(3 * u)}" pointer-events="none"/>`;
      s += text((ax + bx) / 2, (ay + by) / 2, cm(c.dist), 11 * u, { fill: ACCENT, weight: 600, halo: '#fff' });
    }
    return s;
  }

  // ctx: { u: см на пиксель, items, doors, selected, selectedOpening, issues: Map, layers, guides }
  function planMarkup(ctx) {
    const u = ctx.u, L = ctx.layers;
    let s = '';
    Geo.wallBoxes(APT).forEach((w) => {
      s += `<rect x="${n(w.x0)}" y="${n(w.y0)}" width="${n(w.x1 - w.x0)}" height="${n(w.y1 - w.y0)}" fill="${WALL}" stroke="${WALL}" stroke-width="${n(0.6 * u)}"/>`;
    });
    APT.rooms.forEach((r) => {
      s += `<polygon data-room="${r.id}" points="${r.poly.map((p) => p.join(',')).join(' ')}" fill="${colorOf(r)}"/>`;
    });
    APT.rooms.forEach((r) => {
      const b = polyBox(r.poly);
      const cx = (b.x0 + b.x1) / 2, cy = r.id === 'hall' ? 480 : (b.y0 + b.y1) / 2;
      s += text(cx, cy - 8 * u, r.name, 14 * u, { fill: '#9a9a90', weight: 600 });
      s += text(cx, cy + 9 * u, `${cm(Math.round(polyArea(r.poly) * 10) / 10)} м²`, 11 * u, { fill: '#9a9a90' });
    });
    APT.fixed.forEach((f) => { s += fixedMarkup(f, u); });
    APT.openings.forEach((o) => { s += doorMarkup(o, ctx); });
    if (L.hints) {
      APT.hints.forEach((h) => {
        const [x0, y0, x1, y1] = h.rect;
        s += `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="none" stroke="${ACCENT}" stroke-width="${n(u)}" stroke-dasharray="${n(3 * u)} ${n(3 * u)}" pointer-events="none"/>`;
        s += text((x0 + x1) / 2, (y0 + y1) / 2, h.name, 10 * u, { fill: ACCENT, halo: '#fff' });
      });
    }
    if (L.dims) APT.rooms.forEach((r) => { s += roomDims(r, u); });

    const floorFirst = [...ctx.items].sort((a, b) => (a.role === 'upper') - (b.role === 'upper'));
    floorFirst.forEach((it) => {
      if (it.role === 'upper' && !L.upper && ctx.selected !== it.id) return;
      if (it.role === 'point' && !L.outlets && ctx.selected !== it.id) return;
      s += itemMarkup(it, ctx);
    });

    if (L.outlets) {
      APT.outlets.forEach((p) => {
        const r = 5 * u, sel = ctx.selectedOutlet === p.id;
        const left = p.x < 100;
        const lx = p.x + (left ? r * 1.6 : -r * 1.6);
        s += `<g data-outlet="${p.id}" style="cursor:pointer"><circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(r * 2)}" fill="#fff" fill-opacity="0"/><circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(r)}" fill="#fff" stroke="${sel ? ACCENT : OUTLET}" stroke-width="${n(2 * u)}"/><circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(r * 0.4)}" fill="${sel ? ACCENT : OUTLET}"/></g>`;
        s += text(lx, p.y, cm(p.h), 10 * u, { anchor: left ? 'start' : 'end', fill: OUTLET, weight: 600, halo: '#fff' });
      });
    }
    const sel = ctx.items.find((i) => i.id === ctx.selected);
    if (sel && L.dims) s += gapsMarkup(sel, ctx.items, u);
    (ctx.guides || []).forEach((g) => {
      s += g.axis === 'x'
        ? `<path d="M${n(g.v)} -300V800" stroke="${ACCENT}" stroke-width="${n(u)}" stroke-opacity=".55" pointer-events="none"/>`
        : `<path d="M-200 ${n(g.v)}H800" stroke="${ACCENT}" stroke-width="${n(u)}" stroke-opacity=".55" pointer-events="none"/>`;
    });
    return s;
  }

  function planBounds() {
    const all = APT.rooms.map((r) => polyBox(r.poly));
    return {
      x0: Math.min(...all.map((b) => b.x0)) - 26, y0: Math.min(...all.map((b) => b.y0)) - 26,
      x1: Math.max(...all.map((b) => b.x1)) + 26, y1: Math.max(...all.map((b) => b.y1)) + 26,
    };
  }

  // Развёртка стены. Левый край экрана — начало ребра контура (контур по часовой стрелке).
  function elevationMarkup(roomId, edge, items) {
    const room = APT.rooms.find((r) => r.id === roomId);
    const a = room.poly[edge], b = room.poly[(edge + 1) % room.poly.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const dir = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    const inward = [-dir[1], dir[0]];
    const C = APT.CEILING, pad = 34, bottom = 46;
    const U = (x, y) => (x - a[0]) * dir[0] + (y - a[1]) * dir[1];
    const D = (x, y) => (x - a[0]) * inward[0] + (y - a[1]) * inward[1];
    const Y = (h) => C - h;
    const vb = { x: -pad, y: -22, w: L + pad * 2, h: C + 22 + bottom };
    let s = `<rect x="0" y="0" width="${n(L)}" height="${C}" fill="${colorOf(room)}" stroke="${WALL}" stroke-width="2"/>`;

    const spanOf = (bx) => {
      const us = [U(bx.x0, bx.y0), U(bx.x1, bx.y0), U(bx.x0, bx.y1), U(bx.x1, bx.y1)];
      const ds = [D(bx.x0, bx.y0), D(bx.x1, bx.y0), D(bx.x0, bx.y1), D(bx.x1, bx.y1)];
      return { u0: Math.min(...us), u1: Math.max(...us), d0: Math.min(...ds), d1: Math.max(...ds) };
    };
    const onWall = (sp, maxDist) => sp.d0 <= maxDist && sp.d1 >= -1 && sp.u1 > 0 && sp.u0 < L;

    // Проёмы на этой стене: проверяем, что проём примыкает к ребру
    APT.openings.forEach((o) => {
      const sp = spanOf({ x0: o.rect[0], y0: o.rect[1], x1: o.rect[2], y1: o.rect[3] });
      if (sp.d1 < -45 || sp.d0 > 1.5 || sp.u1 <= 0.5 || sp.u0 >= L - 0.5) return;
      const w = sp.u1 - sp.u0, h = o.top - o.sill;
      const glass = o.type === 'window' || o.type === 'balcony';
      s += `<rect x="${n(sp.u0)}" y="${n(Y(o.top))}" width="${n(w)}" height="${n(h)}" fill="${glass ? '#cfe4ee' : '#fff'}" stroke="${WALL}" stroke-width="1.2"/>`;
      s += text((sp.u0 + sp.u1) / 2, Y(o.top) + 10, `${o.name}: ${cm(w)}`, 8.5, { fill: MUTED });
      if (o.source === 'plan') s += text((sp.u0 + sp.u1) / 2, Y(o.top) + 21, 'по плану, уточнить', 7.5, { fill: AMBER });
    });

    // Батарея, короба
    APT.fixed.filter((f) => f.room === roomId).forEach((f) => {
      const sp = spanOf(fixedBox(f));
      if (!onWall(sp, 2)) return;
      s += `<rect x="${n(sp.u0)}" y="${n(Y(f.z + f.h))}" width="${n(sp.u1 - sp.u0)}" height="${n(f.h)}" fill="${f.kind === 'radiator' ? '#e0a48c' : '#9b9c9a'}" stroke="${INK}" stroke-width=".8"/>`;
      s += text((sp.u0 + sp.u1) / 2, Y(f.z + f.h / 2), f.name, 8.5, { halo: '#fff' });
    });

    // Предметы у стены: дальние сначала
    const near = items
      .filter((it) => it.role !== 'point')
      .map((it) => ({ it, sp: spanOf(box(it)) }))
      .filter(({ it, sp }) => Geo.roomOf(APT, it) === room && onWall(sp, 15))
      .sort((p, q) => q.sp.d0 - p.sp.d0);
    let worktop = null;
    near.forEach(({ it, sp }) => {
      const z = it.z || 0, w = sp.u1 - sp.u0;
      s += `<rect data-item="${esc(it.id)}" x="${n(sp.u0)}" y="${n(Y(z + it.h))}" width="${n(w)}" height="${n(it.h)}" fill="${esc(it.color || '#ccc')}" stroke="${INK}" stroke-width=".8"/>`;
      const fits = it.name.length * 4.6 < w;
      const look = it.kind === 'stove' ? { fill: '#fff' } : { halo: esc(it.color || '#fff') };
      s += fits
        ? text((sp.u0 + sp.u1) / 2, Y(z + it.h / 2), it.name, 8.5, look)
        : text((sp.u0 + sp.u1) / 2, Y(z + it.h / 2), it.name, 8, { rotate: it.h > w ? -90 : 0, ...look });
      if (it.role === 'base' || it.kind === 'stove' || it.kind === 'dish') worktop = z + it.h;
    });
    if (worktop) {
      s += `<path d="M0 ${n(Y(worktop))}H${n(L)}" stroke="${ACCENT}" stroke-width=".7" stroke-dasharray="4 3"/>`;
      s += text(L + 3, Y(worktop), cm(worktop), 8, { anchor: 'start', fill: ACCENT });
    }

    // Розетки поверх всего, с высотой и положением
    const points = Geo.allOutlets(APT, items).filter((p) => p.room === roomId && Math.abs(D(p.x, p.y)) <= 15);
    const sorted = points.map((p) => ({ p, u: U(p.x, p.y) })).sort((x, y) => x.u - y.u);
    sorted.forEach(({ p, u }, i) => {
      const y = Y(p.h);
      s += `<path d="M${n(u)} ${n(y)}V${C + 9 + (i % 2) * 11}" stroke="${OUTLET}" stroke-width=".5" stroke-dasharray="2 2"/>`;
      s += `<circle cx="${n(u)}" cy="${n(y)}" r="4" fill="#fff" stroke="${OUTLET}" stroke-width="1.3"/><circle cx="${n(u)}" cy="${n(y)}" r="1.5" fill="${OUTLET}"/>`;
      s += text(u + 6, y, `h ${cm(p.h)}`, 8.5, { anchor: 'start', fill: OUTLET, weight: 600, halo: '#fff' });
      s += text(u, C + 15 + (i % 2) * 11, cm(u), 8, { fill: OUTLET, halo: '#fff' });
    });

    s += `<path d="M0 ${C}H${n(L)}" stroke="${INK}" stroke-width="1.6"/>`;
    s += text(L / 2, -11, `${room.name}, стена «${room.walls[edge]}»: ${cm(L)} см, потолок ${C}`, 10, { weight: 600 });
    s += text(0, C + 39, 'расстояния снизу: от левого края стены, см', 7.5, { anchor: 'start', fill: MUTED });
    return { markup: s, vb };
  }

  // theme дизайна красит полы на плане; null возвращает обычные цвета.
  function setTheme(t) { colorOf = t ? (r) => t.floors[r.id].plan : (r) => r.color; }
  window.Draw = { planMarkup, planBounds, elevationMarkup, esc, setTheme };
})();
