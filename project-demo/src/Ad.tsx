import React from 'react';
import {AbsoluteFill, Sequence, Html5Audio, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Video} from '@remotion/media';
import cues from './captions.json';

const coral = '#ff6d5a';
const white = '#f5f5f4';
const gray = '#8b8b91';

export const WorkflowMark = ({size = 88}: {size?: number}) => <div style={{width: size, height: size, background: coral, borderRadius: size * 0.24, display: 'grid', placeItems: 'center', boxShadow: `0 12px 60px ${coral}22`}}><svg width={size * 0.65} height={size * 0.65} viewBox="0 0 100 100" fill="none" stroke="white" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round"><rect x="18" y="18" width="27" height="27" rx="6"/><rect x="55" y="55" width="27" height="27" rx="6"/><path d="M31 45v13a10 10 0 0 0 10 10h14"/></svg></div>;

const BrowserDots = () => <div style={{display: 'flex', gap: 8}}>{['#ff6d5a', '#f3bf4f', '#4abe88'].map(color => <div key={color} style={{width: 10, height: 10, borderRadius: '50%', background: color, opacity: 0.7}} />)}</div>;

const Backdrop = () => <AbsoluteFill style={{background: '#0c0c0d', color: white, fontFamily: '"Segoe UI", Arial, sans-serif'}}>
  <AbsoluteFill style={{backgroundImage: 'radial-gradient(ellipse at 85% 15%, #ff6d5a0f, transparent 50%), radial-gradient(ellipse at 0% 100%, #35353866, transparent 50%)'}} />
  <AbsoluteFill style={{opacity: 0.13, backgroundImage: 'linear-gradient(#ffffff13 1px, transparent 1px), linear-gradient(90deg, #ffffff13 1px, transparent 1px)', backgroundSize: '80px 80px'}} />
</AbsoluteFill>;

