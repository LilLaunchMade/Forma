import { useEffect, useRef, useState } from 'react';
import { StaticCanvas } from 'fabric';
import type { Page } from '../shared/model';
let queue = Promise.resolve();
export function Preview({ page }: { page: Page }) {
  const host = useRef<HTMLDivElement>(null); const [src, setSrc] = useState(page.thumbnail || '');
  useEffect(() => {
    let live = true; const observer = new IntersectionObserver(entries => { if (!entries.some(e => e.isIntersecting)) return; observer.disconnect();
      queue = queue.catch(() => {}).then(async () => { if (!live || page.thumbnail) return; const c = new StaticCanvas(undefined, { width: 320, height: Math.round(320 * page.height / page.width), enableRetinaScaling: false });
        try { await c.loadFromJSON(page.scene); c.setZoom(320 / page.width); c.backgroundColor = page.background === 'transparent' ? '' : page.background; c.renderAll(); const data = c.toDataURL({ format: 'png', multiplier: 1 }); if (live) setSrc(data); } finally { await c.dispose(); }
      });
    }); if (host.current) observer.observe(host.current); return () => { live = false; observer.disconnect(); };
  }, [page]);
  return <div ref={host} className="design-preview checker" style={{ aspectRatio: `${page.width}/${page.height}` }}>{src ? <img src={src} alt="Design preview"/> : <span className="preview-loading">f</span>}</div>;
}
