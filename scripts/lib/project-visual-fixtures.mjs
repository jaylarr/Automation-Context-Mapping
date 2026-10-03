// Fictional fixtures shared by isolated unit/browser checks, never owner project content.
import fs from 'node:fs'
import path from 'node:path'
import { digest } from '../../app/src/lib/project-visuals-core.mjs'
export function visualFixture(workspace,slug='visual-pipeline',layout='pipeline',kind='automation') {
  const dir = path.join(workspace,'n8n workflows',slug)
  fs.mkdirSync(path.join(dir,'documentation'),{recursive:true})
  fs.writeFileSync(path.join(dir,'README.md'),`# ${slug}\n\n> Fictional visual fixture.\n\n| Status | building |\n`)
  fs.writeFileSync(path.join(dir,'documentation','architecture.md'),'# Architecture\n\nFictional intake, preparation, routing and review.\n')
  let basis='approved-design', sourcePath='documentation/architecture.md'
  if(kind==='workflow-audit') {
    basis='audit-source';const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    fs.mkdirSync(path.join(dir,'sources'),{recursive:true})
    const bytes=JSON.stringify({name:'Fictional system',nodes:[{name:'Receive',type:'n8n-nodes-base.webhook',parameters:{}}],connections:{}})
    fs.writeFileSync(path.join(dir,'sources',id+'.raw.json'),bytes)
    const source={id,file:id+'.raw.json',name:'Fictional system',sha256:digest(bytes),addedAt:'2026-10-03T00:00:00Z',nodeCount:1,nodeTypes:['n8n-nodes-base.webhook'],credentials:[]}
    fs.writeFileSync(path.join(dir,'audit-project.json'),JSON.stringify({schemaVersion:1,kind,id,name:slug,createdAt:source.addedAt,updatedAt:source.addedAt,context:{description:'Fictional source for local checks.',purpose:'Explain the system',client:'',brief:''},sources:[source],versions:[],documents:[]}))
    sourcePath='sources/'+source.file
  }
  const stage=(id,label,role,icon='file')=>({id,label,role,icon,detail:`${label} in the fictional process.`,state:'present',sourceIds:['architecture']})
  let stages=[stage('receive','Receive data','input','form'),stage('prepare','Prepare summary','process','report'),stage('review','Human review','review','review')]
  let edges=[{from:'receive',to:'prepare',kind:'flow'},{from:'prepare',to:'review',kind:'flow'}]
  let preview=['receive','prepare','review']
  if(layout==='branching') {
    stages=[stage('receive','Receive data','input','form'),stage('route','Choose next step','decision','decision'),stage('accept','Record result','output','check'),stage('review','Human review','review','review')]
    edges=[{from:'receive',to:'route',kind:'flow'},{from:'route',to:'accept',kind:'condition',label:'Ready'},{from:'route',to:'review',kind:'condition',label:'Needs review'}];preview=['receive','route']
  } else if(layout==='system-map') {
    stages=[stage('receive','Incoming form','input','form'),stage('prepare','Prepare summary','process','ai'),stage('store','Record in sheet','storage','sheet'),stage('review','Review draft','review','mail')]
    edges=[{from:'receive',to:'prepare',kind:'flow'},{from:'prepare',to:'store',kind:'flow'},{from:'prepare',to:'review',kind:'flow'}]
  }
  return {schemaVersion:1,projectSlug:slug,projectKind:kind,title:'A clear fictional process',summary:'Receive data, prepare a useful result, and leave it ready for review.',layout,basis,generatedAt:'2026-10-03T00:00:00Z',evidence:{level:kind==='automation'?'design':'static',note:'Fictional local fixture; no runtime verification.',recordedAt:null},sources:[{id:'architecture',path:sourcePath,sha256:digest(fs.readFileSync(path.join(dir,sourcePath)))}],preview:{stageIds:preview},stages,edges}
}
