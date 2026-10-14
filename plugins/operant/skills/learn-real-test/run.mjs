// Real learn test: see SKILL.md. Usage: node .claude/skills/learn-real-test/run.mjs [outDir]
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import { _electron as electron } from 'playwright-core'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const outDir = resolve(process.argv[2] ?? join(repo, 'docs/specs/screenshots'))
mkdirSync(outDir, { recursive: true })
const dataDir = mkdtempSync(join(tmpdir(), 'lr-data-'))
const project = realpathSync.native(mkdtempSync(join(tmpdir(), 'lr-proj-')))
const claudeDir = mkdtempSync(join(tmpdir(), 'lr-claude-'))
copyFileSync(join(homedir(), '.claude', '.credentials.json'), join(claudeDir, '.credentials.json'))

writeFileSync(join(project, 'package.json'), '{"name":"demo","scripts":{"test":"vitest run"}}\n')
writeFileSync(join(project, 'app.ts'), 'export const add = (a: number, b: number) => a + b\n')
execSync('git init -q && git add -A && git -c user.name=t -c user.email=t@t commit -qm init', { cwd: project, stdio: 'ignore' })
writeFileSync(join(project, 'app.ts'), 'export const add = (a: number, b: number) => a + b\nexport const sub = (a: number, b: number) => a - b\n')

// A Claude transcript: four user turns with three corrections, padded so it passes the default token gate.
const sid = '11111111-2222-3333-4444-555555555555'
const encoded = project.replace(/[^a-zA-Z0-9]/g, '-')
mkdirSync(join(claudeDir, 'projects', encoded), { recursive: true })
const turns = [
  ['user', 'Add a sub function to app.ts and a test for it. Use pnpm, not npm, in this repo.'],
  ['assistant', 'I will add sub to app.ts. Running npm test to check.'],
  ['user', 'No, I said pnpm. In this repo always run tests with pnpm test, and put test files in a tests/ folder, not next to the source.'],
  ['assistant', 'Understood. Moving the test to tests/app.test.ts and running pnpm test.'],
  ['user', 'Good. Also I never want semicolons in the code, and please keep commit messages short with no attribution lines.'],
  ['assistant', 'Done: removed semicolons, will keep commit messages short and plain.'],
  ['user', 'Last thing: the vitest config must be vitest.config.ts at the root, otherwise tests from subfolders miss it.'],
  ['assistant', 'Noted, vitest.config.ts stays at the repo root.'],
]
for (let i = 0; i < 45; i++) {
  turns.splice(4 + i, 0, ['assistant', `Checked module${i}: reading src/module${i}.ts, the function fn${i} returns ${i} and is only used by the demo calculator, so no change is needed there and the pnpm test run still passes for it.`])
}
writeFileSync(
  join(claudeDir, 'projects', encoded, `${sid}.jsonl`),
  turns.map(([r, t]) => JSON.stringify({ type: r, message: { role: r, content: [{ type: 'text', text: t }] } })).join('\n') + '\n',
)

const env = { ...process.env, OPERANT_BACKGROUND: '1', OPERANT_DATA_DIR: dataDir, CLAUDE_CONFIG_DIR: claudeDir }
delete env.OPERANT_E2E
let app
try {
  app = await electron.launch({ args: ['.'], env, cwd: repo })
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.waitForFunction(() => !!window.operant)
  const inv = (c, ...a) => page.evaluate(([c, a]) => window.operant.invoke(c, ...a), [c, a])
  const crew = await inv('crews:create', { name: 'learn-demo', folder: project })
  // An OpenCode tile keeps this test from starting a Claude session; the learn step only needs its session id.
  const tile = await inv('scratch:create', { crewId: crew.id, title: 'demo', agent: 'opencode' })
  const db = new DatabaseSync(join(dataDir, 'operant.db'))
  db.exec('PRAGMA busy_timeout = 5000')
  db.prepare('UPDATE scratch SET session_id = ? WHERE id = ?').run(sid, tile.id)
  db.close()
  await inv('settings:set', { setupDone: true, learn: { enabled: true, mode: 'controlled', review: 'auto', hindsight: false, codegraph: false, memory: true } })
  await page.reload()
  await page.waitForFunction(() => !!window.operant)
  await page.locator(`[data-crew-row="${crew.id}"]`).click()
  await page.getByRole('status', { name: 'Learning now' }).waitFor({ timeout: 30_000 })
  console.log('AI used:', JSON.stringify(await inv('learn:ai')))

  const t0 = Date.now()
  const pending = inv('learn:runNow', tile.id, false)
  const seen = await page
    .waitForFunction(() => document.querySelector('[aria-label="Learning now"]')?.textContent?.includes('Learning from'), null, { timeout: 15_000 })
    .then(() => true, () => false)
  await page.screenshot({ path: join(outDir, 'learn-card-running.png') })
  console.log(`The Right now card showed "Learning from this session" while the run was in flight: ${seen}`)
  const run = await pending
  console.log(`RUN (${Date.now() - t0} ms):`, JSON.stringify(run, null, 1))
  await page.waitForTimeout(800)
  await page.screenshot({ path: join(outDir, 'learn-card-done.png') })

  console.log('LESSONS:')
  for (const l of await inv('learn:lessons', { crewId: crew.id })) console.log(` - [${l.status}] ${l.kind}/${l.scope}: ${l.text}`)
  console.log('RECORDS:')
  for (const r of await inv('learn:records', {})) console.log(` - ${r.kind} ${r.status}: ${String(r.next).slice(0, 140)}`)
  console.log('DRAFTS:', JSON.stringify((await inv('learn:drafts', crew.id)).map((d) => [d.name, d.status])))
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]))
  for (const f of walk(join(claudeDir, 'projects')).filter((f) => /memory/i.test(f))) console.log('FILE', f.replace(claudeDir, '<claude>'), '\n' + readFileSync(f, 'utf8'))
  console.log(`Screenshots: ${join(outDir, 'learn-card-running.png')}, ${join(outDir, 'learn-card-done.png')}`)
} catch (e) {
  console.log('FATAL', e.message)
  await (await app?.firstWindow())?.screenshot({ path: join(outDir, 'learn-fail.png') }).catch(() => {})
  process.exitCode = 1
} finally {
  await app?.close().catch(() => {})
  for (const d of [dataDir, project, claudeDir]) rmSync(d, { recursive: true, force: true })
}
