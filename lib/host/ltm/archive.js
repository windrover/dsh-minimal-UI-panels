/*
 * dsh-minimal-ui-panels — host/ltm 的压缩归档。
 *
 * 预算是硬上限，压缩必然要删记录；但「冷」不等于「不重要」——一条三个月没用
 * 到的硬约束，正好会在预算满时被淘汰。删除前把这些记录追加到同目录的
 * `<name>-archive.jsonl`，用户仍能查、能导出、能用 memory_import 导回。
 *
 * 归档是 append-only 的 JSONL，每行是原记录 + `archivedAt` + `archiveReason`。
 * 写入失败时**不删除**：调用方据此中止压缩，宁可暂时超限也不静默丢数据。
 */
import { appendFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

/** `user.jsonl` → `user-archive.jsonl`; `memory.jsonl` → `memory-archive.jsonl`. */
export function archivePathForFile(file) {
  const path = String(file ?? '')
  return /\.jsonl$/i.test(path) ? path.replace(/\.jsonl$/i, '-archive.jsonl') : `${path}-archive.jsonl`
}

/**
 * Append records to the store's archive file.
 *
 * @param store - the MemoryStore whose records are about to be deleted.
 * @param records - records to archive (an empty list is a no-op).
 * @param reason - why they are leaving the live store (`budget`, `llm_compress`, …).
 * @returns `{ archived, path }`.
 * @throws when the archive cannot be written — callers must then abort deletion.
 */
export async function archiveRecords(store, records, reason) {
  const list = Array.isArray(records) ? records : []
  const path = archivePathForFile(store?.file)
  if (list.length === 0) return { archived: 0, path }
  await mkdir(dirname(path), { recursive: true })
  const now = Date.now()
  const lines = list
    .map((record) => JSON.stringify({ ...record, archivedAt: now, archiveReason: reason }))
    .join('\n')
  await appendFile(path, `${lines}\n`, 'utf8')
  return { archived: list.length, path }
}
