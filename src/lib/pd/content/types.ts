export type Discipline = "Pitching" | "Hitting" | "Catching" | "Fielding";
export type IqBand = "youth" | "developing" | "advanced";

export type Drill = {
  id: string;
  discipline: Discipline;
  name: string;
  problem: string;
  solves: string;
  why: string;
  setup: string;
  dose: string;
  cues: string[];
  watch: string[];
  levels: number[];
  familySafe: boolean;
};

export type DiagnosticCause = {
  cause: string;
  confirm: string;
  fix: string;
  drills: string[];
  cue: string;
};

export type DiagnosticSymptom = {
  symptom: string;
  causes: DiagnosticCause[];
};

export type Flaw = {
  id: string;
  discipline: Discipline;
  name: string;
  looksLike: string;
  drills: string[];
  cues: string[];
  why: string;
  sport?: "softball" | "baseball";
};

export type BenchmarkKnot = readonly [percentile: number, value: number];

export type BenchmarkMetric = {
  label: string;
  unit: string;
  lower?: boolean;
  source: string;
  bands: Record<string | number, readonly BenchmarkKnot[]>;
};

export type GameIqModule = {
  id: string;
  t: string;
  band: IqBand;
  why: string;
  teach: string;
  check: string;
};

export type AgeCurriculum = {
  band: string;
  title: string;
  objectives: string[];
  avoid: string[];
};
