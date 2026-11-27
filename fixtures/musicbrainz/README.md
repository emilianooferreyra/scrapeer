# MusicBrainz fixtures

Raw responses from the MusicBrainz API (`/ws/2`), recorded on 2026-11-27 through scrapeer's own HTTP transport
(User-Agent `scrapeer/0.0.0 ( https://github.com/emilianooferreyra/scrapeer )`, 1 request/s). Bytes are kept as
received, so the formatter skips this folder. The data is MusicBrainz core metadata (CC0); none of it holds credentials
or personal data.

| File                           | Request                                                                                  | What it covers                                                  |
| ------------------------------ | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `release-in-rainbows.json`     | `/ws/2/release/200f0a5a-41c4-49f3-b997-1ef5f975f060?inc=recordings+artist-credits+isrcs` | Album with 10 ordered tracks, full date, one ISRC per recording |
| `release-partial-date.json`    | `/ws/2/release/40359441-199d-48c1-9b4f-f89ddd579c41?inc=recordings+artist-credits+isrcs` | Release dated `1994` (partial), recordings without ISRC         |
| `recording-several-isrcs.json` | `/ws/2/recording/26244520-0e1d-4d42-b101-ce6b83299d33?inc=artist-credits+isrcs`          | Single recording with five ISRCs                                |

All requests also carry `fmt=json`.
