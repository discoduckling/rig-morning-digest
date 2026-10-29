import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

type Api = { night: string; rows: { job: string }[]; badLines: number };

const line = (at: string, job: string, status: string, extra: object = {}) =>
  JSON.stringify({ at, job, status, owner: 'rook', ...extra });

let dir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  const t = (m: string) => `2026-10-28T23:${m}:00+01:00`;
  writeFileSync(
    join(dir, '2026-10-28.jsonl'),
    [
      line(t('05'), 'zeta/ok', 'ok'),
      line(t('01'), 'alpha/flaky', 'retry'),
      line(t('02'), 'alpha/flaky', 'retry'),
      line(t('03'), 'alpha/flaky', 'retry'),
      line(t('04'), 'alpha/flaky', 'ok'),
      line(t('06'), 'mid/broken', 'fail', { error: 'boom' }),
    ].join('\n') + '\n',
  );
  writeFileSync(join(dir, '2026-10-27.jsonl'), '');
  writeFileSync(
    join(dir, '2026-10-26.jsonl'),
    [line('2026-10-26T23:00:00+01:00', 'lane/sync', 'ok'), 'not json {'].join('\n') + '\n',
  );
  app = createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir: dir,
  });
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('GET /digest/:night', () => {
  it('200 for a night with lines, jobs sorted', async () => {
    const res = await app.request('/digest/2026-10-28');
    expect(res.status).toBe(200);
    const html = await res.text();
    const order = ['alpha/flaky', 'mid/broken', 'zeta/ok'].map((j) => html.indexOf(j));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('404 for a night with no file', async () => {
    const res = await app.request('/digest/2026-01-01');
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('no run log for 2026-01-01');
  });

  it('says nothing ran for the empty night', async () => {
    const res = await app.request('/digest/2026-10-27');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('stays 200 and notes a bad line', async () => {
    const res = await app.request('/digest/2026-10-26');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('lane/sync');
    expect(html).toContain('1 line could not be read');
  });

  it('marks fail and 3+ retries rows, not clean ones', async () => {
    const html = await (await app.request('/digest/2026-10-28')).text();
    const rowOf = (job: string) => html.split('<tr').find((r) => r.includes(`<td>${job}</td>`)) ?? '';
    expect(rowOf('mid/broken')).toContain('warn');
    expect(rowOf('mid/broken')).toContain('! fail');
    expect(rowOf('alpha/flaky')).toContain('warn'); // 3 retries, last status ok
    expect(rowOf('zeta/ok')).not.toContain('warn');
  });
});

describe('GET /api/digest/:night', () => {
  it('200 with rows for a night with lines', async () => {
    const res = await app.request('/api/digest/2026-10-28');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Api;
    expect(body.night).toBe('2026-10-28');
    expect(body.badLines).toBe(0);
    expect(body.rows.map((r) => r.job)).toEqual(['alpha/flaky', 'mid/broken', 'zeta/ok']);
  });

  it('404 for a night with no file', async () => {
    const res = await app.request('/api/digest/2026-01-01');
    expect(res.status).toBe(404);
  });

  it('gives rows [] for the empty night', async () => {
    const res = await app.request('/api/digest/2026-10-27');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ night: '2026-10-27', rows: [], badLines: 0 });
  });

  it('counts a bad line', async () => {
    const res = await app.request('/api/digest/2026-10-26');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Api;
    expect(body.badLines).toBe(1);
    expect(body.rows).toHaveLength(1);
  });
});

describe('page and json agree', () => {
  it('list the same jobs in the same order', async () => {
    const api = (await (await app.request('/api/digest/2026-10-28')).json()) as Api;
    const html = await (await app.request('/digest/2026-10-28')).text();
    const pageJobs = [...html.matchAll(/<tr[^>]*><td>([^<]*)<\/td>/g)].map((m) => m[1]);
    expect(pageJobs).toEqual(api.rows.map((r) => r.job));
  });
});
