#!/usr/bin/env node
/**
 * Config/documentation drift guard.
 *
 * The settings surface is written down in four places — `defineConfig()`,
 * the settings schema in runtime.js, the panel's i18n table, and the README.
 * This test fails when the panel targets a key the runtime no longer
 * registers, when a configurable key loses its panel label, or when the
 * README stops describing the archive/stats behaviour shipped with the code.
 */
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const { defineConfig } = await import('../lib/host/ltm.js')
const { SETTINGS_KEYS } = await import('../lib/host/ltm/runtime.js')
const { memoryHelp } = await import('../lib/host/ltm/command.js')

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const runtime = read('../lib/host/ltm/runtime.js')
const panel = read('../src/long-term-memory/client.js')
const readme = read('../README.md')

let passed = 0
const ok = (label, cond) => { assert.ok(cond, label); passed++; console.log('  ✓ ' + label) }

const config = defineConfig()
for (const key of SETTINGS_KEYS) ok(`defineConfig() defines ${key}`, Object.hasOwn(config, key))

const schemaKeys = new Set([...runtime.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]*): z\./gm)].map((m) => m[1]))
for (const key of SETTINGS_KEYS) ok(`settings schema registers ${key}`, schemaKeys.has(key))

// Keys the panel deliberately does not expose (headless / set via config).
const UI_LESS = new Set(['injectTags', 'residentMaxChars'])
// The one historical label that predates the config key name.
const LABEL_ALIAS = { requireApprovalForWrite: 'requireApproval' }
for (const key of SETTINGS_KEYS) {
  if (UI_LESS.has(key)) continue
  const label = LABEL_ALIAS[key] ?? key
  ok(`panel labels ${key}`, panel.includes(`"settings.${label}"`) && panel.includes(`"settings.${label}Desc"`))
}

ok('/memory help lists stats', memoryHelp().includes('/memory stats'))
ok('README documents the archive file', readme.includes('memory-archive.jsonl'))
ok('README documents /memory stats', readme.includes('/memory stats'))
ok('README documents dedup status', readme.includes('status: "existing"'))

console.log(`\n${passed} 项通过 · config/docs consistency`)
