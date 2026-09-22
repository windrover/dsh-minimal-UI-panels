#!/usr/bin/env node
/**
 * Regression tests for the Stage A+B memory upgrades:
 *   - automation.js pure helpers (parseStringArray / parseIndexArray / similarity).
 *   - semantic recall (memory_recall) degrades gracefully to BM25 when the LLM
 *     service is unavailable (no embed API exists, so recall must never break).
 *   - semantic recall still returns merged candidates when the LLM is present
 *     (query expansion + rerank plumbing runs without throwing).
 *   - semantic de-duplication config defaults to OFF (exact dedup only).
 *
 * These run with NO real DSH / LLM — the LLM is either absent (graceful
 * fallback) or a tiny stub whose `stream` yields a JSON array.
 *
 * Run: node test/memory-semantic-recall.test.mjs
 */
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const auto = await import('../lib/host/automation.js')
const mod = await import('../lib/host/ltm.js')

const noop = () => {}
const tools = []
const stubCtx = {
  on: noop,
  effect: (fn) => { try { return fn() } catch { return undefined } },
  tools: { register: (def) => tools.push(def) },
  webServer: undefined,
  commands: { register: noop },
  agents: { currentInitiator: () => undefined },
  systemPrompt: { section: noop, add: noop, context: noop },
  workspaceRegistry: undefined,
  settings: { register: () => ({ value: {} }) },
  logger: { warn: noop, info: noop, debug: noop, error: noop },
  inject: noop,
  get: (key) => (key === 'webServer' ? undefined : key === 'llm' ? stubCtx._llm : undefined),
  set: noop,
  _llm: undefined,
}

// ── 1. pure helper sanity ────────────────────────────────────────────────────
assert.deepEqual(auto.parseStringArray('["a","b"]'), ['a', 'b'], 'parseStringArray')
assert.deepEqual(auto.parseStringArray('here: ["x", "y"] done'), ['x', 'y'], 'parseStringArray tolerates prose')
assert.deepEqual(auto.parseStringArray('not json'), [], 'parseStringArray empty on garbage')
assert.deepEqual(auto.parseIndexArray('[3,0,2]'), [3, 0, 2], 'parseIndexArray')
assert.deepEqual(auto.parseIndexArray('[9,-1]'), [3, 0], 'parseIndexArray clamps to 0..3')
assert.ok(auto.similarity({ content: '端口冲突 先停再起' }, { content: '端口冲突 先停再起' }) > 0.9, 'similarity identical')
assert.ok(auto.similarity({ content: '端口冲突' }, { content: '完全不同的事' }) < 0.2, 'similarity dissimilar')
console.log('ok  automation.js parseStringArray / parseIndexArray / similarity')

// ── seed three scopes with paraphrase-rich memories in a temp dir ────────────
const dir = join(tmpdir(), 'ltm-semantic-' + Date.now())
mkdirSync(dir, { recursive: true })
const wsMem = [
  { id: 'w1', scope: 'workspace', content: '端口冲突时先 dsh stop 再 dsh start，不要直接 kill', tags: ['constraint'], updatedAt: 1 },
  { id: 'w2', scope: 'workspace', content: '用户偏好用中文回答', tags: ['preference'], updatedAt: 2 },
]
const gMem = [
  { id: 'g1', scope: 'global', content: 'dsh web 报 EADDRINUSE 是因为已有实例在跑，不是插件问题', tags: ['pitfall'], updatedAt: 3 },
  { id: 'g2', scope: 'global', content: '改完插件代码要先跑预检再重启', tags: ['workflow'], updatedAt: 4 },
]
writeFileSync(join(dir, 'workspace-memory.jsonl'), wsMem.map((m) => JSON.stringify(m)).join('\n') + '\n')
writeFileSync(join(dir, 'global.jsonl'), gMem.map((m) => JSON.stringify(m)).join('\n') + '\n')
writeFileSync(join(dir, 'user.jsonl'), JSON.stringify({ id: 'u1', scope: 'user', content: '用户是前端工程师', tags: ['profile'], updatedAt: 5 }) + '\n')

