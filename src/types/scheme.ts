export interface SchemeInfo {
  name: string;
  objective: string;
  benefits: string;
  eligibility: string;
  how_to_apply: string;
}

export type SchemeDict = Record<string, SchemeInfo>;