import { ArrowRight } from 'lucide-react'
import { CopyButton } from './copy-button'
import { ProjectVisualIcon } from './project-visual-icons'
import { ProjectVisualDiagram } from './project-visual-diagram'
import { getProjectVisual,visualAgentPrompt } from '@/lib/project-visuals'
import type { ProjectVisual,VisualModel } from '@/lib/project-visuals-core.mjs'
const basisLabels = { 'saved-workflows':'From saved workflows', 'approved-design':'Planned design', 'client-brief':'Client request · planned', 'audit-source':'From original source · runtime unverified', 'reviewed-version':'From reviewed version' }
const evidenceLabels = { design:'design',static:'saved files',mock:'mock tests','controlled-live':'controlled live test',production:'production test' }
function Preview({visual,model}:{visual:ProjectVisual;model:VisualModel}) {
  return <div className="project-visual-preview" aria-label="Process overview">
    {visual.preview.stageIds.map((id,i)=>{const stage=visual.stages.find(s=>s.id===id)!;return <div className="project-visual-preview-item" key={id}>
      {i>0&&<ArrowRight size={12} className="project-visual-preview-arrow" aria-hidden />}
      <div className="project-visual-preview-step"><ProjectVisualIcon name={stage.icon} /><span>{stage.label}</span></div>
    </div>})}
    {model.outcomeCount>0&&<span className="project-visual-outcomes small">{model.outcomeCount} outcomes</span>}
  </div>
}
export function ProjectVisualCard({slug}:{slug:string}) {
  const result=getProjectVisual(slug,true)
  if(result.state!=='ready')return <section className="card project-visual-card" aria-label="How it works"><div className="card-head"><h2>How it works</h2><CopyButton text={visualAgentPrompt(slug)} label="Copy visual prompt" /></div><p className="small muted">{result.state==='missing'?'A project visual has not been added yet.':result.state==='unsupported'?'This visual needs a newer supported format.':'The project visual could not be displayed. Ask an agent to check the asset.'}</p></section>
  const {visual,model,freshness}=result
  return <section className="card project-visual-card" aria-label="How it works">
    <div className="card-head"><h2>How it works</h2><span className="project-visual-basis small">{basisLabels[visual.basis]}</span></div>
    <h3 className="project-visual-title">{visual.title}</h3><p className="small muted">{visual.summary}</p>
    <Preview visual={visual} model={model} />
    <p className="small project-visual-evidence">{visual.evidence.note}</p>
    {(freshness==='stale'||freshness==='unavailable')&&<div className="project-visual-warning"><p className="small">{freshness==='stale'?'Sources changed since this summary was generated.':'Sources could not be fully checked. Treat this as the last generated summary.'}</p><CopyButton text={visualAgentPrompt(slug)} label="Copy refresh prompt" /></div>}
    <details className="project-visual-expanded"><summary>Explore the process</summary><ProjectVisualDiagram visual={visual} model={model} /></details>
    <details className="project-visual-sources"><summary className="small">Sources and evidence</summary><p className="small muted">Recorded evidence: {evidenceLabels[visual.evidence.level]}{visual.evidence.recordedAt&&` · ${visual.evidence.recordedAt}`}. Generated {visual.generatedAt.slice(0,10)}.</p><p className="small muted">{freshness==='current'?'Cited local files are unchanged. This does not verify current runtime behavior.':'Local source freshness is not confirmed.'}</p><ul className="small mono">{visual.sources.map(s=><li key={s.id}>{s.path}</li>)}</ul></details>
  </section>
}
