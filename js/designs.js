// Готовые дизайны: своя планировка и своя отделка. theme описывает стены, полы, ручки и столешницу,
// paint — цвета мебели по типу предмета. Все варианты проходят проверки (см. tests/geo.test.js).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DESIGNS = factory();
})(this, function () {
  // gain > 1 осветляет текстуру прямо в шейдере; tex: null — ровное покрытие без рисунка.
  const floor = (tex, scale, color = 0xffffff, plan = '#efeae0', gain = 1) => ({ tex, scale: 1 / scale, color, plan, gain });
  const solid = (color, plan) => ({ tex: null, scale: 1, color, plan, gain: 1 });
  const TILE = 'long_white_tiles', LAM = 'laminate_floor_03', DARK = 'wood_floor', PARQUET = 'herringbone_parquet', MARBLE = 'marble_01';

  // Кухонный ряд привязан к замеренным розеткам: плита стоит на силовой (119 от входной стены).
  const run = [['sink60', 0, 324.5, 270], ['base30', 0, 294.5, 270], ['stove60', 0, 234.5, 270]];
  const hall = [['hallward120', 0, 504, 180], ['shoes70', 129, 566, 180]];
  const bathTub = [['tub150', 388.5, 395, 0], ['basin50', 504.5, 501, 90], ['toilet', 482.5, 580, 90], ['wm60', 424, 618, 180]];
  const bathShower = [['shower90', 388.5, 395, 0], ['basin60', 504.5, 495, 90], ['toilet', 482.5, 580, 90], ['wm60', 424, 618, 180]];
  const uppers = (...ys) => ys.map((y) => ['upper60', 0, y, 270]);

  return [
    {
      id: 'minimal',
      title: 'Минимализм',
      desc: 'Белые гладкие фасады, светлое дерево и пустые поверхности. Почти нет верхних шкафов и мало мебели, кровать у стены, шкаф на 240 см забирает всё хранение.',
      swatches: ['#f4f2ec', '#d9d4c8', '#a8a095', '#3c3d3f'],
      theme: {
        walls: '#f3f1ec', door: '#e9e6df', handle: 'steel', worktop: 'white',
        floors: {
          kitchen: floor(LAM, 200, 0xa6d9ff, '#efe5d2', 2.2), room: floor(LAM, 200, 0xa6d9ff, '#efe5d2', 2.2), hall: floor(LAM, 200, 0xa6d9ff, '#efe5d2', 2.2),
          bath: floor(TILE, 140, 0xffffff, '#efeeea', 1.1), balcony: floor(TILE, 140, 0xdedcd6, '#e4e2dc'),
        },
      },
      paint: { cabinet: '#f4f2ec', table: '#d8c9ae', soft: '#c9c6bd' },
      items: [
        ...run, ['base60', 0, 174.5, 270], ['base60', 0, 114.5, 270], ['dish60', 0, 54.5, 270],
        ['hood60', 0, 234.5, 270], ...uppers(174.5, 114.5),
        ['fridge60', 204.5, 250, 90], ['table80', 209.5, 120, 90], ['chair', 165, 125, 90], ['chair', 165, 170, 90],
        ['bed140', 279.5, -60, 270], ['nightstand', 279.5, 80, 270], ['wardrobe240', 492.5, 110, 90], ['floorlamp', 510, 60, 0],
        ...hall, ...bathShower, ['rack80', 0, -154, 0],
      ],
    },
    {
      id: 'luxury',
      title: 'Роскошь',
      desc: 'Паркет ёлочкой и мрамор на полу, тёмный орех, золотые ручки и изумрудная ткань. Большой холодильник, стол на 120 см, кровать с двумя тумбами, кресло у окна и комод.',
      swatches: ['#4b3224', '#1f5a4c', '#c6a15b', '#ece4d6'],
      theme: {
        walls: '#e7dfd0', door: '#5a3e2d', handle: 'gold', worktop: 'white',
        floors: {
          kitchen: floor(MARBLE, 260, 0xffffff, '#eee9e0'), room: floor(PARQUET, 150, 0xe6d8c6, '#c8ad8d'), hall: floor(MARBLE, 260, 0xffffff, '#eee9e0'),
          bath: floor(MARBLE, 260, 0xf5efe6, '#ece6da'), balcony: floor(MARBLE, 260, 0xe0dbd0, '#e2ddd2'),
        },
      },
      paint: { cabinet: '#4a3024', table: '#6b4a32', soft: '#0f4a3d' },
      items: [
        ...run, ['base60', 0, 174.5, 270], ['base60', 0, 114.5, 270], ['dish60', 0, 54.5, 270],
        ['hood60', 0, 234.5, 270], ...uppers(324.5, 174.5, 114.5, 54.5), ['upper30', 0, 294.5, 270],
        ['fridge70', 199.5, 240, 90], ['table120', 199.5, 105, 90], ['chair', 155, 120, 90], ['chair', 155, 170, 90],
        ['wardrobe120', 372.5, 325, 180], ['bed160', 352.5, 80, 90], ['nightstand', 512.5, 35, 90], ['nightstand', 512.5, 240, 90],
        ['dresser', 279.5, -60, 270], ['armchair', 400, -135, 0], ['floorlamp', 490, -135, 0],
        ...hall, ...bathTub, ['balctable', 190, -154, 0], ['chair', 130, -150, 0],
      ],
    },
    {
      id: 'scandi',
      title: 'Скандинавский',
      desc: 'Светлый ламинат, шалфейный текстиль и много воздуха. Комната поделена на гостиную с диваном и ТВ и спальню в дальней части, на балконе сушилка.',
      swatches: ['#f6f4ee', '#e3d5bd', '#9db3a0', '#6b7f8c'],
      theme: {
        walls: '#f7f5f0', door: '#f1eee7', handle: 'steel', worktop: 'white',
        floors: {
          kitchen: floor(LAM, 200, 0xb0d9ff, '#e8d8bd', 1.9), room: floor(LAM, 200, 0xb0d9ff, '#e8d8bd', 1.9), hall: floor(LAM, 200, 0xb0d9ff, '#e8d8bd', 1.9),
          bath: floor(TILE, 140, 0xe6eeee, '#e6eeee', 1.1), balcony: floor(TILE, 140, 0xd8dcdb, '#dfe2e1'),
        },
      },
      paint: { cabinet: '#e8dcc6', table: '#e3d0ae', soft: '#9db3a0' },
      items: [
        ...run, ['base60', 0, 174.5, 270], ['dish60', 0, 114.5, 270], ['base60', 0, 54.5, 270],
        ['hood60', 0, 234.5, 270], ...uppers(324.5, 174.5, 114.5, 54.5),
        ['fridge60', 204.5, 250, 90], ['table80', 209.5, 120, 90], ['chair', 165, 125, 90], ['chair', 165, 170, 90],
        ['sofa200', 279.5, -90, 270], ['tv160', 512.5, -60, 90], ['floorlamp', 285, -130, 0], ['wardrobe120', 279.5, 120, 270], ['bed140', 412.5, 185, 180],
        ...hall, ...bathShower, ['rack80', 0, -154, 0], ['dryer', 130, -154, 0],
      ],
    },
    {
      id: 'loft',
      title: 'Лофт',
      desc: 'Гладкий бетонный пол, графитовые фасады и чёрная фурнитура, серые стены, тёмная столешница, стальной стеллаж. Рабочий стол на 140 см под окном и кресло для чтения.',
      swatches: ['#3a3d40', '#74777a', '#8a5a3c', '#c8c6c0'],
      theme: {
        walls: '#a9abab', door: '#3a3d40', handle: 'black', worktop: 'dark',
        floors: {
          kitchen: solid(0x8c8b87, '#b9b8b3'), room: floor(DARK, 200, 0xffffff, '#a58f79'), hall: solid(0x8c8b87, '#b9b8b3'),
          bath: solid(0x7d7c79, '#adaca8'), balcony: solid(0x7d7c79, '#adaca8'),
        },
      },
      paint: { cabinet: '#3f4246', table: '#8a5a3c', soft: '#5a5f63' },
      items: [
        ...run, ['base90', 0, 144.5, 270], ['dish60', 0, 84.5, 270], ['hood60', 0, 234.5, 270],
        ['fridge70', 199.5, 240, 90], ['table120', 199.5, 105, 90], ['chair', 155, 120, 90], ['chair', 155, 170, 90],
        ['wardrobe180', 372.5, 325, 180], ['bed160', 352.5, 80, 90], ['rack80', 522.5, -80, 90],
        ['desk140', 340, -139, 0], ['chair', 390, -65, 180], ['armchair', 279.5, -40, 270], ['floorlamp', 285, 45, 0],
        ['hallward100', 0, 504, 180], ['shoes70', 129, 566, 180], ...bathShower, ['rack80', 0, -154, 0], ['balctable', 190, -154, 0],
      ],
    },
    {
      id: 'japandi',
      title: 'Джапанди',
      desc: 'Спокойный беж, натуральный дуб и низкая мебель. Холодильник стоит в кухонном ряду, обеденного стола нет, кухня остаётся свободной. В комнате спальня у окна и гостиная с диваном и тумбой под ТВ.',
      swatches: ['#e8dfd0', '#b99c78', '#7c6a56', '#55624f'],
      theme: {
        walls: '#ede6da', door: '#b99c78', handle: 'black', worktop: 'white',
        floors: {
          kitchen: floor(LAM, 200, 0xc4dcff, '#dcc7a8', 1.55), room: floor(LAM, 200, 0xc4dcff, '#dcc7a8', 1.55), hall: floor(LAM, 200, 0xc4dcff, '#dcc7a8', 1.55),
          bath: floor(TILE, 140, 0xeadfce, '#e2d8c8', 1.05), balcony: floor(LAM, 200, 0xb4c8e8, '#d3c4ae', 1.4),
        },
      },
      paint: { cabinet: '#b99c78', table: '#a98a64', soft: '#8b9180' },
      items: [
        ...run, ['base60', 0, 174.5, 270], ['dish60', 0, 114.5, 270], ['fridge60', 0, 54.5, 270],
        ['hood60', 0, 234.5, 270], ...uppers(324.5, 174.5, 114.5), ['upper30', 0, 294.5, 270],
        ['bed160', 279.5, -100, 270], ['sofa160', 462.5, 80, 90], ['tv160', 279.5, 90, 270], ['floorlamp', 515, 40, 0], ['wardrobe180', 372.5, 325, 180],
        ...hall, ...bathTub, ['bench', 170, -154, 0], ['rack80', 0, -154, 0],
      ],
    },
  ];
});
