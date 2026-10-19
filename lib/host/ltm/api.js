/*
 * dsh-minimal-ui-panels — host/ltm 的浏览器 API。
 *
 * webServer 只在 web profile 存在；其它 profile 没有界面需求，注册时直接返回。
 * 路由：
 *   GET    /api/memory/list?scope=      GET /api/memory/search?q=&scope=
 *   GET    /api/memory/get?id=          DELETE /api/memory/delete?id=
 *   GET    /api/memory/settings         POST /api/memory/settings
 *   POST   /api/memory/put              POST /api/memory/import
 *   GET    /api/memory/pending          POST /api/memory/pending
 *
 * 这些 handler 需要 apply() 的状态层（storeFor / eff / settings / 待确认队列）
 * 与两处维持逻辑（tryCompress、威胁扫描），所以通过 deps 显式传入，
 * 而不是各自去 import —— 否则这里会和入口形成环。
 */
import { SCOPE_PRIORITY, assertScope } from './shared.js'
import { SETTINGS_KEYS, saveSettingsFile } from './runtime.js'
import { scanThreats } from '../threats.js'
import { parseExportBundle } from '../store.js'

export function registerHostApi(deps) {
  const {
    ctx, storeFor, eff, cfg, maxResults, memorySettings,
    pendingPathFor, loadPending, approvePending, rejectPending, tryCompress,
  } = deps
  const webServer = ctx.get('webServer')
  if (webServer === undefined) return
  const sendJson = (res, status, value) => {
    const body = JSON.stringify(value)
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'content-length': Buffer.byteLength(body),
    })
    res.end(body)
  }
  const readJsonBody = async (req) => {
    let body = ''
    for await (const chunk of req) {
      body += chunk
      if (body.length > 1_048_576) throw new Error('request body too large')
    }
    return body === '' ? {} : JSON.parse(body)
  }
  const routes = {
    '/api/memory/list': async (req, res) => {
      const scope = new URL(req.url, 'http://localhost').searchParams.get('scope') ?? 'all'
      const session = ctx.agents?.currentInitiator?.()?.session
      const scopes = scope === 'all' ? SCOPE_PRIORITY : [assertScope(scope)]
      const results = []
      for (const s of scopes) {
        const { store } = storeFor(s, session, ctx)
        results.push(...(await store.list()).map((r) => ({ ...r, scope: s })))
      }
      results.sort((a, b) => b.updatedAt - a.updatedAt)
      sendJson(res, 200, { results })
    },
    '/api/memory/search': async (req, res) => {
      const params = new URL(req.url, 'http://localhost').searchParams
      const query = params.get('q') ?? ''
      const scope = params.get('scope') ?? 'all'
      const session = ctx.agents?.currentInitiator?.()?.session
      const scopes = scope === 'all' ? SCOPE_PRIORITY : [assertScope(scope)]
      const results = []
      for (const s of scopes) {
        const { store } = storeFor(s, session, ctx)
        const hits = await store.search(query, { limit: maxResults })
        results.push(...hits.map((h) => ({ ...h.record, scope: s, score: h.score })))
      }
      results.sort((a, b) => b.score - a.score)
      sendJson(res, 200, { query, results })
    },
    '/api/memory/get': async (req, res) => {
      const id = new URL(req.url, 'http://localhost').searchParams.get('id') ?? ''
      for (const s of SCOPE_PRIORITY) {
        const { store } = storeFor(s, undefined, ctx)
        const record = await store.get(id)
        if (record !== undefined) return sendJson(res, 200, { record: { ...record, scope: s } })
      }
      sendJson(res, 404, { error: 'not found' })
    },
    '/api/memory/delete': async (req, res) => {
      const id = new URL(req.url, 'http://localhost').searchParams.get('id') ?? ''
      for (const s of SCOPE_PRIORITY) {
        const { store } = storeFor(s, undefined, ctx)
        const outcome = await store.delete(id)
        if (outcome.ok && outcome.existed) return sendJson(res, 200, { deleted: true, scope: s })
      }
      sendJson(res, 404, { error: 'not found' })
    },
    '/api/memory/settings': async (req, res) => {
      if (req.method === 'POST') {
        let payload
        try {
          payload = await readJsonBody(req)
        } catch (error) {
          return sendJson(res, 400, { error: `bad request: ${String(error?.message ?? error)}` })
        }
        const patch = {}
        for (const key of SETTINGS_KEYS) {
          if (payload[key] !== undefined) patch[key] = payload[key]
        }
        if (Object.keys(patch).length === 0) return sendJson(res, 400, { error: 'no supported settings fields' })
        try {
          // Persist to our own settings file (works without the ctx.settings service).
          const saved = saveSettingsFile(patch)
          Object.assign(cfg, saved)
          // Best-effort: also push into ctx.settings if it happens to be mounted.
          if (memorySettings !== undefined) {
            try { await memorySettings.update(patch) } catch { /* non-fatal */ }
          }
        } catch (error) {
          return sendJson(res, 422, { error: `invalid settings: ${String(error?.message ?? error)}` })
        }
      }
      sendJson(res, 200, {
        autoSummarize: eff(null, 'autoSummarize', cfg.autoSummarize),
        compressWithLLM: eff(null, 'compressWithLLM', cfg.compressWithLLM),
        injectContext: eff(null, 'injectContext', cfg.injectContext),
        injectTags: eff(null, 'injectTags', cfg.injectTags),
        requireApprovalForWrite: eff(null, 'requireApprovalForWrite', cfg.requireApprovalForWrite),
        autoApproveAfterMs: eff(null, 'autoApproveAfterMs', cfg.autoApproveAfterMs),
        charLimit: eff(null, 'charLimit', cfg.charLimit),
        semanticRecall: eff(null, 'semanticRecall', cfg.semanticRecall),
        semanticRerank: eff(null, 'semanticRerank', cfg.semanticRerank),
        semanticVectorRecall: eff(null, 'semanticVectorRecall', cfg.semanticVectorRecall),
        semanticDedupThreshold: eff(null, 'semanticDedupThreshold', cfg.semanticDedupThreshold),
        autoConsolidate: eff(null, 'autoConsolidate', cfg.autoConsolidate),
        consolidateIntervalMs: eff(null, 'consolidateIntervalMs', cfg.consolidateIntervalMs),
        consolidateMaxEntries: eff(null, 'consolidateMaxEntries', cfg.consolidateMaxEntries),
      })
    },
    '/api/memory/put': async (req, res) => {
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })
      let payload
      try {
        payload = await readJsonBody(req)
      } catch (error) {
        return sendJson(res, 400, { error: `bad request: ${String(error?.message ?? error)}` })
      }
      const scope = assertScope(payload.scope) ?? 'global'
      const content = typeof payload.content === 'string' ? payload.content.trim() : ''
      if (content.length === 0) return sendJson(res, 400, { error: 'content is required' })
      if (cfg.scanThreatsOnWrite) {
        const threats = scanThreats(content)
        if (threats.length > 0) return sendJson(res, 422, { error: `content matches threat pattern(s): ${threats.join(', ')}` })
      }
      const { store } = storeFor(scope, undefined, ctx)
      const record = {
        scope,
        content,
        tags: Array.isArray(payload.tags) ? payload.tags.filter((t) => typeof t === 'string' && t.length > 0) : [],
      }
      if (typeof payload.id === 'string' && payload.id.length > 0) record.id = payload.id // 编辑：按 id 更新
      const outcome = await store.put(record)
      if (outcome.ok) return sendJson(res, 200, { ok: true, record: outcome.record })
      if (outcome.reason === 'limit') {
        const freed = await tryCompress(store, undefined, undefined, content.length)
        if (freed) {
          const retry = await store.put(record)
          if (retry.ok) return sendJson(res, 200, { ok: true, record: retry.record })
          return sendJson(res, 409, { error: retry.error })
        }
      }
      sendJson(res, 409, { error: outcome.error })
    },
    '/api/memory/import': async (req, res) => {
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })
      let payload
      try {
        payload = await readJsonBody(req)
      } catch (error) {
        return sendJson(res, 400, { error: `bad request: ${String(error?.message ?? error)}` })
      }
      try {
        const forcedScope = payload.scope ? assertScope(payload.scope) : undefined
        const parsed = parseExportBundle(payload.bundle ?? '')
        let imported = 0
        let skipped = 0
        const perScope = {}
        for (const record of parsed) {
          const scope = forcedScope ?? record.scope
          const { store } = storeFor(scope, undefined, ctx)
          const existing = await store.list()
          if (existing.some((r) => r.content === record.content)) { skipped += 1; continue }
          const outcome = await store.put({ ...record, scope })
          if (outcome.ok) { imported += 1; perScope[scope] = (perScope[scope] ?? 0) + 1 }
          else if (outcome.reason !== 'limit') { skipped += 1 }
        }
        sendJson(res, 200, { imported, skipped, perScope })
      } catch (error) {
        sendJson(res, 400, { error: String(error?.message ?? error) })
      }
    },
    '/api/memory/pending': async (req, res) => {
      const session = ctx.agents?.currentInitiator?.()?.session
      if (req.method === 'POST') {
        let payload
        try {
          payload = await readJsonBody(req)
        } catch (error) {
          return sendJson(res, 400, { error: `bad request: ${String(error?.message ?? error)}` })
        }
        const id = typeof payload.id === 'string' ? payload.id : ''
        const action = payload.action === 'reject' ? 'reject' : 'approve'
        if (id.length === 0) return sendJson(res, 400, { error: 'id is required' })
        const result = action === 'reject'
          ? rejectPending(session, ctx, id)
          : await approvePending(session, ctx, id)
        if (!result.ok) return sendJson(res, result.error === 'pending item not found' ? 404 : 422, { error: result.error })
        // 批准后立即停止自动 flush 的脏读：回写成功即可。
        return sendJson(res, 200, { ok: true, result })
      }
      // GET：列出待确认队列（含自动放行倒计时剩余毫秒，便于 UI 展示）。
      const file = pendingPathFor(session, ctx)
      const cache = loadPending(file)
      const ms = eff(null, 'autoApproveAfterMs', cfg.autoApproveAfterMs)
      const now = Date.now()
      const items = cache.items.map((it) => ({
        ...it,
        autoApproveInMs: ms > 0 ? Math.max(0, ms - (now - (it.createdAt || 0))) : null,
      }))
      sendJson(res, 200, { items, autoApproveAfterMs: ms })
    },
  }
  for (const [path, handler] of Object.entries(routes)) {
    ctx.effect(() => webServer.register({
      kind: 'exact',
      path,
      handler: async (req, res) => {
        try {
          await handler(req, res)
        } catch (error) {
          sendJson(res, Number(error?.status) > 0 ? error.status : 500, { error: String(error?.message ?? error) })
        }
      },
    }), `long-term-memory: ${path}`)
  }
}
