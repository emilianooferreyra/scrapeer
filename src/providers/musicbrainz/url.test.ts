import { describe, expect, it } from "vitest";
import { matchMusicBrainzUrl, parseMusicBrainzUrl } from "./url";

const MBID = "200f0a5a-41c4-49f3-b997-1ef5f975f060";

describe("parseMusicBrainzUrl", () => {
  it.each([
    [`https://musicbrainz.org/release/${MBID}`, "release"],
    [`https://musicbrainz.org/recording/${MBID}`, "recording"],
    [`https://musicbrainz.org/release/${MBID}/`, "release"],
    [`https://musicbrainz.org/release/${MBID}?tab=details#top`, "release"],
    [`http://musicbrainz.org/release/${MBID}`, "release"],
    [`https://MusicBrainz.org/release/${MBID.toUpperCase()}`, "release"],
    [`https://www.musicbrainz.org/release/${MBID}`, "release"],
    [`https://musicbrainz.org/Release/${MBID}`, "release"],
    [`https://musicbrainz.org/RECORDING/${MBID}`, "recording"],
  ])("reads %s as a %s", (url, entity) => {
    expect(parseMusicBrainzUrl(new URL(url))).toStrictEqual({ entity, mbid: MBID });
  });

  it.each([
    `https://musicbrainz.org/artist/${MBID}`,
    `https://musicbrainz.org/release-group/${MBID}`,
    `https://musicbrainz.org/release/${MBID}/cover-art`,
    "https://musicbrainz.org/release/not-a-uuid",
    "https://musicbrainz.org/release/",
    "https://musicbrainz.org/",
  ])("rejects the unsupported path %s", (url) => {
    expect(parseMusicBrainzUrl(new URL(url))).toBeNull();
  });

  it.each([
    `https://beta.musicbrainz.org/release/${MBID}`,
    `https://www.www.musicbrainz.org/release/${MBID}`,
    `https://musicbrainz.org.example.com/release/${MBID}`,
    `https://listenbrainz.org/release/${MBID}`,
    `https://musicbrainz.org:8443/release/${MBID}`,
    `https://user:pass@musicbrainz.org/release/${MBID}`,
    `ftp://musicbrainz.org/release/${MBID}`,
  ])("rejects a URL from another origin: %s", (url) => {
    expect(parseMusicBrainzUrl(new URL(url))).toBeNull();
  });
});

describe("matchMusicBrainzUrl", () => {
  it("is true only for URLs parseMusicBrainzUrl accepts", () => {
    expect(matchMusicBrainzUrl(new URL(`https://musicbrainz.org/recording/${MBID}`))).toBe(true);
    expect(matchMusicBrainzUrl(new URL(`https://musicbrainz.org/artist/${MBID}`))).toBe(false);
  });
});
