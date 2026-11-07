import { createServer, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { acquireOwner, atomicJSON } from './storage.ts';
import { discover, execute, type DiscoveryJob, type Run } from './runtime.ts';
const token = process.env.PI_SERVICE_TOKEN;
if (!token || token.length < 32) throw new Error('PI_SERVICE_TOKEN must be at least 32 characters');
const data = resolve(process.env.PI_DATA_DIR || './data');
await mkdir(data, { recursive: true, mode: 0o700 });
const owner = await acquireOwner(data);
const active = new Map<string, { abort?: () => Promise<void> }>();
const locks = new Map<string, Promise<unknown>>();
async function locked<T>(key: string, work: () => Promise<T>): Promise<T> {
  const next = (locks.get(key) || Promise.resolve()).catch(() => {}).then(work);
  locks.set(key, next);
  try { return await next; } finally { if (locks.get(key) === next) locks.delete(key); }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function read(path: string): Promise<any | null> { try { return JSON.parse(await readFile(path, 'utf8')); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e; } }
function respond(res: ServerResponse, status: number, body: unknown) { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); }
function authorized(header: string | undefined) { const a = Buffer.from(header || ''); const b = Buffer.from(`Bearer ${token}`); return a.length === b.length && timingSafeEqual(a, b); }
function startDiscovery(directory: string, job: DiscoveryJob) {
  if (active.has(directory) || active.size >= 4) return;
  const controls: { abort?: () => Promise<void> } = {}; active.set(directory, controls);
  void (async () => {
    let state: object;
    try { state = { status: 'succeeded', result: await discover(directory, job, controls) }; }
    catch (err) { state = { status: 'failed', error: err instanceof Error ? err.message : 'Discovery stopped.' }; }
    await locked(directory, async () => {
      if ((await read(join(directory, 'state.json')))?.status !== 'canceled') await atomicJSON(join(directory, 'state.json'), state);
    });
  })().catch(() => { console.error('Pi could not persist discovery state'); }).finally(() => active.delete(directory));
}
function start(directory: string, run: Run) {
  if (active.has(directory) || active.size >= 2) return;
  const controls: { abort?: () => Promise<void> } = {}; active.set(directory, controls);
  void (async () => {
    let state: object;
    try { state = { status: 'succeeded', result: await execute(directory, run, controls) }; }
    catch { state = { status: 'failed', error: 'Draft generation stopped. Check model configuration or retry with a new run.' }; }
    await locked(directory, async () => {
      if ((await read(join(directory, 'state.json')))?.status !== 'canceled') await atomicJSON(join(directory, 'state.json'), state);
    });
  })().catch(() => { console.error('Pi could not persist run state'); }).finally(() => active.delete(directory));
}
const server = createServer(async (req, res) => {
  if (req.url === '/healthz') { respond(res, 200, { status: 'ok' }); return; }
  if (!authorized(req.headers.authorization)) { respond(res, 401, { error: 'unauthorized' }); return; }
  const url = new URL(req.url || '/', 'http://local');
  const parts = url.pathname.split('/');
  if (parts.length === 4 && parts[1] === 'discovery' && uuid.test(parts[2]) && uuid.test(parts[3]) && req.method === 'PUT') {
    let raw = ''; for await (const chunk of req) { raw += chunk.toString(); if (raw.length > 8192) { respond(res, 413, { error: 'too_large' }); return; } }
    const body = JSON.parse(raw) as DiscoveryJob;
    if (body.org_id !== parts[2] || body.run_id !== parts[3] || typeof body.prompt !== 'string' || !body.prompt.trim() || !Number.isFinite(Date.parse(body.deadline))) { respond(res, 400, { error: 'invalid_run' }); return; }
    const directory = join(data, 'discovery', parts[2], parts[3]);
    await locked(directory, async () => {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const state = await read(join(directory, 'state.json'));
      if (!state) await atomicJSON(join(directory, 'state.json'), { status: 'running' });
      if (!state || state.status === 'running') startDiscovery(directory, body);
      respond(res, 202, state || { status: 'running' });
    });
    return;
  }
  if (parts.length !== 4 || parts[1] !== 'runs' || !uuid.test(parts[2]) || !uuid.test(parts[3])) { respond(res, 404, { error: 'not_found' }); return; }
  const directory = join(data, parts[2], parts[3]);
  try {
    if (req.method === 'PUT') {
      let raw = ''; for await (const chunk of req) { raw += chunk.toString(); if (raw.length > 8192) { respond(res, 413, { error: 'too_large' }); return; } }
      const run = JSON.parse(raw) as Run;
      if (run.org_id !== parts[2] || run.run_id !== parts[3] || typeof run.token !== 'string' || run.token.length !== 64 || !Number.isFinite(Date.parse(run.deadline))) { respond(res, 400, { error: 'invalid_run' }); return; }
      await locked(directory, async () => {
        await mkdir(directory, { recursive: true, mode: 0o700 });
        const existing = await read(join(directory, 'request.json'));
        if (existing && JSON.stringify(existing) !== JSON.stringify(run)) { respond(res, 409, { error: 'request_mismatch' }); return; }
        if (!existing) await atomicJSON(join(directory, 'request.json'), run);
        const state = await read(join(directory, 'state.json'));
        if (!state) await atomicJSON(join(directory, 'state.json'), { status: 'running' });
        if (!state || state.status === 'running') start(directory, run);
        respond(res, 202, state || { status: 'running' });
      });
    } else if (req.method === 'GET') {
      await locked(directory, async () => {
        const run = await read(join(directory, 'request.json'));
        const state = await read(join(directory, 'state.json'));
        if (!run) { respond(res, 404, { error: 'not_found' }); return; }
        if (!state || state.status === 'running') start(directory, run);
        respond(res, 200, state || { status: 'running' });
      });
    } else if (req.method === 'DELETE') {
      await locked(directory, async () => {
        if (!await read(join(directory, 'request.json'))) { respond(res, 404, { error: 'not_found' }); return; }
        await atomicJSON(join(directory, 'state.json'), { status: 'canceled' });
        respond(res, 200, { status: 'canceled' });
      });
      await active.get(directory)?.abort?.();
    } else respond(res, 405, { error: 'method_not_allowed' });
  } catch { if (!res.headersSent) respond(res, 500, { error: 'run_unavailable' }); }
});
server.listen(Number(process.env.PORT || 8090), '0.0.0.0');
// Exit with running checkpoints intact; reopening resumes them. Explicit DELETE cancels.
process.on('SIGTERM', () => { server.close(); void owner.close().finally(() => process.exit(0)); });
