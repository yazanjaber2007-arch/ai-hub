"""Page assembler: one source tree, three builds (live / demo / preview).

Sources live in app/static/src: shell.html, css/*.css and js/*.js, joined in file-name order.
Markers decide who gets what:

    /*LIVE-START*/ ... /*LIVE-END*/     (JS and CSS)     <!--LIVE--> ... <!--/LIVE-->   (HTML)
    /*DEMO-START*/ ... /*DEMO-END*/                      <!--DEMO--> ... <!--/DEMO-->

The live build drops DEMO blocks. The demo and preview builds drop LIVE blocks, so they physically
contain no login, API or approval code and cannot touch the hub.

Placeholders: {{MODE}} {{TITLE}} {{HEAD}} {{CSS}} {{JS}} {{font:NAME}} {{asset:PATH}}
Static files (fonts, the 3D bundle) are served from /assets with versioned URLs.
"""
from __future__ import annotations

import gzip
import hashlib
import os
import re
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).parent / "static"
SRC = ROOT / "src"
ASSETS = ROOT / "assets"

MODES = ("live", "demo", "preview")
TITLES = {
    "live": "Command Center",
    "demo": "Command Center — Demo",
    "preview": "Command Center — Preview v2",
}

CONTENT_TYPES = {
    ".js": "text/javascript; charset=utf-8",
    ".woff2": "font/woff2",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".json": "application/json",
    ".txt": "text/plain; charset=utf-8",
}

_DEV = os.environ.get("HUB_DEV") == "1"


# ------------------------------------------------------------------ assets

def _digest(path: Path) -> str:
    return hashlib.sha1(path.read_bytes()).hexdigest()[:10]


@lru_cache(maxsize=256)
def _digest_cached(path_str: str, mtime: float) -> str:
    return _digest(Path(path_str))


def asset_version(rel: str) -> str:
    p = ASSETS / rel
    if not p.is_file():
        return "0"
    return _digest_cached(str(p), p.stat().st_mtime)


def asset_url(rel: str) -> str:
    return f"/assets/{rel}?v={asset_version(rel)}"


def asset(rel: str, accept_encoding: str = ""):
    """Resolve a request path to (file, content_encoding, content_type) or None.

    Only files inside static/assets with a whitelisted extension are served. A pre-compressed
    sibling (.br / .gz) is used when the client accepts it.
    """
    if not rel or "\\" in rel or rel.startswith("/") or "\x00" in rel:
        return None
    if any(part in ("", ".", "..") for part in rel.split("/")):
        return None
    base = ASSETS.resolve()
    p = (ASSETS / rel).resolve()
    try:
        p.relative_to(base)
    except ValueError:
        return None
    ctype = CONTENT_TYPES.get(p.suffix)
    if ctype is None or not p.is_file():
        return None
    accepted = {e.split(";")[0].strip() for e in accept_encoding.lower().split(",")}
    if p.suffix == ".js":
        for enc, ext in (("br", ".br"), ("gzip", ".gz")):
            sib = p.with_name(p.name + ext)
            if enc in accepted and sib.is_file():
                return sib, enc, ctype
    return p, None, ctype


# ------------------------------------------------------------------ assembly

def _strip(text: str, mode: str) -> str:
    drop = "DEMO" if mode == "live" else "LIVE"
    text = re.sub(rf"/\*{drop}-START\*/.*?/\*{drop}-END\*/", "", text, flags=re.S)
    text = re.sub(rf"<!--{drop}-->.*?<!--/{drop}-->", "", text, flags=re.S)
    return re.sub(r"/\*(?:LIVE|DEMO)-(?:START|END)\*/|<!--/?(?:LIVE|DEMO)-->", "", text)


def _subst_assets(text: str) -> str:
    text = re.sub(r"\{\{font:([A-Za-z0-9_.\-]+)\}\}", lambda m: asset_url(f"fonts/{m.group(1)}.woff2"), text)
    return re.sub(r"\{\{asset:([A-Za-z0-9_./\-]+)\}\}", lambda m: asset_url(m.group(1)), text)


def _read_sorted(folder: Path, suffix: str) -> str:
    parts = []
    for p in sorted(folder.glob(f"*{suffix}")):
        parts.append(f"/* {p.name} */\n" + p.read_text(encoding="utf-8"))
    return "\n".join(parts)


def _source_stamp() -> float:
    files = [SRC / "shell.html", *SRC.glob("css/*.css"), *SRC.glob("js/*.js")]
    return max((f.stat().st_mtime for f in files if f.exists()), default=0.0)


@lru_cache(maxsize=16)
def _build(mode: str, stamp: float) -> str:
    shell = (SRC / "shell.html").read_text(encoding="utf-8")
    css = _read_sorted(SRC / "css", ".css")
    js = _read_sorted(SRC / "js", ".js")
    html = (shell.replace("{{CSS}}", css).replace("{{JS}}", js)
                 .replace("{{MODE}}", mode).replace("{{TITLE}}", TITLES[mode]))
    return _subst_assets(_strip(html, mode))


def build(mode: str) -> str:
    if mode not in MODES:
        raise ValueError(mode)
    return _build(mode, _source_stamp() if _DEV else 0.0)


@lru_cache(maxsize=64)
def _gzipped(html: str) -> bytes:
    return gzip.compress(html.encode("utf-8"), compresslevel=9, mtime=0)


def render(mode: str, head: str = "") -> str:
    return build(mode).replace("{{HEAD}}", head, 1)


def render_compressed(mode: str, head: str = "") -> bytes:
    return _gzipped(render(mode, head))
