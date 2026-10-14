// Thin React wrapper. A client component: it renders an empty box on the server and
// mounts the guide in an effect. Built output starts with 'use client' (see vite.config.ts).
import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type CSSProperties } from 'react';
import { createGuide, type FaceName, type GuideController, type GuideEvents, type GuideOptions } from './index';

export interface KayKavGuideProps extends GuideOptions {
  /** hold an expression (until changed or set to null) */
  face?: FaceName | null;
  /** how long `face` shows, ms; default holds it */
  faceMs?: number;
  /** 0..1, update as reply text streams in */
  talkLevel?: number;
  /** gaze, x and y in −1..1 */
  lookAt?: readonly [number, number] | null;
  onTap?: (e: GuideEvents['tap']) => void;
  onTierChange?: (e: GuideEvents['tierchange']) => void;
  onFaceChange?: (e: GuideEvents['facechange']) => void;
  onModeChange?: (e: GuideEvents['modechange']) => void;
  /** box size; the canvas fills it and never exceeds 500 CSS px tall */
  className?: string;
  style?: CSSProperties;
  height?: number | string;
}

/** The guide on a canvas that fills this box. Give the box a size (≤ 500 px tall). */
export const KayKavGuide = forwardRef<GuideController | null, KayKavGuideProps>(function KayKavGuide(props, ref) {
  const { className, style, height, face, faceMs, talkLevel, lookAt, version, mode, tier, pointerFollow } = props;
  const box = useRef<HTMLDivElement>(null);
  const [guide, setGuide] = useState<GuideController | null>(null);
  const cb = useRef(props);
  cb.current = props;

  // options that need a fresh instance; everything else is applied live below
  const { posterBase, maxBufferHeight, allowSoftwareGL, label, tapReactions, sleepAfter } = props;
  const postersKey = JSON.stringify(props.posters ?? null);

  useEffect(() => {
    const host = box.current;
    if (!host) return;
    // a new canvas per instance: destroy() releases the GL context, which a reused canvas could not get back
    const canvas = document.createElement('canvas');
    Object.assign(canvas.style, { display: 'block', width: '100%', height: '100%' });
    host.prepend(canvas);
    const p = cb.current;
    const opts: GuideOptions = {};
    if (p.version) opts.version = p.version;
    if (p.mode) opts.mode = p.mode;
    if (p.tier) opts.tier = p.tier;
    if (p.pointerFollow !== undefined) opts.pointerFollow = p.pointerFollow;
    if (tapReactions !== undefined) opts.tapReactions = tapReactions;
    if (sleepAfter !== undefined) opts.sleepAfter = sleepAfter;
    if (label !== undefined) opts.label = label;
    if (posterBase !== undefined) opts.posterBase = posterBase;
    if (p.posters) opts.posters = p.posters;
    if (maxBufferHeight !== undefined) opts.maxBufferHeight = maxBufferHeight;
    if (allowSoftwareGL !== undefined) opts.allowSoftwareGL = allowSoftwareGL;
    const g = createGuide(canvas, opts);
    const offs = [
      g.on('tap', e => cb.current.onTap?.(e)),
      g.on('tierchange', e => cb.current.onTierChange?.(e)),
      g.on('facechange', e => cb.current.onFaceChange?.(e)),
      g.on('modechange', e => cb.current.onModeChange?.(e))
    ];
    setGuide(g);
    return () => { offs.forEach(off => off()); g.destroy(); canvas.remove(); setGuide(null); };
  }, [posterBase, postersKey, maxBufferHeight, allowSoftwareGL, label, tapReactions, sleepAfter]);

  useImperativeHandle(ref, () => guide as GuideController, [guide]);

  useEffect(() => { if (guide && version) guide.setVersion(version); }, [guide, version]);
  useEffect(() => { if (guide && mode) guide.setMode(mode); }, [guide, mode]);
  useEffect(() => { if (guide && tier) guide.setTier(tier); }, [guide, tier]);
  useEffect(() => { if (guide && pointerFollow !== undefined) guide.setPointerFollow(pointerFollow); }, [guide, pointerFollow]);
  useEffect(() => { if (guide && talkLevel !== undefined) guide.setTalkLevel(talkLevel); }, [guide, talkLevel]);
  useEffect(() => {
    if (!guide || face === undefined) return;
    if (face === null) guide.clearFace(); else guide.showFace(face, faceMs ?? Infinity);
  }, [guide, face, faceMs]);
  const lx = lookAt?.[0], ly = lookAt?.[1];
  useEffect(() => { if (guide && lx !== undefined && ly !== undefined) guide.lookAt(lx, ly); }, [guide, lx, ly]);

  const boxStyle: CSSProperties = { position: 'relative', maxHeight: 500, ...(height !== undefined ? { height } : null), ...style };
  return <div ref={box} className={className} style={boxStyle} />;
});
