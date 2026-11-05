#!/usr/bin/env python3
"""Скачивает CC0-материалы Poly Haven для 3D-сцены. Нужен только Python 3.

Показать модели категории и их размеры в мм:
  fetch_polyhaven.py --list furniture

Скачать модели в отдельные папки (потом сжать через gltf-transform):
  fetch_polyhaven.py --models sofa_02 dining_chair_02 --out work/models

Скачать текстуры, уменьшив до 512 px (на macOS через sips):
  fetch_polyhaven.py --textures laminate_floor_03 marble_01 --out assets/textures

Запускайте с python3 -I: скачанные файлы не должны влиять на импорт модулей.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request

API = 'https://api.polyhaven.com'
HEADERS = {'User-Agent': 'apartment-planner-skill/1.0'}
MAPS = ('Diffuse', 'nor_gl', 'Rough')
SAFE_ID = re.compile(r'^[A-Za-z0-9_-]+$')


def get_json(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=60) as r:
        return json.load(r)


def download(url, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=180) as r, open(path, 'wb') as f:
        shutil.copyfileobj(r, f)


def inside(root, rel):
    """Путь из ответа API не должен выходить за папку модели."""
    full = os.path.realpath(os.path.join(root, rel))
    if not full.startswith(os.path.realpath(root) + os.sep):
        raise ValueError(f'Подозрительный путь в ответе API: {rel}')
    return full


def check_id(asset):
    if not SAFE_ID.match(asset):
        raise ValueError(f'Некорректный идентификатор: {asset}')


def list_models(category):
    data = get_json(f'{API}/assets?t=models&c={category}')
    for name, info in sorted(data.items()):
        size = '×'.join(str(round(v)) for v in info.get('dimensions', []))
        print(f'{name}\t{size}\t{", ".join(info.get("categories", []))}')


def fetch_model(asset, out, res):
    check_id(asset)
    gltf = get_json(f'{API}/files/{asset}')['gltf'][res]['gltf']
    root = os.path.join(out, asset)
    os.makedirs(root, exist_ok=True)
    download(gltf['url'], inside(root, f'{asset}.gltf'))
    for rel, f in gltf['include'].items():
        download(f['url'], inside(root, rel))
    print(f'{asset}: {root}')


def fetch_texture(asset, out, res, size):
    check_id(asset)
    info = get_json(f'{API}/files/{asset}')
    os.makedirs(out, exist_ok=True)
    sips = shutil.which('sips')
    with tempfile.TemporaryDirectory() as tmp:
        for name in MAPS:
            if name not in info:
                print(f'{asset}: нет карты {name}', file=sys.stderr)
                continue
            dst = os.path.join(out, f'{asset}_{name}.jpg')
            src = os.path.join(tmp, f'{name}.jpg')
            download(info[name][res]['jpg']['url'], src)
            if sips:
                subprocess.run([sips, '-Z', str(size), '-s', 'formatOptions', '72', src, '--out', dst], check=True, capture_output=True)
            else:
                shutil.copy(src, dst)
                print(f'{dst}: sips нет, размер не уменьшен', file=sys.stderr)
    print(f'{asset}: {out}')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--list', metavar='CATEGORY', help='показать модели категории')
    ap.add_argument('--models', nargs='*', default=[])
    ap.add_argument('--textures', nargs='*', default=[])
    ap.add_argument('--out', help='папка назначения')
    ap.add_argument('--res', default='1k', help='разрешение исходников')
    ap.add_argument('--size', type=int, default=512, help='сторона текстуры после уменьшения')
    args = ap.parse_args()
    if args.list:
        list_models(args.list)
    if (args.models or args.textures) and not args.out:
        ap.error('нужна папка --out')
    if not (args.list or args.models or args.textures):
        ap.error('укажите --list, --models или --textures')
    for m in args.models:
        fetch_model(m, args.out, args.res)
    for t in args.textures:
        fetch_texture(t, args.out, args.res, args.size)


if __name__ == '__main__':
    main()
