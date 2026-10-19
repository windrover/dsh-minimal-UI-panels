/*
 * dsh-minimal-ui-panels — host/ltm 的 /memory 用户命令。
 *
 * 面向人、不经过模型：浏览、检索、查看、遗忘、导出。与模型工具共用同一套
 * store（通过 deps 注入），所以命令行看到的记录与面板/模型完全一致。
 */
import { SCOPE_PRIORITY, assertScope, scopeLabel } from './shared.js'
import { exportBundle } from '../store.js'

export function memoryHelp() {
  return [
    'Usage:',
    '  /memory list [user|global|workspace|all]   — recent records, newest first',
    '  /memory search <query>                     — BM25 recall across all scopes',
    '  /memory get <id>                           — inspect one record',
    '  /memory forget <id>                        — delete one record',
    '  /memory export [json|markdown]             — portable bundle',
  ].join('\n')
}

export function registerMemoryCommand(deps) {
  const { ctx, storeFor, maxResults } = deps
ctx.commands.register({
  name: 'memory',
  description: 'Browse, search, inspect, forget, or export long-term memory (user-facing, no model call).',
  input: { hint: 'list | search <query> | get <id> | forget <id> | export [json|markdown]' },
  async handler(invocation) {
    const session = invocation.agent?.session
    const raw = invocation.rawInput.trim()
    const [sub, ...rest] = raw.split(/\s+/)
    try {
      if (sub === '' || sub === 'help' || sub === '-h' || sub === '--help') {
        return { kind: 'success', text: memoryHelp() }
      }
      if (sub === 'list') {
        const scopeArg = rest[0]
        const scope = scopeArg === undefined || scopeArg === 'all' ? 'all' : assertScope(scopeArg)
        const scopes = scope === 'all' ? SCOPE_PRIORITY : [scope]
        const lines = []
        for (const s of scopes) {
          const { store } = storeFor(s, session, ctx)
          const records = await store.list()
          if (records.length === 0) continue
          lines.push(`## ${scopeLabel(s)} (${records.length})`)
          for (const r of records.slice(0, maxResults)) {
            const tags = r.tags.length > 0 ? ` [${r.tags.join(', ')}]` : ''
            const stale = r.superseded === true ? ' [SUPERSEDED]' : ''
            lines.push(`- \`${r.id}\`${tags}${stale}: ${r.content}`)
          }
        }
        return { kind: 'success', text: lines.length > 0 ? lines.join('\n') : 'No memories stored yet.' }
      }
      if (sub === 'search') {
        const query = rest.join(' ')
        if (query.length === 0) return { kind: 'error', text: 'usage: /memory search <query>' }
        const scopes = SCOPE_PRIORITY
        const results = []
        for (const s of scopes) {
          const { store } = storeFor(s, session, ctx)
          const hits = await store.search(query, { limit: maxResults })
          for (const hit of hits) results.push({ ...hit, scope: s })
        }
        results.sort((a, b) => b.score - a.score)
        if (results.length === 0) return { kind: 'success', text: `No memories matched "${query}".` }
        const lines = results.slice(0, maxResults).map((h) => {
          const tags = h.record.tags.length > 0 ? ` [${h.record.tags.join(', ')}]` : ''
          return `- \`${h.record.id}\` [${h.scope}]${tags} (score ${h.score.toFixed(2)}): ${h.record.content}`
        })
        return { kind: 'success', text: `Matched ${results.length} for "${query}":\n${lines.join('\n')}` }
      }
      if (sub === 'get') {
        const id = rest[0]
        if (!id) return { kind: 'error', text: 'usage: /memory get <id>' }
        for (const s of SCOPE_PRIORITY) {
          const { store } = storeFor(s, session, ctx)
          const record = await store.get(id)
          if (record !== undefined) {
            const tags = record.tags.length > 0 ? ` [${record.tags.join(', ')}]` : ''
            const source = record.source ? ` (from session ${record.source.sessionId})` : ''
            return { kind: 'success', text: `\`${record.id}\` [${record.scope}]${tags}${source}\n${record.content}` }
          }
        }
        return { kind: 'error', text: `No memory with id ${id}.` }
      }
      if (sub === 'forget') {
        const id = rest[0]
        if (!id) return { kind: 'error', text: 'usage: /memory forget <id>' }
        for (const s of SCOPE_PRIORITY) {
          const { store } = storeFor(s, session, ctx)
          const outcome = await store.delete(id)
          if (outcome.ok && outcome.existed) {
            return { kind: 'success', text: `Forgot ${s} memory ${id}.` }
          }
        }
        return { kind: 'error', text: `No memory with id ${id}.` }
      }
      if (sub === 'export') {
        const format = rest[0] === 'markdown' ? 'markdown' : 'json'
        const records = []
        for (const s of SCOPE_PRIORITY) {
          const { store } = storeFor(s, session, ctx)
          records.push(...await store.list())
        }
        return { kind: 'success', text: exportBundle(records, format) }
      }
      return { kind: 'error', text: `Unknown /memory subcommand "${sub}".\n\n${memoryHelp()}` }
    } catch (error) {
      return { kind: 'error', text: `memory command failed: ${error.message}` }
    }
  },
})
}
