import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28');

  it('gives 5 jobs sorted by name and 1 bad line', () => {
    expect(night).not.toBeNull();
    expect(night?.night).toBe('2026-10-28');
    expect(night?.badLines).toBe(1);
    expect(night?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('counts runs and retries, keeps the last status', () => {
    const row = night?.rows.find((r) => r.job === 'fixtures/refresh');
    expect(row).toMatchObject({ owner: 'rook', runs: 4, retries: 3, lastStatus: 'ok', lastError: null });
    expect(row?.firstAt).toBe('2026-10-29T01:30:00+01:00');
    expect(row?.lastAt).toBe('2026-10-29T01:37:00+01:00');
  });

  it('keeps the last error of a failed job', () => {
    const row = night?.rows.find((r) => r.job === 'notes/backup');
    expect(row).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded', runs: 1, retries: 0 });
  });

  it('keeps a row with a null owner', () => {
    const row = night?.rows.find((r) => r.job === 'digest/render');
    expect(row).toMatchObject({ owner: null, runs: 1, lastStatus: 'ok' });
  });

  it('keeps the offset from the log', () => {
    const row = night?.rows.find((r) => r.job === 'rig/rotate-logs');
    expect(row?.firstAt).toBe('2026-10-28T23:00:02+01:00');
  });
});

describe('readNight on a temp runs dir', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns null for a night with no file', () => {
    expect(readNight(dir, '2026-01-01')).toBeNull();
  });

  it('returns null for a night id that is not a date', () => {
    writeFileSync(join(dir, 'x.jsonl'), '');
    expect(readNight(dir, 'x')).toBeNull();
    expect(readNight(dir, '../runs/2026-10-28')).toBeNull();
  });

  it('gives no rows and no bad lines for an empty file', () => {
    writeFileSync(join(dir, '2026-01-02.jsonl'), '');
    expect(readNight(dir, '2026-01-02')).toEqual({ night: '2026-01-02', rows: [], badLines: 0 });
  });

  it('counts bad lines and skips them', () => {
    const lines = [
      '{"at":"2026-01-03T01:00:00+01:00","job":"a","status":"ok","owner":"rook"}',
      'not json',
      '{"at":"2026-01-03T02:00:00+01:00","job":"a","status":"maybe","owner":"rook"}',
      '{"job":"a","status":"ok"}',
      '',
      '{"at":"2026-01-03T03:00:00+01:00","job":"a","status":"fail","error":"boom"}',
    ];
    writeFileSync(join(dir, '2026-01-03.jsonl'), lines.join('\n') + '\n');
    const night = readNight(dir, '2026-01-03');
    expect(night?.badLines).toBe(3);
    expect(night?.rows).toEqual([
      {
        job: 'a',
        owner: 'rook',
        runs: 2,
        retries: 0,
        lastStatus: 'fail',
        lastError: 'boom',
        firstAt: '2026-01-03T01:00:00+01:00',
        lastAt: '2026-01-03T03:00:00+01:00',
      },
    ]);
  });
});
