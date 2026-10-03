// Local UI checks use only disposable fictional projects and an isolated database.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { visualFixture } from './lib/project-visual-fixtures.mjs'
import { writeProjectVisual, readProjectVisual, VISUAL_PATH } from '../app/src/lib/project-visuals-core.mjs'
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),app=path.join(repo,'app')
const {chromium}=createRequire(path.join(app,'package.json'))('playwright')
const root=fs.mkdtempSync(path.join(os.tmpdir(),'cc-visual-browser-')),workspace=path.join(root,'workspace')
const arg=process.argv.indexOf('--artifacts'),artifacts=arg<0?null:path.resolve(process.argv[arg+1])
if(artifacts)fs.mkdirSync(artifacts,{recursive:true})
const projectDir=slug=>path.join(workspace,'n8n workflows',slug)
for(const [slug,layout,kind] of [['visual-pipeline','pipeline','automation'],['visual-branch','branching','automation'],['visual-system','system-map','automation'],['visual-audit','pipeline','workflow-audit'],['visual-stale','pipeline','automation'],['visual-invalid','pipeline','automation'],['visual-unsupported','pipeline','automation']]){
 const v=visualFixture(workspace,slug,layout,kind)
 writeProjectVisual(workspace,slug,Buffer.from(JSON.stringify(v)),'missing')
 if(slug==='visual-stale')fs.appendFileSync(path.join(projectDir(slug),'documentation/architecture.md'),'\nChanged source.\n')
 if(slug==='visual-invalid')fs.writeFileSync(path.join(projectDir(slug),VISUAL_PATH),'{broken')
 if(slug==='visual-unsupported'){v.schemaVersion=99;fs.writeFileSync(path.join(projectDir(slug),VISUAL_PATH),JSON.stringify(v))}
}
visualFixture(workspace,'visual-missing')
const malicious=visualFixture(workspace,'visual-injection');malicious.title='<img src=x onerror="window.visualExecuted=true">'
writeProjectVisual(workspace,malicious.projectSlug,Buffer.from(JSON.stringify(malicious)),'missing')
const samples=process.argv.includes('--project-samples')?['crm-ai-customer-engagement','hr-ai-powered-recruitment','finance-automated-invoicing-payment']:[]
for(const slug of samples){
 const source=path.join(repo,'n8n workflows',slug),v=JSON.parse(fs.readFileSync(path.join(source,VISUAL_PATH)))
 for(const rel of new Set(['README.md','AGENTS.md',VISUAL_PATH,...v.sources.map(s=>s.path)])){const file=path.join(projectDir(slug),rel);fs.mkdirSync(path.dirname(file),{recursive:true});fs.copyFileSync(path.join(source,rel),file)}
}
const reserve=http.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r))
const url=`http://127.0.0.1:${port}`;let output='',browser
const child=spawn(process.execPath,[path.join(app,'node_modules/next/dist/bin/next'),'start','-H','127.0.0.1','-p',String(port)],{cwd:app,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,WORKSPACE_ROOT:workspace,WORKFLOW_AUDIT_PRIVATE_ROOT:path.join(root,'private'),DATABASE_PATH:path.join(root,'fixture.db'),CONTROL_CENTER_ENV_FILE:path.join(root,'.env.local'),CONTROL_CENTER_BACKGROUND:'off',CONTROL_CENTER_OFFLINE:'1'}})
child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d)
let checks=0
try{
 let ready=false
 for(let i=0;i<100;i++){try{ready=(await fetch(url+'/api/health')).ok}catch{}if(ready)break;if(child.exitCode!==null)throw Error(output);await new Promise(r=>setTimeout(r,300))}
 assert.ok(ready,output)
 browser=await chromium.launch({headless:true,...(process.env.CONTROL_CENTER_BROWSER_CHANNEL?{channel:process.env.CONTROL_CENTER_BROWSER_CHANNEL}:{})})
 const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[],external=[]
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith(url)&&!r.url().startsWith('data:'))external.push(r.url())})
 const noOverflow=async()=>{assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));checks++}
 for(const width of [1440,768,390,320]){
  await page.setViewportSize({width,height:960});await page.goto(url+'/projects');await page.getByRole('heading',{name:'Projects',exact:true}).waitFor();assert.equal(await page.locator('.project-card .project-visual-preview').count(),0);assert.equal(await page.getByRole('region',{name:'How it works'}).count(),0);checks+=2;await noOverflow()
  for(const slug of ['visual-pipeline','visual-branch','visual-system','visual-audit']){
   await page.goto(url+'/projects/'+slug);const card=page.getByRole('region',{name:'How it works'});await card.locator('summary').filter({hasText:'Explore the process'}).click()
   await card.locator('[data-stage]').first().click();await card.locator('.project-visual-inspector').waitFor({state:'visible'})
   assert.ok(await card.locator('.project-visual-inspector').innerText());checks++
   if(width>640){await page.waitForFunction(()=>document.querySelectorAll('.project-visual-connectors > g').length>0);checks++}
   await card.locator('summary').filter({hasText:'Read all connections'}).click();assert.ok(await card.locator('.project-visual-relations li').count()>=2);checks++
   await noOverflow()
   if(artifacts&&width===390)await page.screenshot({path:path.join(artifacts,slug+'-mobile.png'),fullPage:true})
  }
 }
 await page.setViewportSize({width:1440,height:960});await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'})
 await page.goto(url+'/projects/visual-branch');await page.locator('.project-visual-expanded > summary').click()
 const first=page.locator('[data-stage]').first();await first.focus();await page.keyboard.press('Enter');assert.equal(await first.getAttribute('aria-expanded'),'true');checks++
 await page.evaluate(()=>document.body.style.zoom='2');await noOverflow()
 if(artifacts)await page.screenshot({path:path.join(artifacts,'branch-dark-zoom.png'),fullPage:true})
 await page.evaluate(()=>document.body.style.zoom='1')
 for(const [slug,text] of [['visual-stale','Sources changed since this summary was generated.'],['visual-invalid','The project visual could not be displayed. Ask an agent to check the asset.'],['visual-unsupported','This visual needs a newer supported format.'],['visual-missing','A project visual has not been added yet.']]){await page.goto(url+'/projects/'+slug);await page.getByText(text,{exact:true}).waitFor();checks++}
 await page.goto(url+'/projects/visual-injection');await page.getByText(malicious.title,{exact:true}).waitFor();assert.equal(await page.locator('img[src=x]').count(),0);assert.equal(await page.evaluate(()=>window.visualExecuted),undefined);checks+=2
 const existing=readProjectVisual(workspace,'visual-pipeline');assert.equal(existing.state,'ready')
 const updated={...existing.visual,title:'Updated without an app rebuild'}
 writeProjectVisual(workspace,'visual-pipeline',Buffer.from(JSON.stringify(updated)),existing.revision)
 await page.goto(url+'/projects/visual-pipeline');await page.getByText(updated.title,{exact:true}).waitFor();checks++
 for(const slug of samples){
  for(const width of [1440,390]){await page.setViewportSize({width,height:960});await page.goto(url+'/projects/'+slug);await page.locator('.project-visual-expanded > summary').click();await page.locator('[data-stage]').first().click();await noOverflow();assert.equal(await page.locator('.project-visual-warning').count(),0);checks++
   if(artifacts)await page.screenshot({path:path.join(artifacts,slug+(width===390?'-mobile':'-desktop')+'.png'),fullPage:true})}
 }
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);checks+=2
 const result={state:'passed',checks,layouts:3,viewports:[1440,768,390,320],isolated:true,externalRequests:external.length}
 if(artifacts)fs.writeFileSync(path.join(artifacts,'browser-result.json'),JSON.stringify(result,null,2)+'\n')
 console.log(JSON.stringify(result))
}finally{
 if(browser)await browser.close()
 child.kill();if(child.exitCode===null)await new Promise(r=>{child.once('exit',r);setTimeout(r,5000)})
 // Only remove our verified temporary root, never an owner workspace.
 assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith('cc-visual-browser-'))
 fs.rmSync(root,{recursive:true,force:true})
}
