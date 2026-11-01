// Baut den C#-Host (Roslyn auf .NET-WebAssembly) nach packages/runtime/dotnet/ (nicht im Git).
// Aufruf: node scripts/build-csharp.ts [--if-missing]   (braucht das .NET-SDK 10)
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, rmSync, statSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const project = join(root, 'packages/csharp')
const target = join(root, 'packages/runtime/dotnet')
const out = join(project, 'bin/publish')

// --if-missing: nur bauen, wenn nichts da ist oder die Quellen neuer sind
if (process.argv.includes('--if-missing') && existsSync(join(target, 'dotnet.js'))) {
  const built = statSync(join(target, 'dotnet.js')).mtimeMs
  const newest = Math.max(...readdirSync(project).filter(f => /\.(cs|txt|csproj)$/.test(f)).map(f => statSync(join(project, f)).mtimeMs))
  if (newest < built) process.exit(0)
}

rmSync(out, { recursive: true, force: true })
execFileSync('dotnet', ['publish', project, '-c', 'Release', '-o', out, '--nologo'], { stdio: 'inherit' })
rmSync(target, { recursive: true, force: true })
cpSync(join(out, 'wwwroot/_framework'), target, { recursive: true })
console.log(`C#-Host gebaut: ${target}`)
