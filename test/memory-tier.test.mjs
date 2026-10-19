#!/usr/bin/env node
/**
 * Tiered injection tests.
 *
 * Before tiers, the digest was "the N most recently updated records, filled to
 * maxChars". A hard constraint written three days ago could be pushed out by
 * today's project chatter. The fix splits records into layers:
 *
 *   resident → injected in full, filled FIRST, never evicted for recency
 *   index    → one clipped line each, competes for the remaining budget
 *   archive  → never injected
 *
 * These tests mount apply(), capture the systemPrompt.context contribution and
 * call its `text` function the way the assembler does (synchronously), then
 * assert on the rendered string.
 */
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const root = mkdtempSync(join(tmpdir(), 'ltm-tier-'))
process.env.DSH_HOME = join(root, 'home')
mkdirSync(process.env.DSH_HOME, { recursive: true })

const mod = await import('../lib/host/ltm.js')

/** Mount one instance and return { text, tools } for its own workspace. */
function mount(name, config) {
	const workspace = join(root, name)
	mkdirSync(workspace, { recursive: true })
	const tools = new Map()
	const contexts = []
	const noop = () => {}
	const ctx = {
		on: noop,
		effect: (fn) => { try { return fn() } catch { return undefined } },
		tools: { register: (def) => { tools.set(def.name, def); return () => {} } },
		commands: { register: noop },
		systemPrompt: { section: noop, add: noop, context: (cfg) => { contexts.push(cfg); return () => {} } },
		workspaceRegistry: undefined,
		agents: { currentInitiator: () => ({ session: { id: name, header: { cwd: workspace } } }) },
		settings: { register: () => ({ get: () => ({}), update: async () => {} }) },
		logger: { warn: noop, info: noop, debug: noop, error: noop },
		inject: noop,
		get: () => undefined,
	}
	mod.apply(ctx, config)
	const entry = contexts.find((c) => c.name === 'long-term-memory:inject')
	const session = { id: name, header: { cwd: workspace } }
	const exec = { agent: { session } }
	return {
		write: (content, tier) => tools.get('memory_write').execute({ content, tier, scope: 'workspace' }, exec),
		entry,
		render: () => {
			assert.ok(entry && typeof entry.text === 'function', 'injection contribution registered')
			return entry.text({ agent: { session } })
		},
	}
}

let passed = 0
const ok = (label, cond) => { assert.ok(cond, label); passed++; console.log('  ✓ ' + label) }

try {
	// ---- 1. The three layers are treated differently -----------------------
	const a = mount('layers', { injectContext: 'recent', maxInjectedChars: 2400, residentMaxChars: 1600 })
	const resident = '硬约束：desktop profile 只能由 App 自带 CLI 修改，任何直连 pnpm 的操作都会被拒绝。'
	const index = '项目细节：update-checker 的 host 半身拆成六个模块，registry 逻辑在 registry.js。'
	const archive = '历史档案：2026-10-14 完成 886 个中文字体的四批修复。'
	await a.write(resident, 'resident')
	await a.write(index, 'index')
	await a.write(archive, 'archive')

	const out = a.render()
	ok('resident content is injected in full', out.includes(resident))
	ok('index content appears as a line', out.includes('项目细节：update-checker'))
	ok('archive content is never injected', !out.includes('886 个中文字体'))
	ok('resident and index lines are distinguishable', out.split('\n').filter((l) => l.startsWith('- [')).length >= 2)

	// ---- 2. Recency cannot evict a resident fact ---------------------------
	// A small budget where the resident fact plus any index line cannot both fit.
	const b = mount('evict', { injectContext: 'recent', maxInjectedChars: 140, residentMaxChars: 140 })
	const constraint = '硬约束：不要把 GitHub token 写进仓库或提交信息，只能从 ~/.dsh/.github-token 读取。'
	await b.write(constraint, 'resident')
	for (let i = 0; i < 5; i++) {
		await b.write(`项目琐事 ${i}：今天的临时细节，更新于最新时刻，内容无关紧要但会占用注入预算。`, 'index')
	}
	const evicted = b.render()
	ok('resident survives newer index records', evicted.includes('不要把 GitHub token 写进仓库'))
	ok('index records are the ones dropped under pressure', !evicted.includes('项目琐事 4'))

	// ---- 3. Long index entries are clipped to one line ---------------------
	const c = mount('clip', { injectContext: 'full', maxInjectedChars: 2400, residentMaxChars: 1600 })
	await c.write('索引条目：' + '很长的项目说明'.repeat(30), 'index')
	const clipped = c.render()
	ok('long index entry is clipped with an ellipsis', clipped.includes('…'))
	ok('clipped entry stays on one line', clipped.split('\n').filter((l) => l.includes('索引条目')).length === 1)

	// ---- 4. off means off --------------------------------------------------
	const d = mount('off', { injectContext: 'off' })
	await d.write('随便一条', 'resident')
	ok('injectContext=off registers no contribution', d.entry === undefined)

	console.log(`\n${passed} 项通过 · tiered injection`)
} finally {
	rmSync(root, { recursive: true, force: true })
}