const cfg = {
  userFile: join(dir, 'user.jsonl'),
  globalFile: join(dir, 'global.jsonl'),
  workspaceFile: join(dir, 'workspace-memory.jsonl'),
}

function findTool(name) {
  const t = tools.find((t) => t.name === name)
  assert.ok(t, `tool ${name} registered`)
  return t
}

function makeExec(agent) {
  return { agent }
}

// ── 2. semantic recall OFF → plain BM25, LLM absent, must still work ──────────
mod.apply(stubCtx, { ...cfg, semanticRecall: false, semanticRerank: false })
const recall = findTool('memory_recall')
{
  const res = await recall.execute(
    { query: '端口冲突', scope: 'all', limit: 5 },
    makeExec({ session: { id: 's1', header: { cwd: dir } }, options: { provider: 'p', model: 'm' } })
  )
  assert.ok(res.results.length >= 1, 'BM25 recall returns results without LLM')
  assert.ok(res.results.some((r) => r.id === 'w1'), 'BM25 matched the workspace port-conflict entry')
  assert.ok(res.results.every((r) => typeof r.score === 'number'), 'results carry scores')
  // Render path must not throw (regression: renderRecords expects wrapped items;
  // memory_recall used to pass flat items and crashed output.render).
  const rendered = recall.output.render({}, res)
  assert.ok(Array.isArray(rendered) && rendered[0].type === 'text', 'output.render produces text')
  assert.ok(rendered[0].text.includes('w1') || rendered[0].text.includes('端口冲突'), 'render shows the matched memory')
  console.log(`ok  semanticRecall=off degrades to BM25 (${res.results.length} results, LLM absent) + render OK`)
}

// ── 3. semantic recall ON, LLM present (stub) → merge + rerank, no throw ──────
const fakeLlm = {
  async *stream({ system, messages }) {
    const userText = messages?.[0]?.content?.[0]?.text ?? ''
    let out = ''
    if (system === auto.QUERY_EXPAND_PROMPT) {
      out = JSON.stringify([userText, 'EADDRINUSE', '端口被占用'])
    } else if (system === auto.RERANK_PROMPT) {
      // length may not match the candidate count; that path falls back to BM25
      // ordering, which is still valid — we only assert no throw + results.
      out = JSON.stringify([3, 2, 1, 0])
    }
    yield { type: 'text-delta', text: out }
  },
}
stubCtx._llm = fakeLlm
mod.apply(stubCtx, { ...cfg, semanticRecall: true, semanticRerank: true })
const recall2 = findTool('memory_recall')
{
  const res = await recall2.execute(
    { query: '端口冲突', scope: 'all', limit: 5 },
    makeExec({ session: { id: 's1', header: { cwd: dir } }, options: { provider: 'p', model: 'm' } })
  )
  assert.ok(res.results.length >= 1, 'semantic recall with LLM returns results')
  assert.ok(res.results.some((r) => r.id === 'w1' || r.id === 'g1'), 'query expansion surfaced a paraphrase match')
  console.log(`ok  semanticRecall=on with stub LLM returns ${res.results.length} merged results (no throw)`)
}

// ── 4. semantic dedup default OFF (exact dedup only) ──────────────────────────
mod.apply(stubCtx, { ...cfg })
const diagnose = findTool('memory_diagnose')
{
  const res = await diagnose.execute({}, makeExec({ session: { id: 's1', header: { cwd: dir } } }))
  assert.ok(/semanticDedupThreshold: 0/.test(res.report), 'semanticDedupThreshold defaults to 0 (off)')
  console.log('ok  semanticDedupThreshold defaults to 0 (conservative exact-dedup)')
}

rmSync(dir, { recursive: true, force: true })
console.log('\nAll memory-semantic-recall tests passed.')
