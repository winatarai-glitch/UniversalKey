# UniversalKey

Anonymized, domain-agnostic schema skeleton for Obsidian knowledge graphs.

UK ships ZERO content — only the type system + extraction tooling. Hydrate it
with your own corpus.

## Quick start

```bash
git clone <this-repo-url> UniversalKey
cd UniversalKey
bash setup.sh
```

`setup.sh` will prompt for `VAULT_PATH` and `ACTIVE_PACK`, write them to `.env`,
and scaffold the vault tree at the chosen path.

## Documentation

- [`CLAUDE.md`](CLAUDE.md) — agent context, conventions, file layout
- [`_meta/portability.md`](_meta/portability.md) — cross-machine setup, env vars
- [`_meta/taxonomy.md`](_meta/taxonomy.md) — tag vocabulary (core + active pack)
- [`_meta/mega-mind-manifest.md`](_meta/mega-mind-manifest.md) — canonical ingest pattern
- [`tools/README.md`](tools/README.md) — script inventory

## Status

This is a **skeleton release** — schema + tooling only, no content. A full
positioning README will land in a future release (see
[`_meta/draft-readme.md`](_meta/draft-readme.md) for the planned narrative).

## License

MIT — see [`LICENSE`](LICENSE).
