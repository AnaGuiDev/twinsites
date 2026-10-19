export type Lang = "en" | "es";

export type Mode = "light" | "dark";
export type Density = "airy" | "balanced" | "packed";
export type ColorName =
  | "red"
  | "orange"
  | "amber"
  | "yellow"
  | "lime"
  | "green"
  | "teal"
  | "cyan"
  | "blue"
  | "indigo"
  | "purple"
  | "magenta"
  | "pink"
  | "neutral";

export interface Traits {
  luminance: number;
  saturation: number;
  whitespace: number;
  edge: number;
  blockStd: number;
  centerShare: number;
  hue: number | null;
  mode: Mode;
  density: Density;
  gradient: boolean;
  bento: boolean;
  centered: boolean;
  dominant: string;
  dominantName: ColorName;
  palette: string[];
}

export interface Site {
  id: string;
  slug: string;
  title: string;
  url: string;
  category: string;
  blurb: string;
  x: number;
  y: number;
  cluster: number;
  thumb: string;
  traits: Traits;
}

export interface Cluster {
  id: number;
  labelEn: string;
  labelEs: string;
  x: number;
  y: number;
  r: number;
  color: string;
}

export interface Catalog {
  version: number;
  model: string;
  dtype: string;
  dim: number;
  generated: string;
  count: number;
  source: {
    name: string;
    url: string;
    license: string;
    retrieved: string;
  };
  clusters: Cluster[];
  sites: Site[];
}

export interface Calibration {
  version: 1;
  /** Cosine at percentile i / (knots.length - 1). */
  knots: number[];
  twinPercentile: number;
  twinCosine: number;
}

export interface Dataset {
  catalog: Catalog;
  embeddings: Float32Array;
  dim: number;
  calibration: Calibration;
}

export interface Twin {
  site: Site;
  index: number;
  similarity: number;
}
