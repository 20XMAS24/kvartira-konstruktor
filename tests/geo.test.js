const test = require('node:test');
const assert = require('node:assert');
const APT = require('../js/apartment.js');
const CATALOG = require('../js/catalog.js');
const PRESETS = require('../js/presets.js');
const Geo = require('../js/geo.js');

let seq = 0;
function make(catId, x, y, rot = 0, patch = {}) {
  const c = CATALOG.find((i) => i.id === catId);
  assert.ok(c, `нет в каталоге: ${catId}`);
  const { group, ...rest } = c;
  return { ...rest, cat: catId, id: `t${++seq}`, x, y, rot, ...patch };
}
const fromPreset = (p) => p.items.map(([id, x, y, rot]) => make(id, x, y, rot));
const codes = (items) => Geo.runChecks(APT, items).map((r) => r.code);

test('площади контуров близки к плану', () => {
  const area = Object.fromEntries(APT.rooms.map((r) => [r.id, Geo.polyArea(r.poly)]));
  assert.ok(Math.abs(area.kitchen - 10.4) < 0.1, `кухня ${area.kitchen}`);
  assert.ok(Math.abs(area.room - 14.3) < 0.1, `комната ${area.room}`);
  assert.ok(Math.abs(area.bath - 4.4) < 0.05, `санузел ${area.bath}`);
  assert.ok(Math.abs(area.balcony - 2.9) < 0.05, `балкон ${area.balcony}`);
  assert.ok(Math.abs(area.hall - 6.5) < 0.5, `прихожая ${area.hall}`);
});

test('замеры нижней стены кухни сходятся: 173 + 72 + 24', () => {
  const door = APT.openings.find((o) => o.id === 'door-kitchen');
  assert.equal(door.rect[0], 173);
  assert.equal(door.rect[2] - door.rect[0], 72);
  assert.equal(269 - door.rect[2], 24);
});

test('контуры заданы по часовой стрелке', () => {
  for (const r of APT.rooms) {
    let s = 0;
    r.poly.forEach(([x, y], i) => {
      const [nx, ny] = r.poly[(i + 1) % r.poly.length];
      s += x * ny - nx * y;
    });
    assert.ok(s > 0, r.id);
    assert.equal(r.walls.length, r.poly.length, r.id);
  }
});

test('пример квартиры без ошибок и предупреждений', () => {
  const res = Geo.runChecks(APT, fromPreset(PRESETS.example));
  const bad = res.filter((r) => r.level !== 'info');
  assert.deepEqual(bad.map((r) => r.text), []);
});

test('сантехника по плану без ошибок', () => {
  const bad = Geo.runChecks(APT, fromPreset(PRESETS.sanitary)).filter((r) => r.level === 'error');
  assert.deepEqual(bad.map((r) => r.text), []);
});

test('поворот меняет занятый прямоугольник', () => {
  const b = Geo.box(make('fridge60', 10, 20, 90));
  assert.deepEqual([b.w, b.d], [65, 60]);
});

test('пересечение: на полу есть, верхний над нижним нет', () => {
  assert.ok(codes([make('base60', 0, 100, 270), make('base60', 0, 130, 270)]).includes('collision'));
  assert.ok(!codes([make('base60', 0, 100, 270), make('upper60', 0, 100, 270)]).includes('collision'));
});

test('выход за стену и за потолок', () => {
  assert.ok(codes([make('base60', 240, 100, 90)]).includes('outside'));
  assert.ok(codes([make('wardrobe120', 300, 0, 0, { h: 260 })]).includes('ceiling'));
});

test('Г-образная прихожая: вырез снизу слева считается стеной', () => {
  assert.ok(codes([make('base60', 20, 520)]).includes('outside'));
  assert.ok(!codes([make('base60', 200, 480)]).includes('outside'));
});

test('батарея: шкаф на её месте — ошибка', () => {
  assert.ok(codes([make('base60', 30, 0)]).includes('fixed'));
});

test('узкий проход на кухне ловится', () => {
  const items = [make('base60', 0, 100, 270), make('fridge60', 120, 100, 90)];
  assert.ok(codes(items).includes('pass'));
});

test('норму прохода можно изменить', () => {
  const items = [make('base60', 0, 100, 270), make('fridge60', 180, 100, 90)];
  assert.ok(!Geo.runChecks(APT, items).some((r) => r.code === 'pass'));
  const strict = Geo.runChecks(APT, items, { minPass: { kitchen: 130 } });
  assert.ok(strict.some((r) => r.code === 'pass'));
});

