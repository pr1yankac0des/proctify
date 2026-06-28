import { spawn } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const node = process.execPath
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const apiPath = path.join(projectRoot, 'server', 'index.mjs')
const viteCli = path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js')

function startProcess(args, name) {
  const proc = spawn(node, args, { stdio: ['ignore', 'pipe', 'pipe'], cwd: projectRoot })
  proc.stdout.on('data', (d) => process.stdout.write(`[${name}] ${d}`))
  proc.stderr.on('data', (d) => process.stderr.write(`[${name} ERR] ${d}`))
  proc.on('exit', (code) => console.log(`[${name}] exited with ${code}`))
  return proc
}

const api = startProcess([apiPath], 'api')
const vite = startProcess([viteCli], 'vite')

function shutdown() {
  console.log('Shutting down child processes...')
  try { api.kill() } catch {};
  try { vite.kill() } catch {};
  process.exit()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

// keep process alive
process.stdin.resume()