const Opening = () => {
  const frame = useCurrentFrame();
  const settle = interpolate(frame, [160, 220], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const pieces = [
    {title: 'BROWSER TABS', x: 940, y: 145, angle: -7, delay: 8, lines: ['workflow-editor', 'client-notes', 'another-dashboard'], accent: false},
    {title: 'WORKFLOW EXPORTS', x: 1120, y: 365, angle: 6, delay: 30, lines: ['workflow-final.json', 'workflow-final-v2.json', 'workflow-final-final.json'], accent: true},
    {title: 'ANOTHER AI CHAT', x: 855, y: 625, angle: -4, delay: 55, lines: ['“Here is the project context again...”', 'Client brief. Rules. Decisions.', 'Where did we leave off?'], accent: false},
  ];
  return <AbsoluteFill>
    <div style={{position: 'absolute', top: 78, left: 88, display: 'flex', gap: 18, alignItems: 'center', color: gray, fontSize: 18, fontWeight: 600, letterSpacing: 3}}><WorkflowMark size={36} /> FOR N8N AUTOMATION SPECIALISTS</div>
    <div style={{position: 'absolute', left: 88, top: 235, width: 770}}>
      <div style={{fontSize: 92, fontWeight: 700, lineHeight: 1.05, letterSpacing: -5}}>You automate<br/>everyone else.</div>
      <div style={{marginTop: 42, fontSize: 74, fontWeight: 600, lineHeight: 1.1, letterSpacing: -3, color: coral}}>Why is your work<br/>still scattered?</div>
      <div style={{marginTop: 40, color: '#9a9aa0', fontSize: 26}}>Tabs. Chats. Forgotten exports.</div>
    </div>
    {pieces.map(piece => {
      const progress = interpolate(frame, [piece.delay, piece.delay + 18], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
      return <div key={piece.title} style={{position: 'absolute', left: piece.x, top: piece.y, width: 690, background: '#1b1b1e', border: `1px solid ${piece.accent ? '#ff6d5a55' : '#ffffff20'}`, borderRadius: 20, boxShadow: '0 25px 100px #00000099', opacity: progress * (1 - settle * 0.35), transform: `translateY(${(1 - progress) * 45}px) rotate(${piece.angle * (1 - settle)}deg)`}}>
        <div style={{height: 54, borderBottom: '1px solid #ffffff13', display: 'flex', alignItems: 'center', padding: '0 22px', gap: 20}}><BrowserDots/><span style={{fontSize: 17, letterSpacing: 2, color: gray}}>{piece.title}</span></div>
        <div style={{padding: '24px 28px', fontSize: 24, lineHeight: 1.9, fontFamily: 'Consolas, monospace'}}>{piece.lines.map((line, index) => <div key={line} style={{color: index === 0 ? white : gray}}><span style={{color: coral, marginRight: 16}}>{piece.accent ? '↳' : '›'}</span>{line}</div>)}</div>
      </div>;
    })}
    <div style={{position: 'absolute', left: 88, top: 847, width: 500, height: 2, background: '#ffffff18'}}><div style={{height: '100%', width: `${Math.min(100, frame / 2.4)}%`, background: coral}}/></div>
  </AbsoluteFill>;
};

type ShotProps = {asset: string; number: string; category: string; headline: string; supporting: string; tags: string[]; focus?: {x: number; y: number; scale: number}; titleSize?: number; screenshot?: string};
const ProductShot = ({asset, number, category, headline, supporting, tags, focus, titleSize = 67}: ShotProps) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const fade = interpolate(frame, [0, 8], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const drift = interpolate(frame, [0, durationInFrames], [1, 1.018], {extrapolateRight: 'clamp'});
  return <AbsoluteFill style={{opacity: fade}}>
    <div style={{position: 'absolute', top: 59, left: 72, display: 'flex', alignItems: 'center', gap: 18}}><WorkflowMark size={42}/><span style={{fontSize: 18, fontWeight: 650, letterSpacing: 2.6}}>AUTOMATION CONTEXT MAPPING</span></div>
    <div style={{position: 'absolute', top: 69, right: 76, color: gray, fontSize: 18, letterSpacing: 2}}>WORKSPACE + CONTROL CENTER</div>
    <div style={{position: 'absolute', left: 75, top: 172, width: 415}}>
      <div style={{display: 'flex', gap: 15, alignItems: 'center', fontSize: 17, color: coral, fontWeight: 600, letterSpacing: 2}}><span style={{fontFamily: 'Consolas, monospace', border: `1px solid ${coral}44`, borderRadius: 8, padding: '6px 9px'}}>{number}</span>{category}</div>
      <div style={{fontSize: titleSize, fontWeight: 700, lineHeight: 1.08, letterSpacing: -2.5, marginTop: 32, whiteSpace: 'pre-line'}}>{headline}</div>
      <p style={{fontSize: 24, lineHeight: 1.5, color: '#a7a7ad', marginTop: 28, width: 355}}>{supporting}</p>
      <div style={{display: 'flex', flexDirection: 'column', gap: 13, marginTop: 38}}>{tags.map(tag => <div key={tag} style={{color: '#d5d5d8', display: 'flex', gap: 12, alignItems: 'center', fontSize: 19}}><span style={{color: coral}}>✓</span>{tag}</div>)}</div>
    </div>
    <div style={{position: 'absolute', left: 535, top: 166, width: 1310, height: 786, borderRadius: 18, border: '1px solid #ffffff24', boxShadow: '0 35px 100px #000000bb', overflow: 'hidden', background: '#0c0c0d', transform: `translateY(${(1 - fade) * 16}px)`}}>
      <div style={{height: 48, background: '#202023', borderBottom: '1px solid #ffffff16', display: 'flex', alignItems: 'center', padding: '0 19px', gap: 30}}><BrowserDots/><div style={{flex: 1, textAlign: 'center', color: '#8f8f95', fontSize: 14, letterSpacing: 1}}>CONTROL CENTER / LOCAL WORKSPACE</div><span style={{fontSize: 12, color: '#aeafb4'}}>Illustrative demo data</span></div>
      <div style={{height: 738, width: 1310, overflow: 'hidden', position: 'relative'}}>
        <Video src={staticFile(asset)} muted objectFit="cover" style={{position: 'absolute', width: '100%', height: '100%', transform: `scale(${(focus?.scale ?? 1) * drift})`, transformOrigin: `${focus?.x ?? 50}% ${focus?.y ?? 50}%`}} />
      </div>
    </div>
  </AbsoluteFill>;
};

const Ending = () => {
  const frame = useCurrentFrame();
  const fade = interpolate(frame, [0, 16], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const line = interpolate(frame, [20, 55], [0, 700], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', opacity: fade}}>
    <div style={{position: 'absolute', top: 158}}><WorkflowMark size={130}/></div>
    <div style={{fontSize: 23, color: coral, letterSpacing: 6, marginTop: 20, marginBottom: 24}}>BUILT FOR N8N AUTOMATION SPECIALISTS</div>
    <div style={{fontSize: 90, fontWeight: 700, lineHeight: 1.1, letterSpacing: -3, textAlign: 'center'}}>AUTOMATION<br/>CONTEXT MAPPING</div>
    <div style={{width: line, height: 2, background: `linear-gradient(90deg, transparent, ${coral}, transparent)`, marginTop: 41}}/>
    <div style={{fontSize: 38, color: '#dedee1', marginTop: 33, letterSpacing: -0.5}}>Your workflows. Your context. Your control.</div>
    <div style={{fontSize: 21, color: gray, marginTop: 31}}>Build with context. Deliver with confidence.</div>
  </AbsoluteFill>;
};

const Captions = () => {
  const frame = useCurrentFrame();
  const seconds = frame / 30;
  const cue = cues.find(item => seconds >= item.from && seconds < item.to);
  return cue ? <div style={{position: 'absolute', bottom: 30, left: 110, right: 110, textAlign: 'center'}}><span style={{display: 'inline-block', maxWidth: 1540, color: white, background: '#080809ed', border: '1px solid #ffffff0f', borderRadius: 10, padding: '12px 26px', fontSize: 27, lineHeight: 1.35, boxShadow: '0 5px 25px #0008'}}>{cue.text}</span></div> : null;
};

export const Ad = () => {
  const frame = useCurrentFrame();
  const segments: {start: number; duration: number; props: ShotProps}[] = [
    {start: 8, duration: 7, props: {asset: 'recordings/01-dashboard.mp4', number: '01', category: 'MEET YOUR WORKSPACE', headline: 'One place.\nConnected\nwork.', supporting: 'A workspace and Control Center for the work behind your automations.', tags: ['Project context', 'Workflow visibility', 'Local-first control']}},
    {start: 15, duration: 10, props: {asset: 'recordings/02-context.mp4', number: '02', category: 'BUILD WITH CONTEXT', headline: 'Stop\nexplaining.\nStart building.', supporting: 'Give your AI assistant the brief, rules and decisions from the first prompt.', tags: ['Client brief', 'Project rules', 'Copy kickoff prompt'], titleSize: 65}},
    {start: 25, duration: 3, props: {asset: 'recordings/03-instances.mp4', number: '03', category: 'SEE ACROSS INSTANCES', headline: 'Many servers.\nOne command\ncenter.', supporting: 'Switch your view. Keep the whole picture.', tags: ['One dashboard', 'Separate instance history']}},
    {start: 28, duration: 4, props: {asset: 'recordings/04-failures.mp4', number: '03', category: 'INVESTIGATE QUICKLY', headline: 'Find the run.\nSee what\nhappened.', supporting: 'Go from a failure on the chart to the details that explain it.', tags: ['Filtered executions', 'Selected output values']}},
    {start: 32, duration: 4, props: {asset: 'recordings/05-alerts.mp4', number: '03', category: 'NOTICE THE SILENCE', headline: 'Even silence\ncan be a\nwarning.', supporting: 'See repeated failures and missed-success alerts in your dashboard.', tags: ['Failure thresholds', 'Expected success window']}},
    {start: 36, duration: 3, props: {asset: 'recordings/06-changes.mp4', number: '04', category: 'KEEP CHANGES VISIBLE', headline: 'Know what\nchanged.', supporting: 'See what is new, changed in n8n, or up to date with its saved export.', tags: ['New', 'Changed in n8n', 'Up to date']}},
    {start: 39, duration: 3, props: {asset: 'recordings/07-schedule.mp4', number: '04', category: 'PRESERVE YOUR WORK', headline: 'Give your\nworkflows a\nsave button.', supporting: 'Schedule exports for workflows already imported into a project.', tags: ['Scheduled workflow exports', 'Separate project repositories'], titleSize: 63}},
    {start: 42, duration: 2, props: {asset: 'recordings/08-versions.mp4', number: '04', category: 'REVIEW PENDING CHANGES', headline: 'Keep versions\nin view.', supporting: 'Make uncommitted changes and backup status visible.', tags: ['Project Git status', 'Review before committing']}},
    {start: 44, duration: 3, props: {asset: 'recordings/09-restore.mp4', number: '04', category: 'RESTORE WITH REVIEW', headline: 'Review first.\nRestore with\nconfidence.', supporting: 'Choose the installation and inspect the preview before confirming.', tags: ['Selected target', 'Reference checks', 'Explicit confirmation'], titleSize: 62}},
    {start: 47, duration: 2, props: {asset: 'recordings/10-projects.mp4', number: '05', category: 'DELIVER CONNECTED WORK', headline: 'From brief\nto confident\nhandover.', supporting: 'Give every client project a clear home, from first request to delivery.', tags: ['Client brief', 'Workflow exports', 'Delivery documentation']}},
    {start: 49, duration: 3, props: {asset: 'recordings/11-handover.mp4', number: '05', category: 'BUILD. REVIEW. DELIVER.', headline: 'Keep the\nwhole project\nconnected.', supporting: 'Documentation and operating guides stay alongside the work.', tags: ['Specs and decisions', 'Test evidence', 'Handover guide']}},
  ];
  return <AbsoluteFill style={{color: white, fontFamily: '"Segoe UI", Arial, sans-serif'}}>
    <Backdrop/>
    <Html5Audio src={staticFile('audio/narration.wav')} />
    <Sequence from={0} durationInFrames={240}><Opening/></Sequence>
    {segments.map(segment => <Sequence key={segment.start} from={segment.start * 30} durationInFrames={segment.duration * 30}><ProductShot {...segment.props}/></Sequence>)}
    <Sequence from={52 * 30} durationInFrames={240}><Ending/></Sequence>
    <Captions/>
    <div style={{position: 'absolute', bottom: 0, left: 0, height: 3, width: `${frame / 1799 * 100}%`, background: coral, opacity: 0.75}}/>
  </AbsoluteFill>;
};

export {cues};
