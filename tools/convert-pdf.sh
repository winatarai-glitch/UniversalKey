#!/bin/bash
# ============================================================
#  PDF to Markdown Converter — safe wrapper around pdfmd
#
#  Enforces explicit -o/--output flag and refuses writes inside your
#  configured read-only source archive (SOURCE_PATH env var). pdfmd's
#  default is to write "<input>.md" NEXT TO the input PDF, which violates
#  the "source is read-only" invariant when ingesting from external corpora.
#
#  Usage: ./convert-pdf.sh <input.pdf> -o <output.md> [pdfmd options...]
#         ./convert-pdf.sh <folder-of-pdfs> -o <output-folder> [options...]
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Locate pdfmd binary. Override via PDFMD_BIN env, else prefer local
# tools/pdfmd/.venv, else fall back to system pdfmd on PATH.
if [ -n "${PDFMD_BIN:-}" ] && [ -x "$PDFMD_BIN" ]; then
    PDFMD_CMD="$PDFMD_BIN"
elif [ -x "$SCRIPT_DIR/pdfmd/.venv/Scripts/pdfmd.exe" ]; then
    PDFMD_CMD="$SCRIPT_DIR/pdfmd/.venv/Scripts/pdfmd.exe"
elif [ -x "$SCRIPT_DIR/pdfmd/.venv/bin/pdfmd" ]; then
    PDFMD_CMD="$SCRIPT_DIR/pdfmd/.venv/bin/pdfmd"
elif command -v pdfmd >/dev/null 2>&1; then
    PDFMD_CMD="$(command -v pdfmd)"
else
    echo "ERROR: pdfmd not found. Install via: cd tools/pdfmd && pip install -e ." >&2
    echo "Or set PDFMD_BIN env to point at the binary." >&2
    exit 4
fi
export PYTHONIOENCODING=utf-8

# Tesseract OCR discovery — needs tesseract on PATH (or TESSERACT_BIN override).
if [ -n "${TESSERACT_BIN:-}" ] && [ -x "$TESSERACT_BIN" ]; then
    TESSERACT_DIR="$(dirname "$TESSERACT_BIN")"
    [[ ":$PATH:" != *":$TESSERACT_DIR:"* ]] && export PATH="$TESSERACT_DIR:$PATH"
fi

if [ $# -lt 1 ]; then
    cat << 'EOF'
Usage: convert-pdf.sh <input.pdf> -o <output.md> [options]
       convert-pdf.sh <folder> -o <output-folder> [options]

MANDATORY: -o / --output must be provided (no fallback to input-adjacent .md).
REFUSED:   output paths inside SOURCE_PATH (your configured source archive).

pdfmd options (forwarded):
  --ocr {off,auto,tesseract,ocrmypdf}   OCR mode (default off)
  --lang LANG                            Tesseract lang codes (e.g. nor+eng)
  --export-images                        Dump images to _assets/
  --page-breaks                          '---' between pages
  --stats                                Print word/heading/table counts
  -v / -vv                               Verbose

Examples:
  ./convert-pdf.sh "<SOURCE_PATH>/folder/example.pdf" \
      -o "/tmp/example.md" --stats --ocr auto --lang eng

  ./convert-pdf.sh "<SOURCE_PATH>/folder/" \
      -o "_raw/converted/" --page-breaks
EOF
    exit 1
fi

# Enforce -o flag somewhere in args
has_output=0
output_path=""
prev=""
for arg in "$@"; do
    if [ "$prev" = "-o" ] || [ "$prev" = "--output" ]; then
        output_path="$arg"
        has_output=1
    fi
    prev="$arg"
done

if [ $has_output -eq 0 ]; then
    echo "ERROR: -o / --output is required. pdfmd's 'next-to-input' default would write into your source — BLOCKED." >&2
    echo "Re-run with: ... -o <explicit-output-path>" >&2
    exit 2
fi

# Reject output INSIDE SOURCE_PATH (if configured)
if [ -n "${SOURCE_PATH:-}" ]; then
    lower_output="${output_path,,}"
    lower_source="${SOURCE_PATH,,}"
    # Normalize backslashes to forward slashes for prefix comparison
    lower_output_norm="${lower_output//\\//}"
    lower_source_norm="${lower_source//\\//}"
    if [[ "$lower_output_norm" == "$lower_source_norm"* ]]; then
        echo "ERROR: output path inside SOURCE_PATH is forbidden (source archive is read-only): $output_path" >&2
        exit 3
    fi
fi

# Per-file timeout — pdfmd occasionally hangs on scanned/corrupt PDFs.
# 120s is generous for normal docs; scanned books can retry with --ocr auto.
exec timeout --kill-after=10 120 "$PDFMD_CMD" "$@"
