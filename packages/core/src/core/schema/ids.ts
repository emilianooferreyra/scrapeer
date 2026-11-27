import { z } from "zod";

export const ProviderId = z.string().min(1).brand<"ProviderId">();
export type ProviderId = z.infer<typeof ProviderId>;

export const TrackId = z.string().min(1).brand<"TrackId">();
export type TrackId = z.infer<typeof TrackId>;

export const CollectionId = z.string().min(1).brand<"CollectionId">();
export type CollectionId = z.infer<typeof CollectionId>;

export const RunId = z.string().min(1).brand<"RunId">();
export type RunId = z.infer<typeof RunId>;
