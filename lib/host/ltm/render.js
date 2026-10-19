/*
 * dsh-minimal-ui-panels — host/ltm 的注入渲染。
 *
 * 记忆分三层，注入按层处理：
 *   resident  全文注入（人格 / 硬约束 / 用户明确偏好）——不再受"最近更新"影响
 *   index     一行索引（项目细节 / 历史决策 / 参考文档），全文按需检索
 *   archive   永不注入，只能通过 memory_recall / memory_list 查到
 *
 * 为什么要有第二层：旧实现只按 updatedAt 倒序填满 maxChars，一条三天前写下的
 * 硬约束会被今天的项目琐事挤出窗口。分层之后常驻项先占位且不参与淘汰，
 * 索引项才竞争剩余预算。
 *
 * 本模块必须是**同步**的：DSH 的组装器用普通调用求值 text 函数，不会 await，
 * 随后对结果做字符串插值（Promise 会触发 "text.indexOf is not a function"）。
 * store 首次加载后记录都在内存里，预热之后同步渲染成立。
 */
import { scopeLabel } from './shared.js'

/** Index lines are clipped so one entry cannot eat the whole budget. */
const INDEX_CLIP = 96

/** Tags kept on a rendered line; `correction` is noise on every line. */
function lineTags(record) {
	const tags = (record.tags ?? []).filter((t) => t !== 'correction').slice(0, 3)
	return tags.length > 0 ? ' #' + tags.join(' #') : ''
}

/** L0: the whole statement, because a truncated constraint is the failure mode. */
export function residentLine(scope, record) {
	return `- [${scopeLabel(scope)}] ${record.content}${lineTags(record)}`
}

/** L1: one line — enough to know it exists and where to look, not the whole text. */
export function indexLine(scope, record) {
	const text = String(record.content ?? '').replace(/\s+/g, ' ').trim()
	const clipped = text.length > INDEX_CLIP ? text.slice(0, INDEX_CLIP) + '…' : text
	return `- [${scopeLabel(scope)}] ${clipped}${lineTags(record)}`
}

/**
 * Render the injected digest for one assembly.
 * @param entries - [{ scope, record }] collected from every store.
 * @param opts.residentMaxChars - budget for the resident layer (filled first).
 * @param opts.totalMaxChars - overall budget; index lines use what is left.
 * @param opts.mode - 'recent' | 'full' (only affects how many index lines qualify).
 * @param opts.split - max index lines in 'recent' mode.
 * @param opts.injectTags - when non-empty, only index records carrying one qualify.
 *   Resident records are never tag-filtered: being unconditional is their point.
 * @returns rendered lines, in injection order.
 */
export function renderTieredDigest(entries, { residentMaxChars, totalMaxChars, mode = 'recent', split, injectTags = [] }) {
	const live = entries.filter(({ record }) => record.superseded !== true && record.tier !== 'archive')
	const lines = []
	let used = 0

	for (const { scope, record } of live.filter((e) => e.record.tier === 'resident')) {
		const line = residentLine(scope, record)
		// Always keep at least one resident line, even if it alone exceeds the cap.
		if (lines.length > 0 && used + line.length + 1 > residentMaxChars) break
		lines.push(line)
		used += line.length + 1
	}

	const index = live.filter((e) => e.record.tier !== 'resident')
	const tagged = injectTags.length > 0
		? index.filter(({ record }) => (record.tags ?? []).some((t) => injectTags.includes(t)))
		: index
	const ordered = tagged.slice().sort((a, b) => b.record.updatedAt - a.record.updatedAt)
	const limit = mode === 'full' ? ordered.length : (Number.isFinite(split) ? split : ordered.length)
	for (const { scope, record } of ordered.slice(0, limit)) {
		const line = indexLine(scope, record)
		if (used + line.length + 1 > totalMaxChars) break
		lines.push(line)
		used += line.length + 1
	}
	return lines
}
