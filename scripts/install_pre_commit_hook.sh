#!/usr/bin/env bash
# install_pre_commit_hook.sh — instala el hook pre-commit que ejecuta
# `scripts/verify_docs.py --staged` antes de cada commit que toca docs/.
#
# Uso:
#   bash scripts/install_pre_commit_hook.sh
#
# Idempotente: re-ejecutar sobre-escribe el hook existente.
# Para desinstalar: rm .git/hooks/pre-commit

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOK="$REPO_ROOT/.git/hooks/pre-commit"

cat > "$HOOK" <<'EOF'
#!/usr/bin/env bash
# Pre-commit hook generado por scripts/install_pre_commit_hook.sh.
# Verifica que los docs no tengan dead pointers, line refs out-of-range,
# YAML frontmatter inválido en agents, ni numbering gaps en sections.
#
# Modo: --report-only (warnings, no bloqueante). Cambiar a strict
# eliminando el flag cuando el equipo esté listo para enforcement.

set -e

TOUCHED=$(git diff --cached --name-only --diff-filter=ACMR | grep -E '^(docs/.*\.md|CLAUDE\.md|\.claude/agents/AGENT_.*\.md)$' || true)
if [ -z "$TOUCHED" ]; then
    exit 0
fi

echo "[pre-commit] verificando docs..."

REPO_ROOT="$(git rev-parse --show-toplevel)"
PYTHON="$REPO_ROOT/backend/.venv/bin/python"
if [ ! -x "$PYTHON" ]; then
    PYTHON="$(command -v python3 || command -v python)"
fi
if [ -z "$PYTHON" ]; then
    echo "[pre-commit] WARNING: Python no encontrado. Saltando verify_docs."
    exit 0
fi

"$PYTHON" "$REPO_ROOT/scripts/verify_docs.py" --staged --report-only

echo "[pre-commit] OK (verify_docs no bloqueante)"
EOF

chmod +x "$HOOK"

echo "✓ Pre-commit hook instalado en: $HOOK"
echo ""
echo "Pruébalo:"
echo "  cd $REPO_ROOT"
echo "  echo '# test' >> docs/README.md"
echo "  git add docs/README.md"
echo "  git commit --dry-run -m 'test'"
echo ""
echo "Para desinstalar:"
echo "  rm $HOOK"
echo ""
echo "Para hacer el hook STRICT (bloqueante):"
echo "  edita $HOOK y elimina '--report-only' del comando."
