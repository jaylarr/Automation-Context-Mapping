import { registerHooks, stripTypeScriptTypes } from 'node:module'
import fs from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && context.parentURL?.startsWith('file:') && !path.extname(specifier)) {
      const candidate = fileURLToPath(new URL(specifier + '.ts', context.parentURL))
      if (fs.existsSync(candidate)) return { url: pathToFileURL(candidate).href, shortCircuit: true }
    }
    return next(specifier, context)
  },
  load(url, context, next) {
    if (url.endsWith('.ts') && !url.includes('/node_modules/')) return { format: 'module', source: stripTypeScriptTypes(fs.readFileSync(fileURLToPath(url), 'utf8')), shortCircuit: true }
    return next(url, context)
  },
})
