#!/usr/bin/env python3
"""verify_docs.py — Verificador automatizado de documentación Mabel IA.

Qué hace
--------
Para cada archivo `docs/*.md` + `CLAUDE.md` + `.claude/agents/AGENT_*.md`,
verifica:

1. **Dead pointers**: paths citados (`backend/X.py`, `frontend/src/Y.tsx`,
   `docs/Z.md`, `.claude/...`, etc.) deben existir en el filesystem.
2. **archivo:linea refs**: el archivo citado debe existir; la línea citada
   debe ser razonable (≤ total de líneas del archivo).
3. **Commit hashes**: hashes git citados (`commit X`, `\`hash\``) deben
   existir vía `git cat-file -e`.
4. **YAML frontmatter de agents**: `.claude/agents/AGENT_*.md` deben tener
   YAML válido con `name`, `description`, `model`.
5. **Cross-doc refs**: `docs/X.md §N.M` — verifica que la sección §N.M exista.
6. **Numbering gaps**: secciones §X.1, §X.2, §X.4 (sin §X.3) — flag.

Cómo usar
---------
    # Verificar todos los docs:
    python scripts/verify_docs.py

    # Verificar solo los staged en git (uso por pre-commit hook):
    python scripts/verify_docs.py --staged

    # Modo report (no exit 1; útil para CI no-bloqueante):
    python scripts/verify_docs.py --report-only

Exit codes
----------
0: OK (sin violations o --report-only)
1: violaciones encontradas (modo default)
2: error operativo (git no disponible, etc.)
"""
from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# --- Doc files in scope ---
DOC_GLOBS = [
    "docs/*.md",
    "CLAUDE.md",
    ".claude/agents/AGENT_*.md",
]

# --- Patrones de referencia ---
# Match `path/to/file.ext` o `path/to/file.ext:line` o `archivo.py:42-58`
# Solo paths que terminan en extensiones conocidas para reducir falsos
# positivos (cada extension agrega ruido).
PATH_EXT_RE = re.compile(
    r"`([a-zA-Z0-9_/\-.]+\.(py|tsx?|md|toml|json|yml|yaml|sql|sh|ini|cfg))(?::(\d+)(?:-(\d+))?)?`"
)

# Match commits inline: `4546308`, commit `4546308`, etc. (7-40 hex chars).
# Negative lookahead `(?!_)` evita matchear Alembic revision IDs como
# `08b6189ffc35` (siempre seguidos de `_descripcion.py`).
COMMIT_RE = re.compile(r"`([0-9a-f]{7,40})`(?!_)")

# Match cross-doc section: `docs/X.md §N.M` o `\`docs/X.md\` §N.M`
SECTION_REF_RE = re.compile(
    r"`?([a-zA-Z0-9_/\-.]+\.md)`?\s*§(\d+(?:\.\d+)*)"
)

# Numbering scan: títulos ### N.M Foo dentro de un doc; detecta gaps.
HEADING_RE = re.compile(r"^###\s+(\d+\.\d+)\s+")

# Common docs/components que un dev podría citar pero que también pueden
# ser literales sin path (ej. "TODO.md" en texto). Ignoramos warnings de
# rutas muy genéricas si NO existen como archivo.
GENERIC_FALSE_POSITIVES = {
    "TODO.md",
    "CHANGELOG.md",
    "README.md",  # solo si no hay path concreto
}


