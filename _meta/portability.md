---
title: Portability Notes
type: meta
tags: [meta, portability]
created: 2026-04-25
---

# Portability Notes

UniversalKey is designed to be portable across machines and operating systems.
All machine-specific values live in `.env` (not committed) so the same git repo
runs unchanged on Windows, macOS, and Linux.

## Clone to Another Drive

```bash
git clone <GIT_REMOTE_URL> UniversalKey
cd UniversalKey
bash setup.sh
```

`setup.sh` will prompt for `VAULT_PATH` and `ACTIVE_PACK`, write them to `.env`,
and scaffold the vault tree at the chosen path.

## Binary Files (Not in Git)

The git repo tracks markdown + config + tooling only. Binary files (PDFs, DOCX,
images, audio, video) live in your vault directory (`VAULT_PATH`) and are
sourced/copied separately. They are excluded via `.gitignore` to keep the repo
fast and the schema portable.

## Symlinks (Will NOT Survive Copy)

Symlinks created by tooling (e.g. an optional wiki-skills bundle) are
machine-specific and need to be recreated after cloning. The `setup.sh` script
handles this for tools that ship with UK; external bundles have their own
re-link procedure.

## Machine-Specific Paths

Never hardcode absolute paths. Always reference env vars defined in `.env`:

| Variable | Used by | Example |
|----------|---------|---------|
| `VAULT_PATH` | All tools | `~/Documents/UniversalKey-Vault` (Mac/Linux), `<DRIVE>:\<vault>` (Win) |
| `ACTIVE_PACK` | Schema selectors | `chiropractic` (default), or any pack in `_meta/domain-packs/` |
| `INGEST_LOCK_PATH` | Sync engines | `${VAULT_PATH}/_meta/.ingest-lock` (default) |
| `PANDOC_BIN` / `TESSERACT_BIN` / `SOFFICE_BIN` / `PYTHON_BIN` | Optional tool overrides | full path to binary if not on PATH |

## Nested Tool Repos

| Directory | Source | Action After Clone |
|-----------|--------|---------------------|
| `tools/pdfmd/` | Python package, distributed with UK | `pip install -e tools/pdfmd` (or set `PYTHON_BIN` to point at a venv that has it installed) |
| `tools/<wiki-bundle>/` (optional) | External skill bundle, not bundled | Clone separately if wiki workflow desired |

## Full Restore Checklist

1. `git clone <GIT_REMOTE_URL>` and `cd` into the repo
2. `bash setup.sh` — answers prompts, writes `.env`, runs scaffold
3. (Optional) `cd tools/pdfmd && pip install -e .` for PDF→Markdown conversion
4. Open in Obsidian → 'Open folder as vault' → `$VAULT_PATH`
5. Verify Templater plugin enabled (community plugin allowlist)

## Cross-Platform Path Notes

- **Windows**: paths may use backslash (`<DRIVE>:\<vault>`) or forward slash.
  Node.js `path.join` normalizes both. Bash on Git Bash / WSL accepts forward
  slash.
- **macOS / Linux**: forward slash always; `~` expands to `$HOME` only in shell,
  not inside config files.
- **exFAT filesystems**: no executable bit; tools invoke scripts via `node` /
  `bash` explicitly rather than relying on shebang permissions. Git on exFAT
  refuses repo operations until you add a `safe.directory` exception:
  `git config --global --add safe.directory <path-to-repo>`.
- **Long paths on Windows**: enable `git config --global core.longpaths true`
  before first clone if the vault has deeply-nested folders.
