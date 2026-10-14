// Mounts <KayKavGuide /> under StrictMode (mount → unmount → mount) for scripts to inspect.
import { StrictMode, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { GuideController } from '../src/index';
import { KayKavGuide } from '../src/react';

function App(): React.JSX.Element {
  const ref = useRef<GuideController | null>(null);
  const [face, setFace] = useState<'happy' | null>(null);
  const [taps, setTaps] = useState<string[]>([]);
  (window as unknown as { kk: unknown }).kk = { ref, setFace, taps };
  return (
    <div>
      <KayKavGuide ref={ref} height={420} style={{ width: 340 }} version="pod" face={face} posterBase="/posters/" allowSoftwareGL
        onTap={e => setTaps(t => [...t, e.part])} />
      <p id="taps">{taps.join(',')}</p>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