def run(cmd: list[str], cwd: Path | None = None) -> tuple[int, str]:
    """Run a command and return (returncode, combined output)."""
    result = subprocess.run(
        cmd,
        cwd=cwd or REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    return result.returncode, (result.stdout + result.stderr).strip()


def collect_docs(staged_only: bool) -> list[Path]:
    """Devuelve la lista de archivos docs a verificar."""
    if staged_only:
        code, out = run(["git", "diff", "--cached", "--name-only", "--diff-filter=ACMR"])
        if code != 0:
            return []
        all_files = [REPO_ROOT / f for f in out.splitlines() if f.strip()]
        # Filtrar solo los que matchean nuestros globs
        scope = set()
        for glob in DOC_GLOBS:
            scope.update(REPO_ROOT.glob(glob))
        return [f for f in all_files if f in scope and f.exists()]
    docs = []
    for glob in DOC_GLOBS:
        docs.extend(REPO_ROOT.glob(glob))
    return sorted(docs)


def commit_exists(sha: str) -> bool:
    code, _ = run(["git", "cat-file", "-e", sha])
    return code == 0


def file_line_count(path: Path) -> int:
    try:
        return sum(1 for _ in path.read_text(errors="ignore").splitlines())
    except OSError:
        return 0


def resolve_path(cited_path: str, doc: Path) -> Path | None:
    """Intenta resolver un path citado bajo varios prefijos comunes.

    Estrategia (primer hit gana):
    1. Como-está, relativo a la raíz del repo.
    2. Relativo al directorio del doc (para refs `../`).
    3. Bajo prefijos comunes: `backend/`, `backend/app/`,
       `backend/scripts/`, `frontend/src/`, `frontend/src/components/`,
       `frontend/src/pages/`, `frontend/src/`.

    Devuelve el Path resuelto si existe, None si no.
    """
    candidates = [
        REPO_ROOT / cited_path,
        (doc.parent / cited_path).resolve(),
    ]
    for prefix in [
        "backend/",
        "backend/app/",
        "backend/scripts/",
        "frontend/",
        "frontend/src/",
        "frontend/src/api/",
        "frontend/src/components/",
        "frontend/src/components/admin/",
        "frontend/src/components/chat/",
        "frontend/src/components/voice/",
        "frontend/src/components/settings/",
        "frontend/src/components/admin/charts/",
        "frontend/src/hooks/",
        "frontend/src/pages/",
        "frontend/src/stores/",
        "frontend/src/utils/",
    ]:
        candidates.append(REPO_ROOT / (prefix + cited_path))
    for c in candidates:
        if c.exists():
            return c
    return None


INTENTIONAL_MARKERS = (
    "reemplaza",
    "deprecated",
    "no existe",
    "no commiteado",
    "no está commiteado",
    "pendiente",
    "planeado",
    "borrado",
    "obsoleto",
    "eliminar",
    "luego eliminar",
    "como propuesta",
    "si se implementa",
    "se implementará",
    "nuevos archivos",
    "modificaciones",
    "propuesto",
    "post-mvp",
    "fase 9",
    "fase 10",
    "fase 11",
    "wave",
    "no implementado",
    "validación po",
)


def is_line_intentional(content: str, match_start: int) -> bool:
    """Heurística (case-insensitive): si la línea o el bullet padre que
    contiene el match menciona algún marker de "intencional", skip.

    Mira la línea actual + la línea anterior (para casos como
    "Nuevos archivos:\n- `path/foo.py`")."""
    line_start = content.rfind("\n", 0, match_start) + 1
    line_end = content.find("\n", match_start)
    if line_end == -1:
        line_end = len(content)
    line = content[line_start:line_end].lower()

    # Línea anterior (para listas con header)
    prev_end = line_start - 1
    prev_start = content.rfind("\n", 0, prev_end) + 1 if prev_end > 0 else 0
    prev_line = content[prev_start:prev_end].lower() if prev_end > prev_start else ""

    combined = line + " " + prev_line
    return any(m in combined for m in INTENTIONAL_MARKERS)


def check_paths(doc: Path, content: str) -> list[str]:
    """Verifica que los paths citados existan.

    Solo flag paths que contengan `/` (paths con directorio separador) —
    los filenames bare como `config.py` o `prompts.py` son demasiado
    comunes como menciones contextuales y generan falsos positivos.

    Skip paths citados en líneas que contengan markers de "intencional"
    (Reemplaza, deprecated, no existe, pendiente, etc.) — esos son
    refs a archivos que el doc declara como removidos o futuros.
    """
    violations = []
    for m in PATH_EXT_RE.finditer(content):
        cited_path = m.group(1)
        line_start = int(m.group(3)) if m.group(3) else None
        line_end = int(m.group(4)) if m.group(4) else line_start

        # Skip bare filenames sin directorio.
        if "/" not in cited_path:
            continue
        if cited_path in GENERIC_FALSE_POSITIVES:
            continue
        if cited_path.endswith(doc.name):
            continue
        # Skip refs intencionales (deprecated / pendiente).
        if is_line_intentional(content, m.start()):
            continue

        resolved = resolve_path(cited_path, doc)
        if resolved is None:
            violations.append(
                f"  dead-path: `{cited_path}` no existe (citado con backticks)"
            )
            continue

        # Verificar rango de líneas si aplica
        if line_start is not None:
            total = file_line_count(resolved)
            ref_line = line_end or line_start
            if ref_line > total:
                violations.append(
                    f"  line-out-of-range: `{cited_path}:{line_start}` "
                    f"(archivo tiene {total} líneas, citada {ref_line})"
                )
    return violations


def check_commits(content: str) -> list[str]:
    """Verifica que hashes git citados existan en el repo."""
    violations = []
    seen = set()
    for m in COMMIT_RE.finditer(content):
        sha = m.group(1)
        # Solo verificar hashes que parecen commits (>=7 chars)
        # y que sean hex puro. El regex ya garantiza ambos.
        # Skip: muy cortos pueden ser hash de otra cosa (sha256 truncado, IDs)
        if len(sha) < 7 or sha in seen:
            continue
        seen.add(sha)
        # Heurística: ignorar si parece UUID partial o si es claramente
        # ejemplo (ej. todos zeros, todos efes)
        if sha == "0" * len(sha) or sha == "f" * len(sha):
            continue
        if not commit_exists(sha):
            violations.append(f"  dead-commit: `{sha}` no existe en git history")
    return violations


def check_cross_doc_sections(doc: Path, content: str, all_docs: dict[str, str]) -> list[str]:
    """Verifica refs '`docs/X.md` §N.M' — sección debe existir en X.md."""
    violations = []
    for m in SECTION_REF_RE.finditer(content):
        target_doc = m.group(1)
        section = m.group(2)
        # Resolver path: si es relativo a docs/
        if not target_doc.startswith("docs/") and not target_doc.startswith("/"):
            # Asumir que está en la misma carpeta
            target_doc = f"docs/{target_doc.lstrip('./')}"
        target_path = REPO_ROOT / target_doc
        if not target_path.exists():
            # Ya se reporta en check_paths; skip
            continue
        target_content = all_docs.get(target_doc) or target_path.read_text(errors="ignore")
        all_docs[target_doc] = target_content
        # Buscar la sección. Aceptamos:
        #  - cualquier nivel (## N.M, ### N.M, etc.)
        #  - terminación `.` o ` ` después del número (`## 10.` o `## 10 `)
        section_re = re.compile(
            rf"^#+\s+{re.escape(section)}[.\s]",
            re.MULTILINE,
        )
        if not section_re.search(target_content):
            violations.append(
                f"  dead-section: `{target_doc}` §{section} no existe en el doc destino"
            )
    return violations


def check_numbering_gaps(content: str) -> list[str]:
    """Detecta gaps en secciones ### X.Y (ej. 9.1, 9.2, 9.4 sin 9.3)."""
    violations = []
    # Agrupar headings por prefijo (9 -> [1, 2, 4])
    by_prefix: dict[str, list[int]] = {}
    for m in HEADING_RE.finditer(content):
        parts = m.group(1).split(".")
        if len(parts) != 2:
            continue
        prefix, sub = parts
        try:
            sub_n = int(sub)
        except ValueError:
            continue
        by_prefix.setdefault(prefix, []).append(sub_n)

    for prefix, subs in by_prefix.items():
        subs_sorted = sorted(set(subs))
        if not subs_sorted:
            continue
        expected = list(range(min(subs_sorted), max(subs_sorted) + 1))
        missing = [n for n in expected if n not in subs_sorted]
        if missing:
            violations.append(
                f"  numbering-gap: §{prefix} salta {missing} "
                f"(presentes: {subs_sorted})"
            )
    return violations


def check_agent_yaml(doc: Path) -> list[str]:
    """Para .claude/agents/AGENT_*.md verificar YAML frontmatter válido."""
    if not doc.name.startswith("AGENT_") or doc.parent.name != "agents":
        return []
    try:
        import yaml  # type: ignore[import-untyped]
    except ImportError:
        return [
            "  yaml-skip: PyYAML no instalado; saltando validación de frontmatter"
        ]
    text = doc.read_text(errors="ignore")
    m = re.match(r"^---\n(.*?)\n---\n", text, re.DOTALL)
    if not m:
        return ["  agent-yaml: no se encontró frontmatter `---` al inicio"]
    try:
        data = yaml.safe_load(m.group(1))
    except yaml.YAMLError as exc:
        return [f"  agent-yaml: frontmatter inválido: {exc}"]
    violations = []
    for required in ("name", "description", "model"):
        if not isinstance(data, dict) or required not in data:
            violations.append(f"  agent-yaml: falta campo `{required}`")
    return violations


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--staged", action="store_true", help="Solo verificar archivos staged en git"
    )
    parser.add_argument(
        "--report-only",
        action="store_true",
        help="Imprimir violations pero exit 0 (no bloqueante)",
    )
    args = parser.parse_args()

    docs = collect_docs(args.staged)
    if not docs:
        print("verify_docs: nada que verificar.")
        return 0

    print(f"verify_docs: revisando {len(docs)} archivos…\n")

    total_violations = 0
    all_docs_cache: dict[str, str] = {}

    for doc in docs:
        try:
            content = doc.read_text(errors="ignore")
        except OSError as exc:
            print(f"⚠ {doc.relative_to(REPO_ROOT)}: no se pudo leer ({exc})")
            continue

        v: list[str] = []
        v += check_paths(doc, content)
        v += check_commits(content)
        v += check_cross_doc_sections(doc, content, all_docs_cache)
        v += check_numbering_gaps(content)
        v += check_agent_yaml(doc)

        if v:
            print(f"✗ {doc.relative_to(REPO_ROOT)}")
            for line in v:
                print(line)
            print()
            total_violations += len(v)
        else:
            print(f"✓ {doc.relative_to(REPO_ROOT)}")

    print()
    print(f"Total violaciones: {total_violations}")

    if total_violations == 0:
        return 0
    if args.report_only:
        print("(--report-only: no bloqueante)")
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
