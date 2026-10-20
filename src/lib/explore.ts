import { KIN_BANDS, judgeKin, type KinVerdict } from "./calibrate";
import type { ZoneRecord } from "./zones";
import type { Check } from "./history";
import type { Cluster, ColorName, Density, Mode, Site, Traits } from "../types";

export interface ZoneRef {
  id: number;
  slug: string;
  labelEn: string;
  labelEs: string;
}

export interface ExploreSite {
  slug: string;
  title: string;
  url: string;
  cluster: number;
  thumb: string;
  x: number;
  y: number;
  mode: Mode;
  density: Density;
  gradient: boolean;
  bento: boolean;
  centered: boolean;
  dominant: string;
  dominantName: ColorName;
  hue: number | null;
}

export interface ExploreFile {
  zones: ZoneRecord[];
  sites: ExploreSite[];
  neighbors: [number, number][][];
  bands: number[][];
}

export interface ExampleFile {
  slug: string;
  zone: ZoneRecord;
  verdict: KinVerdict;
  subject: ExploreSite;
  twins: { percentile: number; site: ExploreSite }[];
}

export interface ShownTwin {
  site: Site;
  percentile: number;
}

export interface ResultData {
  source: "upload" | "catalog";
  preview: string;
  subjectTitle: string;
  subjectUrl?: string;
  traits: Traits;
  twins: ShownTwin[];
  verdict: KinVerdict;
  zone: ZoneRef;
  spot: { x: number; y: number; cluster: number };
  sites: Site[];
  clusters: Cluster[];
  portrait: boolean;
  cropped: boolean;
  catalogCount: number;
  /** Sites clearing each kin band (uploads only), for before/after comparison. */
  bands?: Record<number, number>;
  /** The check before this one in this browser, if any (uploads only). */
  previous?: Check | null;
}

const base = () => import.meta.env.BASE_URL;

let explorePending: Promise<ExploreFile> | null = null;
let examplePending: Promise<ExampleFile> | null = null;

export function loadExplore(): Promise<ExploreFile> {
  if (!explorePending) {
    explorePending = fetch(`${base()}data/explore.json`)
      .then((response) => {
        if (!response.ok) throw new Error("catalog-missing");
        return response.json() as Promise<ExploreFile>;
      })
      .catch((error) => {
        explorePending = null;
        throw error;
      });
  }
  return explorePending;
}

export function loadExample(): Promise<ExampleFile> {
  if (!examplePending) {
    examplePending = fetch(`${base()}data/example.json`)
      .then((response) => {
        if (!response.ok) throw new Error("catalog-missing");
        return response.json() as Promise<ExampleFile>;
      })
      .catch((error) => {
        examplePending = null;
        throw error;
      });
  }
  return examplePending;
}

export function searchSites(file: ExploreFile, query: string, limit = 8): ExploreSite[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];
  const hits: { score: number; site: ExploreSite }[] = [];
  for (const site of file.sites) {
    const title = site.title.toLowerCase();
    const url = site.url.toLowerCase();
    const slug = site.slug.toLowerCase();
    let score = 0;
    if (title.startsWith(needle)) score = 80;
    else if (title.includes(needle)) score = 60;
    else if (url.includes(needle) || slug.includes(needle)) score = 40;
    if (score) hits.push({ score, site });
  }
  hits.sort((a, b) => b.score - a.score || a.site.title.localeCompare(b.site.title));
  return hits.slice(0, limit).map((hit) => hit.site);
}

export function toSite(site: ExploreSite): Site {
  return {
    id: site.slug,
    slug: site.slug,
    title: site.title,
    url: site.url,
    category: "other",
    blurb: "",
    x: site.x,
    y: site.y,
    cluster: site.cluster,
    thumb: site.thumb,
    traits: toTraits(site),
  };
}

export function toTraits(site: ExploreSite): Traits {
  return {
    luminance: 0,
    saturation: 0,
    whitespace: 0,
    edge: 0,
    blockStd: 0,
    centerShare: 0,
    hue: site.hue,
    mode: site.mode,
    density: site.density,
    gradient: site.gradient,
    bento: site.bento,
    centered: site.centered,
    dominant: site.dominant,
    dominantName: site.dominantName,
    palette: [site.dominant],
  };
}

export function exampleResult(file: ExampleFile): ResultData {
  const subject = toSite(file.subject);
  return {
    source: "catalog",
    preview: `${base()}data/${file.subject.thumb}`,
    subjectTitle: file.subject.title,
    subjectUrl: file.subject.url,
    traits: subject.traits,
    twins: file.twins.map((twin) => ({ site: toSite(twin.site), percentile: twin.percentile })),
    verdict: file.verdict,
    zone: file.zone,
    spot: { x: file.subject.x, y: file.subject.y, cluster: file.subject.cluster },
    sites: [],
    clusters: [file.zone],
    portrait: false,
    cropped: false,
    catalogCount: 2003,
  };
}

export async function siteResult(slug: string): Promise<ResultData> {
  const example = await loadExample();
  if (example.slug === slug) return exampleResult(example);
  const file = await loadExplore();
  const index = file.sites.findIndex((site) => site.slug === slug);
  if (index < 0) throw new Error("missing-site");
  const subject = file.sites[index];
  const zone = file.zones.find((item) => item.id === subject.cluster);
  if (!zone) throw new Error("catalog-missing");
  const counts = new Map(KIN_BANDS.map((band, bandIndex) => [band, file.bands[index][bandIndex] ?? 0]));
  return {
    source: "catalog",
    preview: `${base()}data/${subject.thumb}`,
    subjectTitle: subject.title,
    subjectUrl: subject.url,
    traits: toTraits(subject),
    twins: file.neighbors[index].map(([twinIndex, tenths]) => ({
      site: toSite(file.sites[twinIndex]),
      percentile: tenths / 10,
    })),
    verdict: judgeKin(counts),
    zone,
    spot: { x: subject.x, y: subject.y, cluster: subject.cluster },
    sites: file.sites.map(toSite),
    clusters: file.zones,
    portrait: false,
    cropped: false,
    catalogCount: file.sites.length,
  };
}

/** The map wants every dot. The example payload deliberately skips that file. */
export async function mapFor(result: ResultData): Promise<Pick<ResultData, "sites" | "clusters" | "catalogCount">> {
  if (result.sites.length > 100) return result;
  const file = await loadExplore();
  return { sites: file.sites.map(toSite), clusters: file.zones, catalogCount: file.sites.length };
}