test('дверь: предмет в зоне открывания', () => {
  assert.ok(codes([make('base60', 180, 325)]).includes('door'));
});

test('смена петель двигает зону открывания', () => {
  const door = APT.openings.find((o) => o.id === 'door-kitchen');
  const def = Geo.swingBox(door);
  const flipped = Geo.swingBox(door, { 'door-kitchen': { hinge: 'a' } });
  assert.deepEqual(def.H, [245, 385]);
  assert.deepEqual(flipped.H, [173, 385]);
});

test('розетка 111 над столешницей не закрыта, за колонной закрыта', () => {
  const y = 384.5 - 183;
  assert.ok(!codes([make('base60', 0, y - 30, 270)]).includes('outlet-hidden'));
  assert.ok(codes([make('tall60', 0, y - 30, 270)]).includes('outlet-hidden'));
});

test('плита на своей розетке не даёт замечаний, вдали даёт', () => {
  assert.ok(!codes([make('stove60', 0, 234.5, 270)]).some((c) => c.startsWith('power') || c === 'outlet-low'));
  assert.ok(codes([make('stove60', 0, 40, 270)]).includes('power-stove'));
});

test('высокий шкаф перед балконной дверью — ошибка', () => {
  assert.ok(codes([make('tall60', 150, 0)]).includes('window'));
});

test('своя розетка участвует в проверках', () => {
  const items = [make('wm60', 424, 618, 180)];
  assert.ok(codes(items).includes('power-unknown'));
  items.push(make('outlet30', 500, 640, 0, { z: 110 }));
  const res = codes(items);
  assert.ok(!res.includes('power-unknown') && !res.includes('power'));
});

test('проходимость: всё открыто, а перегородка отрезает комнату', () => {
  assert.ok(Object.values(Geo.reachable(APT, [])).every(Boolean), 'пустая квартира');
  const block = make('wardrobe120', 285, 340, 0, { w: 80, d: 45 });
  assert.equal(Geo.reachable(APT, [block]).room, false);
  assert.equal(Geo.reachable(APT, [block]).kitchen, true);
});

test('проходимость: верхний шкаф над проходом путь не перекрывает', () => {
  const upper = make('upper100', 180, 340);
  assert.equal(Geo.reachable(APT, [upper]).kitchen, true);
});

test('стены не залезают в комнаты и проёмы', () => {
  const walls = Geo.wallBoxes(APT);
  assert.ok(walls.length > 10);
  for (const w of walls) {
    const cx = (w.x0 + w.x1) / 2, cy = (w.y0 + w.y1) / 2;
    assert.equal(Geo.roomAt(APT, cx, cy), null);
    for (const o of APT.openings) {
      assert.ok(!(cx > o.rect[0] && cx < o.rect[2] && cy > o.rect[1] && cy < o.rect[3]), o.id);
    }
  }
});

test('расстояние от предмета до стены и соседа', () => {
  const a = make('base60', 0, 100, 270);
  const b = make('fridge60', 204.5, 100, 90);
  const c = Geo.clearance(APT, a, [a, b], [1, 0]);
  assert.equal(c.dist, 144.5);
  const wall = Geo.clearance(APT, a, [a], [1, 0]);
  assert.equal(wall.dist, 209.5);
});

test('разметка всех предметов годится для экспорта: нет повторов атрибутов', () => {
  global.window = global;
  global.Geo = Geo;
  global.APT = APT;
  require('../js/draw.js');
  const items = CATALOG.map((c, i) => make(c.id, 300, 100 + i, i % 2 ? 90 : 0));
  const ctx = {
    u: 1, items, doors: {}, issues: new Map(), guides: [{ axis: 'x', v: 10 }],
    layers: { upper: true, outlets: true, dims: true, hints: true },
    selected: items[0].id,
  };
  const views = [window.Draw.planMarkup(ctx)];
  APT.rooms.forEach((r) => r.walls.forEach((_, e) => views.push(window.Draw.elevationMarkup(r.id, e, items).markup)));
  for (const svg of views) {
    for (const [tag] of svg.matchAll(/<[a-z]+\s[^>]*>/g)) {
      const names = [...tag.matchAll(/\s([a-zA-Z-]+)="/g)].map((m) => m[1]);
      assert.equal(new Set(names).size, names.length, `повтор атрибута: ${tag}`);
    }
  }
});
