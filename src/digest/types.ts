// Contract for the morning digest (plan.md § 1). Types only.

export type JobStatus = 'ok' | 'retry' | 'fail';

/** One parsed line of `runs/<night>.jsonl`. */
export type RunLine = {
  /** ISO 8601 time as written in the log, offset kept (e.g. "2026-10-28T23:00:02+01:00"). */
  at: string;
  job: string;
  status: JobStatus;
  owner: string | null;
  error?: string;
};

/** One row per job for a night. */
export type DigestRow = {
  job: string;
  /** null when the log has no owner; views render it as "—". */
  owner: string | null;
  /** Number of lines for this job. */
  runs: number;
  /** Number of lines with status "retry". */
  retries: number;
  lastStatus: JobStatus;
  /** Error of the last line, or null if it had none. */
  lastError: string | null;
  /** `at` of the first and last line, offset kept from the log (never converted to UTC). */
  firstAt: string;
  lastAt: string;
};

export type Night = {
  /** Night id, the file name without extension (e.g. "2026-10-28"). */
  night: string;
  rows: DigestRow[];
  /** Lines that did not parse; counted, never thrown. */
  badLines: number;
};

/**
 * Reads `<runsDir>/<night>.jsonl`. Returns null when there is no file for that night.
 * Implementation lands in issue #2 as `readNight` in `src/digest/read.ts`.
 */
export type ReadNight = (runsDir: string, night: string) => Night | null;
