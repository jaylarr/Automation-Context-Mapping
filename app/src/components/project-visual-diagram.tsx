'use client'
import { useEffect, useId, useRef, useState } from 'react'
import type { ProjectVisual, VisualModel } from '@/lib/project-visuals-core.mjs'
import { ProjectVisualIcon } from './project-visual-icons'
type Connection = { path:string; x:number; y:number; label?:string; kind:string }
export function ProjectVisualDiagram({ visual, model }: { visual:ProjectVisual;model:VisualModel }) {
  const ref=useRef<HTMLDivElement>(null), identifier=useId().replace(/:/g,''), marker=`visual-arrow-${identifier}`, panel=`visual-step-${identifier}`
  const [connections,setConnections]=useState<Connection[]>([]),[size,setSize]=useState({width:1,height:1}),[selected,setSelected]=useState<string|null>(null)
  useEffect(()=>{
    const container=ref.current;if(!container)return
    let frame=0,disposed=false
    const measure=()=>{
      if(disposed)return
      const parent=container.getBoundingClientRect(), nodes=new Map(Array.from(container.querySelectorAll<HTMLElement>('[data-stage]')).map(node=>[node.dataset.stage,node.getBoundingClientRect()]))
      setSize({width:container.scrollWidth,height:container.scrollHeight})
      setConnections(visual.edges.flatMap(edge=>{
        const a=nodes.get(edge.from),b=nodes.get(edge.to);if(!a||!b)return []
        const x1=a.right-parent.left,y1=a.top+a.height/2-parent.top,x2=b.left-parent.left,y2=b.top+b.height/2-parent.top,mid=(x1+x2)/2
        return [{path:`M ${x1} ${y1} H ${mid} V ${y2} H ${x2}`,x:mid,y:(y1+y2)/2,label:edge.label,kind:edge.kind}]
      }))
    }
    const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(measure)}
    const observer=new ResizeObserver(schedule);observer.observe(container)
    container.querySelectorAll('[data-stage]').forEach(node=>observer.observe(node))
    schedule();void document.fonts.ready.then(schedule)
    return()=>{disposed=true;observer.disconnect();cancelAnimationFrame(frame)}
  },[visual])
  const stage=visual.stages.find(s=>s.id===selected)
  return <>
    <div className="project-visual-viewport" tabIndex={0} aria-label="Process diagram; scroll to read all stages">
      <div ref={ref} className="project-visual-diagram" data-layout={visual.layout} style={{gridTemplateColumns:`repeat(${model.groups.length}, minmax(8.5rem, 1fr))`}}>
        <svg className="project-visual-connectors" width={size.width} height={size.height} aria-hidden>
          <defs><marker id={marker} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 8 4 L 0 8 Z" fill="currentColor" /></marker></defs>
          {connections.map((c,i)=><g key={i}><path d={c.path} fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray={c.kind==='exception'?'4 4':undefined} markerEnd={`url(#${marker})`} />{c.label&&<text x={c.x} y={c.y-9} textAnchor="middle">{c.label}</text>}</g>)}
        </svg>
        {model.groups.map((group,i)=><div className="project-visual-group" key={i}>{group.map(id=>{
          const s=visual.stages.find(n=>n.id===id)!
          const incoming=visual.edges.filter(e=>e.to===id&&e.label).map(e=>e.label).join(' / ')
          return <button type="button" key={id} data-stage={id} data-role={s.role} className="project-visual-stage" aria-controls={panel} aria-expanded={selected===id} onClick={()=>setSelected(selected===id?null:id)}>
            <span className="project-visual-stage-icon"><ProjectVisualIcon name={s.icon} /></span>
            <span>{s.label}</span>
            {incoming&&<span className="project-visual-mobile-condition">{incoming}</span>}
            {s.state!=='present'&&<span className="faint small">{s.state}</span>}
          </button>
        })}</div>)}
      </div>
    </div>
    <p className="small faint project-visual-scroll-hint">Select a stage for its explanation. Scroll the diagram when needed.</p>
    <div id={panel} className="project-visual-inspector" hidden={!stage}>{stage&&<><strong className="small">{stage.label}</strong><p className="small muted">{stage.detail}</p></>}</div>
    <details className="project-visual-relations"><summary className="small">Read all connections</summary><ul>{visual.edges.map((e,i)=><li key={i}>{visual.stages.find(s=>s.id===e.from)!.label} → {visual.stages.find(s=>s.id===e.to)!.label}{e.label&&` · ${e.label}`}{e.kind==='exception'&&' · exception'}</li>)}</ul></details>
  </>
}
