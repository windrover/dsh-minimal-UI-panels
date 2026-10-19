#!/usr/bin/env node
// 统一测试入口：按文件名顺序跑 test/*.test.mjs，逐个独立进程（互不污染全局状态）。
//
// 为什么不用 `node --test`：这些测试是自包含脚本（每条自己 new mock、自己 throw），
// 不是 node:test 结构；用子进程逐条跑能保留它们原来的语义，也便于一眼看出是哪条挂了。
//
// 用法：npm test               跑全部
//       npm test -- artifacts  只跑文件名含 artifacts 的
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TEST_DIR = path.join(ROOT, 'test');
const filter = process.argv[2] ?? '';

const files = readdirSync(TEST_DIR)
	.filter((f) => f.endsWith('.test.mjs'))
	.filter((f) => filter === '' || f.includes(filter))
	.sort();

if (files.length === 0) {
	console.error(filter === '' ? '✗ test/ 下没有 .test.mjs' : `✗ 没有匹配 "${filter}" 的测试`);
	process.exit(1);
}

const failed = [];
const startedAt = Date.now();
for (const file of files) {
	const t0 = Date.now();
	const run = spawnSync(process.execPath, [path.join(TEST_DIR, file)], { encoding: 'utf8' });
	const ms = Date.now() - t0;
	if (run.status === 0) {
		console.log(`✔ ${file.padEnd(38)} ${String(ms).padStart(5)}ms`);
	} else {
		failed.push(file);
		console.log(`✗ ${file.padEnd(38)} ${String(ms).padStart(5)}ms`);
		const out = `${run.stdout ?? ''}${run.stderr ?? ''}`.trimEnd().split('\n');
		for (const line of out.slice(-8)) console.log(`    ${line}`);
	}
}

const total = Date.now() - startedAt;
console.log(`\n${files.length - failed.length}/${files.length} 通过 · ${(total / 1000).toFixed(1)}s`);
if (failed.length > 0) {
	console.error(`失败：${failed.join(', ')}`);
	process.exit(1);
}
