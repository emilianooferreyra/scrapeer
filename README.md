# scrapeer — One table for any music link

![Status: early development](https://img.shields.io/badge/status-early%20development-orange?style=flat&labelColor=white&color=black)
![License: MIT](https://img.shields.io/badge/license-MIT-black?style=flat&labelColor=white)

**scrapeer** turns a music link into a clean table. Paste an album, a track or a playlist, and you get the same columns every time, with the provenance of every value, ready to export as CSV or JSONL.

It runs on your machine, with your own API keys, and only through each platform's official API. It is not an AI product: it is a tool that AI can use, through a local MCP server.

> [!IMPORTANT]
> scrapeer is in early development. The canonical schema and the network layer are being built; it cannot resolve links yet. The feature list below is the v1.0 plan, not what works today. [`STATUS.md`](STATUS.md) always says where things are.

---

## Features (v1.0 plan)

- One canonical schema for every source: title, artists, duration, ISRCs, plays, release date, artwork, license
- Provenance on every row: source URL, request URL, fetch time and content hashes
- Unknown values stay `null`, never a made-up default
- Resolve links from:
  - MusicBrainz: albums and recordings, no key needed
  - ListenBrainz: playlists, with listen counts
  - YouTube: videos and playlists, with your own API key
- Export to CSV and JSONL, in album or playlist order
- Three surfaces over one core:
  - Local web UI: paste a link, see the table, download it
  - CLI: `scrapeer resolve <url> --format csv`
  - Local MCP server for AI agents
- Polite by design: per-host rate limits with jitter, `robots.txt` checked before the first request, an identifiable User-Agent

### Planned after v1.0

- [TheAudioDB](https://www.theaudiodb.com/), [Discogs](https://www.discogs.com/) (CC0 fields) and the [iTunes](https://performance-partners.apple.com/search-api) Search/Lookup API

---

## What scrapeer will not do

- **No evasion.** No residential proxies, no fake User-Agent, no extracted secrets, no cookies from your browser.
- **Official access only.** A source enters only after its terms are read and allow exporting metadata. Deezer, Spotify, SoundCloud, Tidal, Beatport and others stay out while their terms forbid it ([ADR-024](docs/00-decisiones.md), [ADR-026](docs/00-decisiones.md)).
- **No audio.** It never downloads audio or video.
- **No reselling.** MetaBrainz data (MusicBrainz, ListenBrainz) must not be sold; scrapeer does not sell data or offer to.

---

## Documentation

The design lives in [`docs/`](docs/README.md), written in Spanish. Start with:

- [Scope](docs/01-alcance.md): what v1.0 includes and what it does not
- [Architecture](docs/02-arquitectura.md): the `Provider × Transport` split and the network boundary
- [Schema](docs/03-schema.md): the canonical `Track` and the error taxonomy
- [Providers](docs/05-providers.md): every platform reviewed, with its terms and limits
- [Decisions](docs/00-decisiones.md): the ADR log, the _why_ behind everything
- [Roadmap](docs/10-roadmap.md): six phases to v1.0

## Development

Requires Node 24.15 or later (Node 26 recommended) and pnpm.

```bash
git clone https://github.com/emilianooferreyra/scrapeer
cd scrapeer
pnpm install
pnpm check   # typecheck + lint + format check + tests
```

## Acknowledgements

- [MusicBrainz](https://musicbrainz.org/) and [ListenBrainz](https://listenbrainz.org/), by the MetaBrainz Foundation: the open data this tool starts from
- [Explo](https://github.com/LumePart/Explo): an inspiration for building on ListenBrainz
- [zod](https://zod.dev/): the schema and every validation at the boundaries
- [Vitest](https://vitest.dev/), [Oxlint and Oxfmt](https://oxc.rs/): tests, lint and formatting

## Contributing

Suggestions, bug reports and feature requests are welcome: please open an issue. A new source needs its terms reviewed first; see the checklist in [`docs/05-providers.md`](docs/05-providers.md).

## License

MIT.
