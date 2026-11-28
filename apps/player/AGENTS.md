# AGENTS.md

`apps/player` is the scrapeer dashboard: a Next.js app that started from leerob/next-music-player (see NOTICE.md).

- Run it from the repo root with `pnpm dev`.
- Data comes from `@scrapeer/core` (`packages/core`): paste a MusicBrainz link, `/resolve` resolves it and `lib/library.ts` keeps it in memory for the server session.
- No database, Docker or Vercel Blob. No audio source yet.
- Styling is still Tailwind and shadcn/ui; it moves to SCSS modules with unstyled Radix (see odd/tasks/player-data.md, P4).
