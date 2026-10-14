import { createGuide, FACES, MODES, paintFaceTile, VERSIONS, type FaceName, type TierSetting, type Version } from '../src/index';
import { VARIANTS } from '../src/variants';

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- typed lookup helper
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);
const canvas = $<HTMLCanvasElement>('guide');

const guide = createGuide(canvas, {
  version: (params.get('v') as Version | null) ?? 'buddy',
  tier: (params.get('tier') as TierSetting | null) ?? 'auto',
  // the published single-file demo inlines the posters; the dev server serves public/posters/
  ...((window as unknown as { __KK_POSTERS?: Partial<Record<Version, string>> }).__KK_POSTERS
    ? { posters: (window as unknown as { __KK_POSTERS: Partial<Record<Version, string>> }).__KK_POSTERS }
    : { posterBase: '/posters/' }),
  // ?soft=1 lets software WebGL (headless CI) run the live tiers
  allowSoftwareGL: params.has('soft')
});
(window as unknown as { guide: typeof guide }).guide = guide;

function segmented<T extends string>(host: HTMLElement, items: readonly T[], label: (t: T) => string, current: NoInfer<T>, pick: (t: T) => void): (t: T) => void {
  const sync = (t: T): void => host.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.k === t)));
  for (const it of items) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = label(it); b.dataset.k = it;
    b.onclick = () => { pick(it); sync(it); };
    host.append(b);
  }
  sync(current);
  return sync;
}

segmented($('versions'), VERSIONS, v => VARIANTS[v].label, guide.version, v => guide.setVersion(v));
const tiers: readonly TierSetting[] = ['auto', 'high', 'medium', 'low'];
segmented($('tiers'), tiers, t => t[0]!.toUpperCase() + t.slice(1), guide.getStats().setting, t => guide.setTier(t));

const modeHost = $('modes');
const syncMode = segmented(modeHost, MODES, m => m[0]!.toUpperCase() + m.slice(1), guide.mode, m => guide.setMode(m));
modeHost.classList.add('row');
modeHost.querySelectorAll('button').forEach(b => b.classList.add('btn'));
guide.on('modechange', e => syncMode(e.mode));

const talk = $<HTMLInputElement>('talk'), talkOut = $<HTMLOutputElement>('talk-out');
talk.oninput = () => { guide.setTalkLevel(+talk.value); talkOut.value = (+talk.value).toFixed(2); };

// a fake streamed reply: thinking, then talking with a level per "chunk"
let streaming = 0;
$('stream').onclick = () => {
  window.clearInterval(streaming);
  guide.setMode('thinking'); syncMode('thinking');
  let n = 0;
  window.setTimeout(() => {
    guide.setMode('talking'); syncMode('talking');
    streaming = window.setInterval(() => {
      const lvl = 0.35 + Math.random() * 0.6;
      guide.setTalkLevel(lvl); talk.value = String(lvl); talkOut.value = lvl.toFixed(2);
      if (++n > 40) { window.clearInterval(streaming); guide.setMode('idle'); syncMode('idle'); guide.showFace('happy', 2500); }
    }, 70);
  }, 1200);
};

$('wave').onclick = () => guide.wave();
$('jump').onclick = () => guide.jump();
$<HTMLInputElement>('follow').onchange = e => guide.setPointerFollow((e.target as HTMLInputElement).checked);
$<HTMLInputElement>('compact').onchange = e => $('stage').classList.toggle('compact', (e.target as HTMLInputElement).checked);

const log = $('log');
guide.on('tap', e => { log.textContent = `Tapped: ${e.part}`; });

// face picker
const faces = $('faces');
for (const [key, name] of FACES) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'tile'; b.dataset.f = key; b.setAttribute('aria-pressed', 'false');
  const c = document.createElement('canvas'); c.width = 176; c.height = 110;
  paintFaceTile(c, key);
  const s = document.createElement('span'); s.textContent = name;
  b.append(c, s);
  b.onclick = () => guide.showFace(key, 6000);
  faces.append(b);
}
const syncFace = (f: FaceName, label: string): void => {
  $('face-now').textContent = '· ' + label;
  faces.querySelectorAll<HTMLElement>('.tile').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.f === f)));
};
guide.on('facechange', e => syncFace(e.face, e.label));
syncFace(guide.face, FACES.find(f => f[0] === guide.face)![1]);

// readout
const rTier = $('r-tier'), rBuf = $('r-buf'), rMs = $('r-ms'), rFps = $('r-fps'), rWhy = $('r-why');
window.setInterval(() => {
  const s = guide.getStats();
  rTier.textContent = s.tier[0]!.toUpperCase() + s.tier.slice(1) + (s.setting === 'auto' ? ' (auto)' : ' (forced)');
  rBuf.textContent = s.bufferWidth ? `${s.bufferWidth} × ${s.bufferHeight}${s.scale < 1 ? ` · ${Math.round(s.scale * 100)}%` : ''}` : 'poster';
  rMs.textContent = s.tier === 'low' ? '–' : `${s.frameMs.toFixed(1)} ms`;
  rFps.textContent = String(s.fps);
  rWhy.textContent = s.reason;
}, 400);
