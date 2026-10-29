import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, JobStatus, Night, ReadNight, RunLine } from './types.js';

const NIGHT_ID = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES: readonly JobStatus[] = ['ok', 'retry', 'fail'];

function isStatus(value: unknown): value is JobStatus {
  return typeof value === 'string' && (STATUSES as readonly string[]).includes(value);
}

/** Parses one log line at the edge. Returns null when the line is not a valid run line. */
export function parseLine(line: string): RunLine | null {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.at !== 'string' || typeof obj.job !== 'string' || !isStatus(obj.status)) return null;
  const owner = typeof obj.owner === 'string' ? obj.owner : null;
  const parsed: RunLine = { at: obj.at, job: obj.job, status: obj.status, owner };
  if (typeof obj.error === 'string') parsed.error = obj.error;
  return parsed;
}

function readFileOrNull(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!NIGHT_ID.test(night)) return null;
  const text = readFileOrNull(join(runsDir, `${night}.jsonl`));
  if (text === null) return null;

  const byJob = new Map<string, DigestRow>();
  let badLines = 0;

  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    const run = parseLine(line);
    if (run === null) {
      badLines += 1;
      continue;
    }
    const lastError = run.error ?? null;
    const row = byJob.get(run.job);
    if (row === undefined) {
      byJob.set(run.job, {
        job: run.job,
        owner: run.owner,
        runs: 1,
        retries: run.status === 'retry' ? 1 : 0,
        lastStatus: run.status,
        lastError,
        firstAt: run.at,
        lastAt: run.at,
      });
      continue;
    }
    row.runs += 1;
    if (run.status === 'retry') row.retries += 1;
    row.lastStatus = run.status;
    row.lastError = lastError;
    row.lastAt = run.at;
    if (row.owner === null) row.owner = run.owner;
  }

  const rows = [...byJob.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  const result: Night = { night, rows, badLines };
  return result;
};
