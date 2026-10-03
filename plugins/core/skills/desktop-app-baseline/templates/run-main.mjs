// Main Run for Electron/npm apps: exports the code committed on main to build/main-run and runs it there,
// leaving the working tree untouched. Needs a git repo with a `main` branch.
import { spawnSync } from 'node:child_process'
import { rmSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const out = resolve(root, 'build', 'main-run')
const npm = (args) => {
  const r = spawnSync('npm', args, { cwd: out, stdio: 'inherit', shell: process.platform === 'win32' })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

// git archive main | tar -x -C build/main-run
const archive = spawnSync('git', ['archive', '--format=tar', 'main'], { cwd: root, maxBuffer: 1 << 30 })
if (archive.status !== 0) {
  console.error('git archive main failed: is there a main branch with a commit?')
  process.exit(1)
}
const untar = spawnSync('tar', ['-x', '-C', out], { input: archive.stdout })
if (untar.status !== 0) process.exit(untar.status ?? 1)

npm(['ci'])
npm(['run', 'build', '--if-present'])
npm(['start'])
