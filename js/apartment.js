// Геометрия квартиры. Все размеры в см, x вправо, y вниз, (0,0) — угол кухни у окна.
// Контуры комнат заданы по часовой стрелке (на экране): порядок обхода совпадает с тем,
// как человек видит стену изнутри — от левого края к правому.
// source: 'measured' — ручные замеры, 'plan' — снято с поэтажного плана (нужно перемерить).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.APT = factory();
})(this, function () {
  const CEILING = 254;
  const KITCHEN_LEFT = 384.5;  // длина левой стены кухни
  const KITCHEN_RIGHT = 385.5; // длина правой стены кухни

  const rooms = [
    {
      id: 'kitchen', name: 'Кухня', no: 2, areaPlan: 10.6, color: '#f7f0e2', floor3d: 0xd9c7a8,
      minPass: 90, source: 'measured',
      poly: [[0, 0], [269.5, 0], [269.5, KITCHEN_RIGHT], [0, KITCHEN_LEFT]],
      walls: ['Окно и балкон', 'Правая', 'Вход', 'Левая'],
    },
    {
      id: 'room', name: 'Комната', no: 3, areaPlan: 14.3, color: '#eef1ea', floor3d: 0xc9c2b2,
      minPass: 70, source: 'plan',
      poly: [[279.5, -139], [552.5, -139], [552.5, 385], [279.5, 385]],
      walls: ['Окно', 'Правая', 'Вход', 'Левая (кухня)'],
    },
    {
      id: 'hall', name: 'Прихожая', no: 1, areaPlan: 6.5, color: '#f1ece6', floor3d: 0xb9ad9c,
      minPass: 70, source: 'plan',
      poly: [[0, 395], [371, 395], [371, 596], [129, 596], [129, 549], [0, 549]],
      walls: ['Кухня и комната', 'Санузел', 'Входная дверь', 'Выступ', 'Нижняя', 'Левая'],
    },
    {
      id: 'bath', name: 'Санузел', no: 4, areaPlan: 4.4, color: '#e8f0f3', floor3d: 0xb7c6cc,
      minPass: 60, source: 'plan',
      poly: [[388.5, 395], [552.5, 395], [552.5, 663], [388.5, 663]],
      walls: ['Верхняя (ванна)', 'Правая', 'Нижняя (шахты)', 'Левая (дверь)'],
    },
    {
      id: 'balcony', name: 'Балкон', no: null, areaPlan: 2.9, color: '#eaf1f6', floor3d: 0xc5ced3,
      minPass: 50, source: 'plan',
      poly: [[0, -154], [250, -154], [250, -38], [0, -38]],
      walls: ['Остекление', 'Правая', 'Кухня', 'Левая'],
    },
  ];

  // rect — проём сквозь всю толщину стены; a→b — линия полотна на стороне, куда открывается дверь.
  const openings = [
    {
      id: 'door-kitchen', type: 'door', name: 'Дверь на кухню', source: 'measured',
      rect: [173, 385, 245, 395], a: [173, 385], b: [245, 385], hinge: 'b', dir: [0, -1], sill: 0, top: 205,
    },
    {
      id: 'door-room', type: 'door', name: 'Дверь в комнату', source: 'plan',
      rect: [285.5, 385, 363.5, 395], a: [285.5, 385], b: [363.5, 385], hinge: 'a', dir: [0, -1], sill: 0, top: 205,
    },
    {
      id: 'door-bath', type: 'door', name: 'Дверь в санузел', source: 'plan',
      rect: [371, 505, 388.5, 575], a: [371, 505], b: [371, 575], hinge: 'b', dir: [-1, 0], sill: 0, top: 205,
    },
    {
      id: 'door-entry', type: 'entry', name: 'Входная дверь', source: 'plan',
      rect: [199, 596, 303, 616], a: [199, 596], b: [303, 596], sill: 0, top: 205,
    },
    {
      id: 'balcony-block', type: 'balcony', name: 'Балконный блок', source: 'measured',
      rect: [114.5, -38, 242, 0], a: [114.5, 0], b: [242, 0], sill: 0, top: 215,
    },
    {
      id: 'window-room', type: 'window', name: 'Окно комнаты', source: 'plan',
      rect: [337.5, -159, 500.5, -139], a: [337.5, -139], b: [500.5, -139], sill: 85, top: 235,
    },
    {
      id: 'window-balcony', type: 'window', name: 'Остекление балкона', source: 'plan',
      rect: [5, -174, 245, -154], a: [5, -154], b: [245, -154], sill: 90, top: 235,
    },
  ];

  // Неподвижное: батарея, короб, шахты. rect — след на полу, z/h — по высоте.
  const fixed = [
    {
      id: 'radiator', kind: 'radiator', name: 'Батарея с регулятором', room: 'kitchen', source: 'measured',
      rect: [23, 0, 103, 10], z: 0, h: 64,
    },
    {
      id: 'hall-niche', kind: 'shaft', name: 'Ниша и короб (уточнить)', room: 'hall', source: 'plan',
      rect: [0, 395, 127, 434], z: 0, h: CEILING,
    },
    {
      id: 'bath-shaft-left', kind: 'shaft', name: 'Шахта', room: 'bath', source: 'plan',
      rect: [388.5, 620, 423.5, 663], z: 0, h: CEILING,
    },
    {
      id: 'bath-shaft-right', kind: 'shaft', name: 'Шахта', room: 'bath', source: 'plan',
      rect: [484.5, 640, 552.5, 663], z: 0, h: CEILING,
    },
  ];

  // Условные значки с плана: подсказка, где задумана мойка и плита. На проверки не влияют.
  const hints = [
    { id: 'hint-sink', kind: 'sink', name: 'Мойка на плане', rect: [0, 340, 48, 384] },
    { id: 'hint-stove', kind: 'stove', name: 'Плита на плане', rect: [8, 216, 58, 266] },
  ];

  // Розетки, обмеренные на кухне. Левая стена: x = 0, правая: x = 269.5.
  // «от входа» — расстояние вдоль стены от входной стены, «от окна» — от оконной.
  const L = (fromEntry) => KITCHEN_LEFT - fromEntry;
  const R = (fromEntry) => KITCHEN_RIGHT - fromEntry;
  const outlets = [
    { id: 'o-l1', room: 'kitchen', wall: 'Левая', x: 0, y: L(57.5), h: 31, tag: null, note: '57,5 от входной стены' },
    { id: 'o-l2', room: 'kitchen', wall: 'Левая', x: 0, y: L(119), h: 25, tag: 'stove', note: 'под плиту, 119 от входной стены' },
    { id: 'o-l3', room: 'kitchen', wall: 'Левая', x: 0, y: L(117), h: CEILING - 45.5, tag: 'high', note: 'высокая, 45,5 от потолка, 117 от входной стены' },
    { id: 'o-l4', room: 'kitchen', wall: 'Левая', x: 0, y: L(183), h: 111, tag: null, note: '183 от входной стены' },
    { id: 'o-l5', room: 'kitchen', wall: 'Левая', x: 0, y: L(242), h: 111, tag: null, note: '242 от входной стены' },
    { id: 'o-l6', room: 'kitchen', wall: 'Левая', x: 0, y: 85, h: 32, tag: null, note: '85 от оконной стены' },
    { id: 'o-r1', room: 'kitchen', wall: 'Правая', x: 269.5, y: 45, h: 31, tag: null, note: '45 от оконной стены' },
    { id: 'o-r2', room: 'kitchen', wall: 'Правая', x: 269.5, y: R(96), h: 30, tag: null, note: '96 от входной стены' },
  ];

  return { CEILING, rooms, openings, fixed, hints, outlets, entry: [251, 590], measuredOutletRooms: ['kitchen'] };
});
