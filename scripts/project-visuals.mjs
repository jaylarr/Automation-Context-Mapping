#!/usr/bin/env node
import path from 'node:path'
import { REPO } from './lib/common.mjs'
import { boundedRead, MAX_VISUAL_BYTES, fingerprintVisualSources, validateCandidate, readProjectVisual, writeProjectVisual, listVisualProjects, VisualError } from '../app/src/lib/project-visuals-core.mjs'

const [command,...args] = process.argv.slice(2), options = {}, files = []
try {
  for(let i=0;i<args.length;i++) {
    const key = args[i]
    if(['--all','--include-archived'].includes(key)) { options[key] = true; continue }
    if(!['--project','--input','--file','--workspace','--expected-revision'].includes(key) || !args[i+1] || args[i+1].startsWith('--')) throw new VisualError('invalid_argument')
    if(key === '--file') files.push(args[++i]); else { if(options[key]) throw new VisualError('duplicate_argument'); options[key] = args[++i] }
  }
  const workspace = path.resolve(options['--workspace'] || REPO), slug = options['--project']
  let output
  if(command === 'sources') output = { sources:fingerprintVisualSources(workspace,slug,files) }
  else if(command === 'validate') {
    const visual = validateCandidate(workspace,slug,boundedRead(path.resolve(options['--input'] || ''),MAX_VISUAL_BYTES))
    output = { state:'valid',project:visual.projectSlug,layout:visual.layout }
  } else if(command === 'write') output = writeProjectVisual(workspace,slug,boundedRead(path.resolve(options['--input'] || ''),MAX_VISUAL_BYTES),options['--expected-revision'])
  else if(command === 'check') {
    if(options['--all'] && slug) throw new VisualError('invalid_argument')
    const projects = options['--all'] ? listVisualProjects(workspace,!!options['--include-archived']) : [slug]
    const results = projects.map(project => {
      const result = readProjectVisual(workspace,project,{verifySources:true})
      const { visual, model, ...safe } = result
      return {project,...safe,...(visual ? {layout:visual.layout,basis:visual.basis} : {})}
    })
    output = options['--all'] ? {results,counts:Object.fromEntries(['ready','missing','invalid','unsupported','unavailable'].map(s => [s,results.filter(r => r.state === s).length]))} : results[0]
    process.exitCode = results.some(r => ['invalid','unsupported'].includes(r.state)) ? 2 : results.some(r => r.state === 'unavailable' || r.state === 'ready' && r.freshness !== 'current') ? 3 : 0
  } else throw new VisualError('unknown_command')
  console.log(JSON.stringify(output,null,2))
} catch(e) {
  console.error(JSON.stringify({state:'error',code:e instanceof VisualError ? e.code : 'operation_unavailable',field:e instanceof VisualError ? e.field : ''}))
  process.exitCode = e instanceof VisualError && ['sources_changed','source_budget','audit_integrity'].includes(e.code) ? 3 : 1
}
