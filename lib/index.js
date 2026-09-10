/**
 * dsh-minimal-UI-panels — Host half (merged entry).
 *
 * This file only composes the three host logics (each copied verbatim from
 * its original plugin so internal API usage stays exact):
 *
 *   - ./host/ltm.js            : memory_* tools, /memory command, settings
 *                                namespace, per-assembly context injection.
 *   - ./host/artifacts.js      : artifacts_list tool + /api/artifacts/* routes.
 *   - ./host/terminal-notes.js : /api/terminal-notes/* routes.
 *
 * The browser half (./client.js) registers artifacts / long-term-memory /
 * terminal / notes as right-Sidebar tab types; it carries no host logic, and
 * the old dsh-details-tabs container is gone (DSH 0.1.5 replaced the
 * third-party `details` column with `rightbar`).
 *
 * `inject` is the union of every required service across the three logics.
 */

import { apply as applyLtm } from './host/ltm.js'
import { apply as applyArtifacts } from './host/artifacts.js'
import { apply as applyTerminalNotes } from './host/terminal-notes.js'

export const name = 'dsh-minimal-UI-panels'

export const inject = [
  // ltm
  'tools', 'systemPrompt', 'commands', 'settings', 'agents',
  // artifacts
  'webServer', 'workspaceRegistry',
  // terminal-notes
  'subprocess', 'fs',
]

export function apply(ctx, config = {}) {
  const sub = (name, fallback) => {
    const v = config[name]
    return v === undefined ? fallback : v
  }
  applyLtm(ctx, sub('longTermMemory', config))
  applyArtifacts(ctx, sub('artifacts', config))
  applyTerminalNotes(ctx, sub('terminalNotes', config))
}
