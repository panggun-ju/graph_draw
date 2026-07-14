(function () {
  'use strict';

  const MAX_DIM = 384;
  const RDP_EPS = 0.8;
  const RDP_EPS_MERGE = 1.5;  // merge 켤 때 더 강한 간결화
  const BATCH_SIZE = 20;
  const LINE_COLOR = '#2d2d2d';
  const EDGE_THRESH = 0.4;
  const MIN_CONTOUR = 10;

  const fileInput = document.getElementById('file-input');
  const uploadBtn = document.getElementById('upload-btn');
  const previewArea = document.getElementById('preview-area');
  const statusEl = document.getElementById('status');
  const controlsEl = document.getElementById('controls');
  const clearBtn = document.getElementById('clear-btn');
  const graphEl = document.getElementById('graph-container');

  let calculator = null;
  let lastImage = null;

  function init() {
    calculator = Desmos.Calculator(graphEl, {
      expressions: true,
      graphpaper: true,
      border: false,
      settingsMenu: true,
      zoomButtons: true,
      showResetButtonOnGraphpaper: true,
    });
    calculator.setMathBounds({ left: -12, right: 12, bottom: -12, top: 12 });
    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', onFileSelected);
    clearBtn.addEventListener('click', clearAll);

    const mergeToggle = document.getElementById('merge-toggle');
    if (mergeToggle) {
      mergeToggle.addEventListener('change', () => {
        if (lastImage) {
          setStatus('Re-processing (merge: ' + mergeToggle.checked + ')...');
          const result = processImage(lastImage);
          animateGraph(result.items, result.bounds);
          setStatus('Done \u2014 ' + result.items.length + ' curves');
        }
      });
    }
  }

  function setStatus(msg) { statusEl.textContent = msg; }

  async function onFileSelected(e) {
    const file = e.target.files[0];
    if (!file) return;
    setStatus('Loading image...');
    const img = await loadImage(file);
    lastImage = img;
    showPreview(img);
    setStatus('Processing...');
    await tick();
    const result = processImage(img);
    setStatus('Drawing...');
    await animateGraph(result.items, result.bounds);
    setStatus('Done \u2014 ' + result.items.length + ' curves');
    controlsEl.style.display = 'flex';
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = reader.result;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  function showPreview(img) {
    const old = previewArea.querySelector('img');
    if (old) old.remove();
    const span = previewArea.querySelector('.placeholder');
    if (span) span.remove();
    const clone = new Image();
    clone.src = img.src;
    clone.style.maxWidth = '100%';
    clone.style.maxHeight = '240px';
    clone.style.objectFit = 'contain';
    previewArea.appendChild(clone);
  }

  function tick() { return new Promise(r => setTimeout(r, 0)); }

  function clearAll() {
    calculator.setBlank();
    calculator.setMathBounds({ left: -12, right: 12, bottom: -12, top: 12 });
    setStatus('Ready');
    controlsEl.style.display = 'none';
    previewArea.innerHTML = '<span class="placeholder">이미지를 업로드하세요</span>';
    fileInput.value = '';
  }

  // ═══════════════════════════════════════════════════════════════
  //  IMAGE PROCESSING
  // ═══════════════════════════════════════════════════════════════

  function processImage(img) {
    const { w, h } = fitDim(img.width, img.height, MAX_DIM);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    const px = ctx.getImageData(0, 0, w, h);

    const mag = sobelRGB(px, w, h);
    const bin = thresholdEdges(mag, w, h);
    const contours = traceAllContours(bin, w, h);

    const mergeEnabled = document.getElementById('merge-toggle')?.checked ?? true;
    const eps = mergeEnabled ? RDP_EPS_MERGE : RDP_EPS;

    // merge 켜면 RDP epsilon만 더 크게 — stroke 보존, 수식만 간결화
    const simplified = contours
      .filter(c => c.length >= MIN_CONTOUR)
      .map(c => rdpSimplify(c, eps))
      .filter(c => c.length >= 2);

    console.log('[pipeline] contours:', contours.length, 'eps:', eps, 'after rdp:', simplified.length);
    return contoursToExpressions(simplified, w, h);
  }

  function fitDim(iw, ih, max) {
    const s = max / Math.max(iw, ih);
    return { w: Math.round(iw * s), h: Math.round(ih * s) };
  }

  function sobelRGB(px, w, h) {
    const d = px.data;
    const mag = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const b = (y * w + x) * 4;
        let maxG = 0;
        for (let c = 0; c < 3; c++) {
          const p1 = d[b-4+c], p2 = d[b+4+c];
          const p3 = d[b-w*4+c], p4 = d[b+w*4+c];
          const p5 = d[b-w*4-4+c], p6 = d[b-w*4+4+c];
          const p7 = d[b+w*4-4+c], p8 = d[b+w*4+4+c];
          const gx = -p5+p6-2*p1+2*p2-p7+p8;
          const gy = -p5-2*p3-p6+p7+2*p4+p8;
          const g = gx*gx + gy*gy;
          if (g > maxG) maxG = g;
        }
        mag[y*w+x] = Math.sqrt(maxG);
      }
    }
    return mag;
  }

  function thresholdEdges(mag, w, h) {
    const bin = new Uint8Array(w * h);
    let maxMag = 0;
    for (let i = w+1; i < w*h-w-1; i++) {
      if (mag[i] > maxMag) maxMag = mag[i];
    }
    const threshold = maxMag * EDGE_THRESH;
    for (let i = 0; i < mag.length; i++) {
      bin[i] = mag[i] >= threshold ? 1 : 0;
    }
    return bin;
  }

  // ═══════════════════════════════════════════════════════════════
  //  CONTOUR TRACING
  // ═══════════════════════════════════════════════════════════════

  const DIRS = [[1,0],[1,-1],[0,-1],[-1,-1],[-1,0],[-1,1],[0,1],[1,1]];

  function traceAllContours(bin, w, h) {
    const visited = new Uint8Array(w * h);
    const contours = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y*w+x;
        if (bin[idx] !== 1 || visited[idx]) continue;
        let onBoundary = false;
        for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const nx = x+dx, ny = y+dy;
          if (nx<0||nx>=w||ny<0||ny>=h||bin[ny*w+nx]===0) { onBoundary=true; break; }
        }
        if (!onBoundary) continue;
        const contour = traceOneContour(bin, w, h, x, y, visited);
        if (contour.length >= 4) contours.push(contour);
      }
    }
    return contours;
  }

  function traceOneContour(bin, w, h, sx, sy, visited) {
    const points = [];
    let dir = 0;
    for (let d = 0; d < 8; d++) {
      const nx = sx+DIRS[d][0], ny = sy+DIRS[d][1];
      if (nx>=0&&nx<w&&ny>=0&&ny<h&&bin[ny*w+nx]===0) { dir=(d+4)%8; break; }
    }
    let cx=sx, cy=sy;
    visited[cy*w+cx] = 1;
    for (let step = 0; step < w*h*4; step++) {
      points.push({x:cx, y:cy});
      let found = false;
      for (let i = 0; i < 8; i++) {
        const cd = (dir+5+i)%8;
        const nx = cx+DIRS[cd][0], ny = cy+DIRS[cd][1];
        if (nx<0||nx>=w||ny<0||ny>=h) continue;
        if (bin[ny*w+nx]===0) continue;
        cx=nx; cy=ny; visited[cy*w+cx]=1; dir=cd; found=true; break;
      }
      if (!found) break;
      if (cx===sx&&cy===sy&&points.length>1) break;
    }
    return points;
  }

  // ═══════════════════════════════════════════════════════════════
  //  SKELETONIZATION (Zhang-Suen on each contour's bounding box)
  // ═══════════════════════════════════════════════════════════════

  function skeletonizeAll(contours, imgW, imgH) {
    const paths = [];
    for (const contour of contours) {
      if (contour.length < MIN_CONTOUR) { paths.push(contour); continue; }
      const skel = skeletonizeOne(contour);
      if (skel && skel.length >= MIN_CONTOUR) {
        paths.push(...skel);
      } else {
        paths.push(contour);
      }
    }
    return paths;
  }

  function skeletonizeOne(contour) {
    let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
    for (const p of contour) {
      minX=Math.min(minX,p.x); minY=Math.min(minY,p.y);
      maxX=Math.max(maxX,p.x); maxY=Math.max(maxY,p.y);
    }
    const pad = 2;
    const w = maxX-minX+1+pad*2;
    const h = maxY-minY+1+pad*2;

    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(contour[0].x-minX+pad, contour[0].y-minY+pad);
    for (let i = 1; i < contour.length; i++) {
      ctx.lineTo(contour[i].x-minX+pad, contour[i].y-minY+pad);
    }
    ctx.closePath();
    ctx.fill();

    const imgData = ctx.getImageData(0,0,w,h);
    const mask = new Uint8Array(w*h);
    for (let i = 0; i < mask.length; i++) mask[i] = imgData.data[i*4+3]>0?1:0;

    zhangSuen(mask, w, h);
    return traceSkeletonChains(mask, w, h, minX, minY, pad);
  }

  function zhangSuen(mask, w, h) {
    let changed = true;
    while (changed) {
      changed = false;
      for (let pass = 0; pass < 2; pass++) {
        const remove = [];
        for (let y = 1; y < h-1; y++) {
          for (let x = 1; x < w-1; x++) {
            const idx = y*w+x;
            if (mask[idx]===0) continue;
            const n = [
              mask[(y-1)*w+x], mask[(y-1)*w+x+1], mask[y*w+x+1], mask[(y+1)*w+x+1],
              mask[(y+1)*w+x], mask[(y+1)*w+x-1], mask[y*w+x-1], mask[(y-1)*w+x-1]
            ];
            const count = n.reduce((s,v)=>s+v,0);
            let trans = 0;
            for (let i = 0; i < 8; i++) { if (n[i]===0&&n[(i+1)%8]===1) trans++; }
            const cond = pass===0
              ? n[0]*n[2]*n[4]===0 && n[2]*n[4]*n[6]===0
              : n[0]*n[2]*n[6]===0 && n[0]*n[4]*n[6]===0;
            if (count>=2 && count<=6 && trans===1 && cond) remove.push(idx);
          }
        }
        if (remove.length > 0) changed = true;
        for (const idx of remove) mask[idx] = 0;
      }
    }
  }

  function traceSkeletonChains(mask, w, h, ox, oy, pad) {
    const seen = new Set();
    const chains = [];

    function getNeighbors(idx) {
      const x = idx%w, y = Math.floor(idx/w);
      const result = [];
      for (const [dx,dy] of DIRS) {
        const nx=x+dx, ny=y+dy;
        if (nx>=0&&nx<w&&ny>=0&&ny<h&&mask[ny*w+nx]===1) result.push(ny*w+nx);
      }
      return result;
    }

    function isEndpoint(idx) {
      const nb = getNeighbors(idx);
      return nb.length === 1 || nb.length >= 3;
    }

    for (let idx = 0; idx < mask.length; idx++) {
      if (mask[idx]===0 || seen.has(idx)) continue;
      const nb = getNeighbors(idx);
      if (nb.length !== 1 && nb.length !== 3) continue;

      for (const next of nb) {
        if (seen.has(idx) && seen.has(next)) continue;
        const chain = [idx];
        let prev = idx, cur = next;
        while (true) {
          seen.add(prev+'-'+cur);
          chain.push(cur);
          const opts = getNeighbors(cur).filter(n => n !== prev);
          if (opts.length !== 1) break;
          prev = cur; cur = opts[0];
          if (seen.has(prev+'-'+cur)) break;
        }
        if (chain.length >= MIN_CONTOUR) {
          chains.push(chain.map(i => ({x: (i%w)+ox-pad, y: Math.floor(i/w)+oy-pad})));
        }
      }
    }

    if (chains.length === 0) {
      for (let idx = 0; idx < mask.length; idx++) {
        if (mask[idx]===0 || seen.has(idx)) continue;
        const chain = [idx];
        let prev = -1, cur = idx;
        while (true) {
          seen.add(cur);
          const nb = getNeighbors(cur).filter(n => n !== prev && !seen.has(n));
          if (nb.length === 0) break;
          prev = cur; cur = nb[0];
          chain.push(cur);
        }
        if (chain.length >= MIN_CONTOUR) {
          chains.push(chain.map(i => ({x: (i%w)+ox-pad, y: Math.floor(i/w)+oy-pad})));
        }
      }
    }

    return chains;
  }

  // ═══════════════════════════════════════════════════════════════
  //  CONVERT CONTOURS TO DESMOS EXPRESSIONS
  // ═══════════════════════════════════════════════════════════════

  function contoursToExpressions(contours, imgW, imgH) {
    const scale = Math.max(imgW, imgH) / 20;
    const ox = imgW / 2, oy = imgH / 2;

    // Convert to Desmos coordinates - keep as point lists
    const items = contours.map(points => {
      return points.map(p => ({
        x: (p.x - ox) / scale,
        y: -(p.y - oy) / scale,
      }));
    });

    // Compute bounds from all points
    const bounds = computeBoundsFromPoints(items);

    return { items, bounds };
  }

  // ═══════════════════════════════════════════════════════════════
  //  RDP SIMPLIFICATION
  // ═══════════════════════════════════════════════════════════════

  function rdpSimplify(points, eps) {
    if (points.length <= 2) return points.slice();
    
    let maxDist = 0, maxIdx = 0;
    const a = points[0];
    const b = points[points.length - 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    
    for (let i = 1; i < points.length - 1; i++) {
      let dist;
      if (lenSq === 0) {
        dist = Math.hypot(points[i].x - a.x, points[i].y - a.y);
      } else {
        const t = Math.max(0, Math.min(1,
          ((points[i].x - a.x) * dx + (points[i].y - a.y) * dy) / lenSq));
        const px = a.x + t * dx;
        const py = a.y + t * dy;
        dist = Math.hypot(points[i].x - px, points[i].y - py);
      }
      if (dist > maxDist) {
        maxDist = dist;
        maxIdx = i;
      }
    }
    
    if (maxDist > eps) {
      const left = rdpSimplify(points.slice(0, maxIdx + 1), eps);
      const right = rdpSimplify(points.slice(maxIdx), eps);
      return left.slice(0, -1).concat(right);
    }
    
    return [a, b];
  }

  // ═══════════════════════════════════════════════════════════════
  //  DESMOS EXPRESSION GENERATION
  // ═══════════════════════════════════════════════════════════════

  function pointsToListLatex(points) {
    if (!points || points.length < 2) return null;

    const fmt = (v) => {
      return Math.round(v * 1000) / 1000;
    };

    // 항을 부호에 맞게 안전하게 합치는 헬퍼 함수
    const buildExpr = (a, b, c, d) => {
      let expr = `${fmt(a)}t^3`;
      if (b >= 0) expr += `+${fmt(b)}t^2`;
      else expr += `${fmt(b)}t^2`;
      if (c >= 0) expr += `+${fmt(c)}t`;
      else expr += `${fmt(c)}t`;
      if (d >= 0) expr += `+${fmt(d)}`;
      else expr += `${fmt(d)}`;
      return expr;
    };

    // 2점만 있으면 선형
    if (points.length === 2) {
      const x0 = fmt(points[0].x), y0 = fmt(points[0].y);
      const dx = points[1].x - points[0].x;
      const dy = points[1].y - points[0].y;
      const xExpr = `${x0}${dx >= 0 ? '+' : ''}${fmt(dx)}t`;
      const yExpr = `${y0}${dy >= 0 ? '+' : ''}${fmt(dy)}t`;
      return [`(${xExpr},${yExpr})\\left\\{0\\le t\\le1\\right\\}`];
    }

    // Catmull-Rom 스플라인 곡선 생성
    const segs = [];
    for (let i = 0; i < points.length - 1; i++) {
      // 4개 제어점: P0, P1, P2, P3
      // P1, P2가 현재 세그먼트의 시작과 끝
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];

      // Catmull-Rom -> Cubic Bezier 계수
      // q(t) = 0.5 * ((2*P1) + (-P0 + P2)*t + (2*P0 - 5*P1 + 4*P2 - P3)*t^2 + (-P0 + 3*P1 - 3*P2 + P3)*t^3)
      const ax = 0.5 * (-p0.x + 3*p1.x - 3*p2.x + p3.x);
      const bx = 0.5 * (2*p0.x - 5*p1.x + 4*p2.x - p3.x);
      const cx = 0.5 * (-p0.x + p2.x);
      const dx = p1.x;

      const ay = 0.5 * (-p0.y + 3*p1.y - 3*p2.y + p3.y);
      const by = 0.5 * (2*p0.y - 5*p1.y + 4*p2.y - p3.y);
      const cy = 0.5 * (-p0.y + p2.y);
      const dy = p1.y;

      // 안전하게 부호가 정리된 수식 생성
      const xExpr = buildExpr(ax, bx, cx, dx);
      const yExpr = buildExpr(ay, by, cy, dy);
      // Desmos parametric domain restriction: (x,y)\{condition\}
      segs.push(`(${xExpr},${yExpr})\\left\\{0\\le t\\le1\\right\\}`);
    }
    return segs;
  }

  function computeBoundsFromPoints(items) {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    
    for (const points of items) {
      for (const p of points) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
    }
    
    // Add padding
    const padX = (maxX - minX) * 0.1;
    const padY = (maxY - minY) * 0.1;
    const pad = Math.max(padX, padY, 1);
    
    return {
      left: minX - pad,
      right: maxX + pad,
      bottom: minY - pad,
      top: maxY + pad
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  DESMOS ANIMATION
  // ═══════════════════════════════════════════════════════════════

  async function animateGraph(items, bounds) {
    calculator.setBlank();
    
    if (!items || items.length === 0) {
      setStatus('No curves found');
      return;
    }
    
    calculator.setMathBounds(bounds);
    await new Promise(r => setTimeout(r, 100));
    
    // 1. Compute ALL latex expressions upfront
    const allExpressions = [];
    let exprIdx = 0;
    for (let i = 0; i < items.length; i++) {
      const segs = pointsToListLatex(items[i]);
      if (segs) {
        for (const seg of segs) {
          allExpressions.push({
            id: `seg_${exprIdx}`,
            latex: seg,
            color: LINE_COLOR,
            lineWidth: "2",
            lineStyle: "SOLID",
            hidden: false
          });
          exprIdx++;
        }
      }
    }
    
    // 2. Add one-by-one, yielding so the browser can render
    const total = allExpressions.length;
    
    for (let i = 0; i < total; i++) {
      calculator.setExpression(allExpressions[i]);
      if ((i + 1) % 50 === 0 || i === total - 1) {
        setStatus(`Drawing... ${i + 1}/${total}`);
      }
      // yield to browser for rendering, then scroll
      if (i % 5 === 0) {
        await new Promise(r => {
          requestAnimationFrame(() => {
            scrollExprListToBottom();
            r();
          });
        });
      }
    }
    
    setStatus(`Done! ${total} curves`);
  }

  function scrollExprListToBottom() {
    // Find the leftmost scrollable panel (expression list is on the left in desmos)
    const all = document.querySelectorAll('*');
    let target = null;
    let maxScroll = 0;
    for (const el of all) {
      if (el.scrollHeight > el.clientHeight + 5) {
        const scrollRatio = el.scrollHeight / el.clientHeight;
        if (scrollRatio > maxScroll) {
          maxScroll = scrollRatio;
          target = el;
        }
      }
    }
    if (target) {
      // Double-rAF to ensure after paint
      requestAnimationFrame(() => {
        target.scrollTop = target.scrollHeight;
        requestAnimationFrame(() => {
          target.scrollTop = target.scrollHeight;
        });
      });
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();