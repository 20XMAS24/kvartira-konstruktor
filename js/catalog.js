// Каталог. w — ширина по фасаду, d — глубина, h — высота, z — высота низа над полом.
// role: base | upper | tall | appliance | furniture | plumbing | point
// hug: при перетаскивании разворачивается спиной к ближайшей стене.
// front: у предмета есть фасад, перед ним проверяется проход.
// loose: стул и подобное, сдвигается руками и на проход не влияет.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CATALOG = factory();
})(this, function () {
  const WOOD = '#d8c6a6', WOOD_UP = '#e8dcc6', TALL = '#c5b18f', STEEL = '#b4bdc5',
    SAGE = '#c3cfbb', BLUE = '#b3c5d6', SAN = '#d6e5ec', DARK = '#7f8a93';
  const list = [];
  const add = (group, id, name, w, d, h, role, kind, color, extra) =>
    list.push(Object.assign({ group, id, name, w, d, h, z: 0, role, kind, color, hug: true, front: false }, extra));

  // Кухня: нижние шкафы, глубина 60, вместе со столешницей 89
  [30, 40, 45, 50, 60, 80, 90, 100].forEach((w) =>
    add('Кухня: нижние', 'base' + w, `Шкаф нижний ${w}`, w, 60, 89, 'base', 'cabinet', WOOD, { front: true }));
  add('Кухня: нижние', 'corner90', 'Угловой нижний 90', 90, 90, 89, 'base', 'cabinet', WOOD, { front: true });
  add('Кухня: нижние', 'sink60', 'Мойка в шкафу 60', 60, 60, 89, 'base', 'sink', WOOD, { front: true });
  add('Кухня: нижние', 'sink80', 'Мойка в шкафу 80', 80, 60, 89, 'base', 'sink', WOOD, { front: true });

  // Кухня: верхние шкафы, низ на 145
  [30, 40, 45, 50, 60, 80, 90, 100].forEach((w) =>
    add('Кухня: верхние', 'upper' + w, `Шкаф верхний ${w}`, w, 32, 72, 'upper', 'upper', WOOD_UP, { z: 145 }));
  add('Кухня: верхние', 'hood60', 'Вытяжка 60', 60, 50, 30, 'upper', 'hood', STEEL, { z: 159, power: true });
  add('Кухня: верхние', 'hood50', 'Вытяжка 50', 50, 50, 30, 'upper', 'hood', STEEL, { z: 159, power: true });

  // Кухня: техника и колонны
  add('Кухня: техника', 'stove60', 'Плита электрическая 60', 60, 60, 89, 'appliance', 'stove', DARK, { front: true, power: true });
  add('Кухня: техника', 'stove50', 'Плита электрическая 50', 50, 60, 89, 'appliance', 'stove', DARK, { front: true, power: true });
  add('Кухня: техника', 'fridge60', 'Холодильник 60', 60, 65, 190, 'appliance', 'fridge', STEEL, { front: true, power: true });
  add('Кухня: техника', 'fridge70', 'Холодильник 70', 70, 70, 200, 'appliance', 'fridge', STEEL, { front: true, power: true });
  add('Кухня: техника', 'dish60', 'Посудомойка 60', 60, 60, 89, 'appliance', 'dish', STEEL, { front: true, power: true });
  add('Кухня: техника', 'dish45', 'Посудомойка 45', 45, 60, 89, 'appliance', 'dish', STEEL, { front: true, power: true });
  add('Кухня: техника', 'oven60', 'Шкаф с духовкой 60', 60, 60, 89, 'appliance', 'oven', STEEL, { front: true, power: true });
  add('Кухня: техника', 'tall60', 'Колонна-пенал 60', 60, 60, 210, 'tall', 'wardrobe', TALL, { front: true });
  add('Кухня: техника', 'tall45', 'Колонна-пенал 45', 45, 60, 210, 'tall', 'wardrobe', TALL, { front: true });

  // Обеденная зона
  add('Стол и стулья', 'table80', 'Стол 80×60', 80, 60, 75, 'furniture', 'table', SAGE, { hug: false });
  add('Стол и стулья', 'table120', 'Стол 120×70', 120, 70, 75, 'furniture', 'table', SAGE, { hug: false });
  add('Стол и стулья', 'chair', 'Стул', 42, 42, 88, 'furniture', 'chair', BLUE, { hug: false, loose: true });

  // Комната
  add('Комната', 'bed90', 'Кровать 90×200', 90, 200, 50, 'furniture', 'bed', BLUE);
  add('Комната', 'bed140', 'Кровать 140×200', 140, 200, 50, 'furniture', 'bed', BLUE);
  add('Комната', 'bed160', 'Кровать 160×200', 160, 200, 50, 'furniture', 'bed', BLUE);
  add('Комната', 'sofa200', 'Диван 200', 200, 92, 85, 'furniture', 'sofa', BLUE);
  add('Комната', 'sofa160', 'Диван 160', 160, 90, 85, 'furniture', 'sofa', BLUE);
  add('Комната', 'armchair', 'Кресло', 80, 80, 85, 'furniture', 'sofa', BLUE);
  add('Комната', 'wardrobe120', 'Шкаф 120', 120, 60, 240, 'tall', 'wardrobe', TALL, { front: true });
  add('Комната', 'wardrobe180', 'Шкаф 180', 180, 60, 240, 'tall', 'wardrobe', TALL, { front: true });
  add('Комната', 'wardrobe240', 'Шкаф 240', 240, 60, 240, 'tall', 'wardrobe', TALL, { front: true });
  add('Комната', 'desk120', 'Письменный стол 120', 120, 60, 75, 'furniture', 'table', SAGE);
  add('Комната', 'desk140', 'Письменный стол 140', 140, 70, 75, 'furniture', 'table', SAGE);
  add('Комната', 'dresser', 'Комод 100', 100, 45, 85, 'furniture', 'cabinet', WOOD, { front: true });
  add('Комната', 'tv160', 'Тумба под ТВ 160', 160, 40, 50, 'furniture', 'cabinet', WOOD, { front: true });
  add('Комната', 'shelf80', 'Стеллаж 80', 80, 30, 200, 'furniture', 'cabinet', WOOD, { front: true });
  add('Комната', 'nightstand', 'Тумбочка', 45, 40, 50, 'furniture', 'cabinet', WOOD);

  // Прихожая
  add('Прихожая', 'hallward100', 'Шкаф в прихожую 100', 100, 45, 240, 'tall', 'wardrobe', TALL, { front: true });
  add('Прихожая', 'hallward120', 'Шкаф в прихожую 120', 120, 45, 240, 'tall', 'wardrobe', TALL, { front: true });
  add('Прихожая', 'shoes70', 'Обувница 70', 70, 30, 60, 'furniture', 'cabinet', WOOD, { front: true });
  add('Прихожая', 'hanger', 'Вешалка 80', 80, 30, 180, 'furniture', 'cabinet', SAGE);
  add('Прихожая', 'bench', 'Банкетка', 80, 35, 45, 'furniture', 'table', BLUE);

  // Санузел
  add('Санузел', 'tub150', 'Ванна 150', 150, 70, 58, 'plumbing', 'tub', SAN);
  add('Санузел', 'tub170', 'Ванна 170', 170, 70, 58, 'plumbing', 'tub', SAN);
  add('Санузел', 'shower90', 'Душевая 90', 90, 90, 210, 'plumbing', 'tub', SAN);
  add('Санузел', 'basin50', 'Раковина 50', 50, 48, 85, 'plumbing', 'sink', SAN, { front: true });
  add('Санузел', 'basin60', 'Раковина с тумбой 60', 60, 48, 85, 'plumbing', 'sink', SAN, { front: true });
  add('Санузел', 'toilet', 'Унитаз', 38, 70, 80, 'plumbing', 'toilet', SAN);
  add('Санузел', 'wm60', 'Стиральная машина', 60, 45, 85, 'appliance', 'wm', STEEL, { front: true, power: true });
  add('Санузел', 'bathshelf', 'Шкафчик 40', 40, 30, 180, 'furniture', 'cabinet', WOOD);

  // Балкон
  add('Балкон', 'rack80', 'Стеллаж на балкон 80', 80, 30, 180, 'furniture', 'cabinet', WOOD);
  add('Балкон', 'balctable', 'Столик 60×40', 60, 40, 72, 'furniture', 'table', SAGE);
  add('Балкон', 'dryer', 'Сушилка', 120, 50, 100, 'furniture', 'table', BLUE, { loose: true });

  // Свет: источник света появляется в 3D вместе с предметом
  const LAMP = '#e8d9b8';
  add('Свет', 'floorlamp', 'Торшер', 36, 36, 165, 'furniture', 'lamp', LAMP, { hug: false, loose: true });
  add('Свет', 'tablelamp', 'Настольная лампа', 22, 22, 42, 'furniture', 'lamp', LAMP, { hug: false, loose: true, z: 75 });
  add('Свет', 'pendant', 'Подвесной светильник', 40, 40, 34, 'furniture', 'lamp', LAMP, { hug: false, loose: true, z: 205 });

  // Свои точки: розетки там, где ещё нет замеров
  add('Свои замеры', 'outlet30', 'Розетка низкая', 8, 3, 8, 'point', 'outlet', '#d9542b', { z: 30 });
  add('Свои замеры', 'outlet110', 'Розетка над столешницей', 8, 3, 8, 'point', 'outlet', '#d9542b', { z: 111 });

  // Настоящие модели (CC0, Poly Haven): файл в assets/models и поворот, чтобы фасад смотрел на +z.
  const sofa = { file: 'sofa_02' }, table = { file: 'wooden_table_02' }, side = { file: 'side_table_01' }, stove = { file: 'electric_stove' };
  list.models = {
    sofa200: sofa, sofa160: sofa,
    armchair: { file: 'modern_arm_chair_01' },
    chair: { file: 'dining_chair_02' },
    table80: table, table120: table, desk120: table, desk140: table,
    tv160: { file: 'modern_wooden_cabinet' },
    dresser: { file: 'painted_wooden_cabinet' },
    shelf80: { file: 'wooden_display_shelves_01' },
    rack80: { file: 'steel_frame_shelves_02' },
    nightstand: side, balctable: side,
    stove60: stove, stove50: stove,
    bench: { file: 'Ottoman_01' },
  };

  return list;
});
