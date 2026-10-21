export interface MasterSeedCount {
  created: number;
  reused: number;
}

export interface MasterSeedResult {
  schoolId: string;
  mediums: MasterSeedCount;
  standards: MasterSeedCount;
  subjects: MasterSeedCount;
  chapters: MasterSeedCount;
  topics: MasterSeedCount;
  durationMs: number;
}
