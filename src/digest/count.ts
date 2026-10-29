import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseLine } from './read.js';
import type { JobStatus } from './types.js';

export type NightCounts = Record<JobStatus, number>;

/** Line counts by status over the night's parsable lines. Null when there is no file. */
export function countNight(runsDir: string, night: string): NightCounts | null {
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
  const counts: NightCounts = { ok: 0, retry: 0, fail: 0 };
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    const run = parseLine(line);
    if (run !== null) counts[run.status] += 1;
  }
  return counts;
}
