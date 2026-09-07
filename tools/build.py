#!/usr/bin/env python3
"""
Assemble the single-file game.

  python3 tools/build.py            ->  index.html

Inputs (src/):
  template.html   markup + CSS, with __SPRITES_JSON__ / __PACK_B64__ / __GAME_JS__ slots
  1-core.js       constants, difficulty model, strings, save data, pack decoder
  2-gen.js        deterministic level generator (reverse construction — always solvable)
  3-engine.js     board rendering, rules, animation, pan/zoom, Mago
  4-ui.js         level map, daily, awards, weekly board, modals, input, boot
  pack.b64        levels 1..N baked at build time (node tools/bake.js)
  sprites.json    Mago sprite sheet as data: URLs
"""
import datetime, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "src")
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "index.html")
JS = ("1-core.js", "2-gen.js", "3-engine.js", "4-ui.js")


def read(name):
    with open(os.path.join(SRC, name), encoding="utf-8") as f:
        return f.read()


def main():
    tpl = read("template.html")
    js = "\n".join(read(n) for n in JS)
    pack = read("pack.b64").strip()
    sprites = json.dumps(json.loads(read("sprites.json")), separators=(",", ":"))

    for token in ("__SPRITES_JSON__", "__PACK_B64__", "__GAME_JS__"):
        if token not in tpl:
            raise SystemExit(f"template is missing {token}")

    # 版本號的唯一來源是 package.json；日期是這次 build 的日期
    with open(os.path.join(ROOT, "package.json"), encoding="utf-8") as f:
        version = json.load(f)["version"]
    built = datetime.date.today().isoformat()

    for token in ("__VERSION__", "__BUILT__"):
        if token not in js:
            raise SystemExit(f"少了 {token} 宣告（應該在 1-core.js）")

    html = (tpl.replace("__SPRITES_JSON__", sprites)
               .replace("__PACK_B64__", pack)
               .replace("__GAME_JS__", js)
               .replace("__VERSION__", version)
               .replace("__BUILT__", built))
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(html)

    for n in JS:
        print(f"  {n:14s} {len(read(n))/1e3:7.1f} kB")
    print(f"  {'sprites':14s} {len(sprites)/1e3:7.1f} kB")
    print(f"  {'pack':14s} {len(pack)/1e3:7.1f} kB")
    print(f"-> {os.path.relpath(OUT, ROOT)}  {os.path.getsize(OUT)/1e3:.0f} kB"
          f"   v{version}  built {built}")


if __name__ == "__main__":
    main()
