// 3D-представление предметов. Настоящие модели (CC0, Poly Haven) вписываются в размеры предмета,
// остальное собирается из деталей: фасады, ручки, столешница, эмаль, сталь.
// Система предмета: центр в нуле, x — ширина, z — глубина (спинка при -z, фасад при +z), y вверх от 0.
(function () {
  const useAssets = location.protocol !== 'file:'; // с file:// браузер не отдаёт текстуры в WebGL
  const manager = new THREE.LoadingManager();
  const texLoader = new THREE.TextureLoader(manager);
  const gltfLoader = new THREE.GLTFLoader();
  const textures = new Map(), materials = new Map(), templates = new Map();
  let onChange = () => {};
  let theme = null;

  function tex(name, srgb, repeat) {
    if (!useAssets) return null;
    const key = `${name}|${repeat || ''}`;
    if (!textures.has(key)) {
      const t = texLoader.load(`assets/textures/${name}.jpg`, () => onChange());
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      if (repeat) t.repeat.set(repeat, repeat);
      t.anisotropy = 4;
      if (srgb) t.encoding = THREE.sRGBEncoding;
      textures.set(key, t);
    }
    return textures.get(key);
  }
  function mat(key, make) {
    if (!materials.has(key)) materials.set(key, make());
    return materials.get(key);
  }
  const luma = (c) => 0.3 * c.r + 0.59 * c.g + 0.11 * c.b;
  const ENV = 0.42; // доля света от окружения: при большей цвета выцветают
  const std = (p) => new THREE.MeshStandardMaterial({ envMapIntensity: ENV, ...p });
  const M = {
    steel: () => mat('steel', () => std({ color: 0xc8ccd0, metalness: 0.85, roughness: 0.34 })),
    dark: () => mat('dark', () => std({ color: 0x222427, metalness: 0.2, roughness: 0.45 })),
    enamel: () => mat('enamel', () => std({ color: 0xf5f5f2, metalness: 0, roughness: 0.16 })),
    whiteMatte: () => mat('whiteMatte', () => std({ color: 0xeeeeea, roughness: 0.55 })),
    glass: () => mat('glass', () => std({ color: 0xa9c8d6, transparent: true, opacity: 0.3, roughness: 0.05, metalness: 0.1 })),
    darkGlass: () => mat('darkGlass', () => std({ color: 0x15181b, roughness: 0.08, metalness: 0.3 })),
    plinth: () => mat('plinth', () => std({ color: 0x3b3b3a, roughness: 0.7 })),
    worktop: () => (theme && theme.worktop === 'dark'
      ? mat('worktopDark', () => std({ color: 0x2c2d2f, roughness: 0.42 }))
      : mat('worktop', () => std({ color: 0xece8df, roughness: 0.28 }))),
    handle: () => {
      const h = theme ? theme.handle : 'steel';
      if (h === 'gold') return mat('gold', () => std({ color: 0xc9a24f, metalness: 1, roughness: 0.28 }));
      if (h === 'black') return mat('blackMetal', () => std({ color: 0x17181a, metalness: 0.6, roughness: 0.4 }));
      return M.steel();
    },
    linen: () => mat('linen', () => std({ color: 0xf1eee7, roughness: 0.95 })),
    pillow: () => mat('pillow', () => std({ color: 0xfaf8f2, roughness: 0.95 })),
    wood: (color) => mat(`wood|${color}`, () => {
      const c = new THREE.Color(color);
      // Светлые фасады крашеные, иначе рисунок дерева затемняет их.
      if (!useAssets || luma(c) > 0.62) return std({ color: c, roughness: 0.5 });
      return std({ color: c.multiplyScalar(luma(c) < 0.3 ? 1.1 : 1.75), map: tex('oak_veneer_01_Diffuse', true), roughnessMap: tex('oak_veneer_01_Rough'), roughness: 0.8 });
    }),
    paint: (color) => mat(`paint|${color}`, () => std({ color: new THREE.Color(color), roughness: 0.6 })),
    fabric: (color) => mat(`fabric|${color}`, () => std({ color: new THREE.Color(color), roughness: 0.92 })),
  };

  function box(g, w, h, d, x, y, z, material) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(Math.max(w, 0.1), Math.max(h, 0.1), Math.max(d, 0.1)), material);
    m.position.set(x, y + h / 2, z);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    return m;
  }
  function cyl(g, r, h, x, y, z, material, opts = {}) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(opts.r2 != null ? opts.r2 : r, r, h, opts.seg || 28), material);
    if (opts.axis === 'z') { m.rotation.x = Math.PI / 2; m.position.set(x, y, z); } else m.position.set(x, y + h / 2, z);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    return m;
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
    ctx.lineTo(x + w, y + h - r); ctx.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
    ctx.lineTo(x + r, y + h); ctx.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
    ctx.lineTo(x, y + r); ctx.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  }

  // Фасады в ряд; handle: 'top' — планка сверху, 'bottom' — снизу, 'side' — вертикальная у края двери.
  function fronts(g, it, y0, y1, zFront, material, doors, handle) {
    const gap = 0.35, w = it.w, dw = w / doors;
    for (let i = 0; i < doors; i++) {
      const cx = -w / 2 + dw * (i + 0.5);
      box(g, dw - gap, y1 - y0 - gap, 1.8, cx, y0 + gap / 2, zFront - 0.9, material);
      if (handle === 'side') {
        const hx = cx + (doors === 1 || i % 2 ? -1 : 1) * (dw / 2 - 3.2);
        box(g, 1, Math.min(32, (y1 - y0) * 0.3), 1, hx, y0 + (y1 - y0) * 0.44, zFront + 1.1, M.handle());
      } else {
        const hy = handle === 'top' ? y1 - 5 : y0 + 4;
        box(g, Math.min(dw * 0.5, 16), 1, 1, cx, hy, zFront + 1.1, M.handle());
      }
    }
  }
  const doorCount = (w) => Math.max(1, Math.round(w / (w < 70 ? 60 : 50)));

  function baseUnit(g, it, material) {
    const top = it.h - 4;
    box(g, it.w, 10, it.d - 6, 0, 0, -2, M.plinth());
    box(g, it.w, top - 10, it.d - 2, 0, 10, -1, material);
    return top;
  }

  const builders = {
    cabinet(g, it) {
      const wood = M.wood(it.color);
      if (it.role !== 'base') {
        box(g, it.w, it.h, it.d - 2, 0, 0, -1, wood);
        fronts(g, it, 2, it.h - 2, it.d / 2, wood, doorCount(it.w), 'top');
        return;
      }
      const top = baseUnit(g, it, wood);
      fronts(g, it, 10.5, top, it.d / 2, wood, doorCount(it.w), 'top');
      box(g, it.w, 4, it.d + 1.5, 0, top, 0.5, M.worktop());
    },
    upper(g, it) {
      const wood = M.wood(it.color);
      box(g, it.w, it.h, it.d - 2, 0, 0, -1, wood);
      fronts(g, it, 0, it.h, it.d / 2, wood, doorCount(it.w), 'bottom');
    },
    wardrobe(g, it) {
      const wood = M.wood(it.color);
      box(g, it.w, 8, it.d - 5, 0, 0, -1.5, M.plinth());
      box(g, it.w, it.h - 8, it.d - 2, 0, 8, -1, wood);
      fronts(g, it, 8.5, it.h, it.d / 2, wood, Math.max(1, Math.round(it.w / 50)), 'side');
    },
    sink(g, it) {
      if (it.role === 'plumbing') {
        box(g, it.w - 4, it.h - 14, it.d - 6, 0, 0, -2, M.wood('#d8c6a6'));
        box(g, it.w, 14, it.d, 0, it.h - 14, 0, M.enamel());
        const bowl = cyl(g, Math.min(it.w, it.d) * 0.36, 2, 0, it.h - 1.9, 3, M.whiteMatte());
        bowl.scale.x = (it.w / it.d) * 1.05;
        cyl(g, 1.1, 14, 0, it.h, -it.d / 2 + 7, M.steel());
        box(g, 2, 2, 11, 0, it.h + 12, -it.d / 2 + 12, M.steel());
        return;
      }
      const wood = M.wood(it.color);
      const top = baseUnit(g, it, wood);
      fronts(g, it, 10.5, top, it.d / 2, wood, doorCount(it.w), 'top');
      box(g, it.w, 4, it.d + 1.5, 0, top, 0.5, M.worktop());
      box(g, it.w - 14, 0.5, it.d - 16, 0, it.h, 3, M.steel());
      box(g, it.w - 22, 0.4, it.d - 24, 0, it.h + 0.3, 3, M.dark());
      cyl(g, 1.2, 24, 0, it.h, -it.d / 2 + 6, M.steel());
      box(g, 2, 2, 16, 0, it.h + 22, -it.d / 2 + 13, M.steel());
    },
    stove(g, it) { // запасной вид, если модель не загрузилась
      box(g, it.w, it.h - 1, it.d, 0, 0, 0, M.whiteMatte());
      box(g, it.w - 8, it.h * 0.42, 1, 0, it.h * 0.2, it.d / 2, M.darkGlass());
      box(g, it.w, 1, it.d, 0, it.h - 1, 0, M.dark());
    },
    fridge(g, it) {
      const split = it.h * 0.68, body = it.color === '#b4bdc5' ? M.steel() : M.paint(it.color);
      box(g, it.w - 2, it.h - 2, it.d - 6, 0, 2, -3, M.whiteMatte());
      box(g, it.w, split - 3, 5, 0, 3, it.d / 2 - 2.5, body);
      box(g, it.w, it.h - split - 1, 5, 0, split + 1, it.d / 2 - 2.5, body);
      box(g, 1.6, 40, 2, -it.w / 2 + 5, split - 44, it.d / 2 + 1, M.dark());
      box(g, 1.6, 26, 2, -it.w / 2 + 5, split + 5, it.d / 2 + 1, M.dark());
    },
    dish(g, it) {
      const top = baseUnit(g, it, M.whiteMatte());
      box(g, it.w - 0.4, top - 10.5, 2, 0, 10.5, it.d / 2 - 1, M.steel());
      box(g, it.w - 0.4, 7, 2.2, 0, top - 8, it.d / 2 - 0.9, M.dark());
      box(g, it.w * 0.6, 1.4, 1.6, 0, top - 14, it.d / 2 + 1, M.dark());
      box(g, it.w, 4, it.d + 1.5, 0, top, 0.5, M.worktop());
    },
    oven(g, it) {
      const top = baseUnit(g, it, M.whiteMatte());
      box(g, it.w - 0.4, top - 10.5, 2, 0, 10.5, it.d / 2 - 1, M.steel());
      box(g, it.w - 8, (top - 10) * 0.56, 1, 0, 17, it.d / 2 + 0.3, M.darkGlass());
      box(g, it.w - 12, 1.6, 2, 0, top - 15, it.d / 2 + 1.5, M.dark());
      box(g, it.w, 4, it.d + 1.5, 0, top, 0.5, M.worktop());
    },
    hood(g, it) {
      box(g, it.w, 6, it.d, 0, 0, 0, M.steel());
      box(g, it.w * 0.42, it.h - 6, it.d * 0.5, 0, 6, -it.d * 0.25, M.steel());
    },
    wm(g, it) {
      box(g, it.w, it.h, it.d, 0, 0, 0, M.enamel());
      const r = Math.min(it.w, it.h) * 0.27;
      cyl(g, r + 1.8, 1.6, 0, it.h * 0.43, it.d / 2 + 0.6, M.steel(), { axis: 'z', seg: 40 });
      cyl(g, r, 1.8, 0, it.h * 0.43, it.d / 2 + 0.9, M.darkGlass(), { axis: 'z', seg: 40 });
      box(g, it.w - 8, 7, 0.8, 0, it.h - 10, it.d / 2 + 0.3, M.whiteMatte());
      box(g, 12, 3, 1, it.w * 0.2, it.h - 8, it.d / 2 + 0.6, M.dark());
    },
    bed(g, it) {
      const w = it.w, d = it.d, wood = M.wood('#b89a74');
      box(g, w, 26, d, 0, 4, 0, wood);
      box(g, w, it.h + 42, 5, 0, 0, -d / 2 + 2.5, wood);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => box(g, 5, 5, 5, a * (w / 2 - 5), 0, b * (d / 2 - 5), M.plinth()));
      box(g, w - 4, 20, d - 8, 0, 28, 2, M.linen());
      box(g, w - 2, 5, d * 0.62, 0, 45, d * 0.19, M.fabric(it.color));
      const pw = w > 110 ? (w - 16) / 2 : w - 14;
      (w > 110 ? [-(pw / 2 + 3), pw / 2 + 3] : [0]).forEach((x) => {
        const p = box(g, pw, 12, 42, x, 48, -d / 2 + 28, M.pillow());
        p.rotation.x = -0.18;
      });
    },
    tub(g, it) {
      if (it.h > 100) { // душевая кабина
        box(g, it.w, 10, it.d, 0, 0, 0, M.enamel());
        box(g, it.w, it.h - 10, 0.8, 0, 10, it.d / 2 - 0.4, M.glass());
        box(g, 0.8, it.h - 10, it.d, it.w / 2 - 0.4, 10, 0, M.glass());
        cyl(g, 1.2, it.h - 30, -it.w / 2 + 6, 10, -it.d / 2 + 6, M.steel());
        cyl(g, 8, 1.4, -it.w / 2 + 12, it.h - 22, -it.d / 2 + 12, M.steel());
        return;
      }
      const shape = new THREE.Shape();
      roundRect(shape, -it.w / 2, -it.d / 2, it.w, it.d, 5);
      const hole = new THREE.Path();
      roundRect(hole, -it.w / 2 + 6, -it.d / 2 + 6, it.w - 12, it.d - 12, Math.min(it.w, it.d) * 0.26);
      shape.holes.push(hole);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: it.h, bevelEnabled: false, curveSegments: 12 });
      geo.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(geo, M.enamel());
      m.castShadow = m.receiveShadow = true;
      g.add(m);
      box(g, it.w - 8, 18, it.d - 8, 0, 0, 0, M.whiteMatte());
      cyl(g, 1.2, 11, 0, it.h, -it.d / 2 + 3, M.steel());
      box(g, 2, 2, 11, 0, it.h + 9, -it.d / 2 + 8, M.steel());
    },
    toilet(g, it) {
      const tankD = it.d * 0.24;
      box(g, it.w - 2, 38, tankD, 0, it.h - 38, -it.d / 2 + tankD / 2, M.enamel());
      cyl(g, 2.2, 1, 0, it.h, -it.d / 2 + tankD / 2, M.steel());
      const foot = cyl(g, it.w * 0.28, 32, 0, 0, it.d * 0.02, M.enamel(), { r2: it.w * 0.36 });
      foot.scale.z = 1.25;
      const seat = cyl(g, it.w * 0.46, 8, 0, 32, it.d * 0.1, M.enamel(), { seg: 36 });
      seat.scale.z = (it.d * 0.72) / it.w;
      const lid = cyl(g, it.w * 0.45, 1.5, 0, 40, it.d * 0.1, M.whiteMatte(), { seg: 36 });
      lid.scale.z = (it.d * 0.7) / it.w;
    },
    table(g, it) {
      const wood = M.wood(it.color);
      box(g, it.w, 3.5, it.d, 0, it.h - 3.5, 0, wood);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => box(g, 4, it.h - 3.5, 4, a * (it.w / 2 - 4), 0, b * (it.d / 2 - 4), wood));
    },
    chair(g, it) {
      const wood = M.wood('#b89a74');
      box(g, it.w, 4, it.d, 0, 42, 0, M.fabric(it.color));
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => box(g, 3, 42, 3, a * (it.w / 2 - 2), 0, b * (it.d / 2 - 2), wood));
      box(g, it.w, it.h - 46, 3, 0, 46, -it.d / 2 + 1.5, wood);
    },
    sofa(g, it) {
      const f = M.fabric(it.color);
      box(g, it.w, 30, it.d, 0, 10, 0, f);
      box(g, it.w, it.h - 10, it.d * 0.24, 0, 10, -it.d * 0.38, f);
      [-1, 1].forEach((a) => box(g, 14, 50, it.d, a * (it.w / 2 - 7), 10, 0, f));
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => box(g, 5, 10, 5, a * (it.w / 2 - 6), 0, b * (it.d / 2 - 6), M.plinth()));
    },
    outlet(g, it) {
      box(g, it.w, it.h, it.d, 0, 0, 0, M.enamel());
      cyl(g, it.w * 0.32, 0.6, 0, it.h / 2, it.d / 2 + 0.1, M.whiteMatte(), { axis: 'z' });
    },
  };

  function fitModel(tpl, it, yaw) {
    const wrap = new THREE.Group();
    const inner = tpl.clone(true);
    inner.rotation.y = yaw || 0;
    wrap.add(inner);
    wrap.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(wrap);
    const size = bb.getSize(new THREE.Vector3());
    const c = bb.getCenter(new THREE.Vector3());
    inner.position.set(-c.x, -bb.min.y, -c.z);
    wrap.scale.set(it.w / size.x, it.h / size.y, it.d / size.z);
    const base = CATALOG.find((c) => c.id === it.cat);
    const tinted = base && it.color && it.color.toLowerCase() !== base.color.toLowerCase();
    inner.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = o.receiveShadow = true;
      o.userData.shared = true;
      o.material.envMapIntensity = ENV;
      // Свой цвет предмета умножается на текстуру модели; стекло не трогаем.
      if (tinted && !o.material.transparent) {
        const src = o.material;
        o.material = mat(`tint|${src.uuid}|${it.color}`, () => {
          const c = src.clone();
          c.color = new THREE.Color(it.color);
          // Ткань и светлая отделка закрашиваются целиком: текстуры моделей слишком тёмные для тонировки.
          if (['sofa', 'chair', 'bed'].includes(it.kind) || luma(c.color) > 0.5) c.map = null;
          else c.color.multiplyScalar(1.15);
          c.needsUpdate = true;
          return c;
        });
      }
    });
    return wrap;
  }

  function template(file) {
    const t = templates.get(file);
    if (t) return t;
    const rec = { scene: null, failed: !useAssets };
    templates.set(file, rec);
    if (useAssets) {
      gltfLoader.load(`assets/models/${file}.glb`, (gltf) => {
        rec.scene = gltf.scene;
        onChange();
      }, undefined, () => { rec.failed = true; console.warn(`Модель не загрузилась: ${file}`); });
    }
    return rec;
  }

  // Подпись для кэша: предмет пересобирается, только когда меняется его вид.
  const signature = (it) => {
    const m = CATALOG.models[it.cat];
    const rec = m && templates.get(m.file);
    return [it.cat, it.kind, it.role, it.w, it.d, it.h, it.color, rec && rec.scene ? 1 : 0, theme ? theme.id : ''].join('|');
  };

  function build(it) {
    const g = new THREE.Group();
    const conf = CATALOG.models[it.cat];
    if (conf) {
      const rec = template(conf.file);
      if (rec.scene) { g.add(fitModel(rec.scene, it, conf.yaw)); return g; }
    }
    (builders[it.kind] || builders.cabinet)(g, it);
    return g;
  }

  function dispose(g) {
    g.traverse((o) => { if (o.isMesh && !o.userData.shared && o.geometry) o.geometry.dispose(); });
  }

  window.Models3D = { build, dispose, signature, tex, M, box, std, useAssets, setOnChange: (f) => { onChange = f; }, setTheme: (t) => { theme = t; } };
  manager.onLoad = () => onChange();
})();
