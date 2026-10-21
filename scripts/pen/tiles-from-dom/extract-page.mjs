// @ts-nocheck — runs inside the browser through `page.evaluate`, so it is plain DOM code
// that Playwright serialises; it may close over nothing outside itself.
//
// Walks one rendered story and returns what it paints as flat drawing operations, in
// the captured screenshot's coordinates: the whole page for a full-page story, the
// capture target's box for any other. Every operation carries exactly one colour (`c`,
// `[r, g, b, a]`) so that the light and the dark render of a story can be paired one
// operation to the other, and each pair named by the design token whose light and
// dark values both match.
//
// What it draws: backgrounds and borders (a uniform border on a rounded box as one
// stroke, any other side as its own rectangle), every text node one line box at a
// time, SVG shapes in screen space, the hatch of a repeating 45° gradient, a select's
// chosen option and chevron, and a radio or checkbox. Pseudo-elements are swapped for
// real spans first so their boxes can be measured. An <img> and any other gradient are
// reported (`t: 'img'`, `t: 'g'`) rather than drawn.

/** @param {{ fullPage: boolean, target: string }} options */
export function extractPage({ fullPage, target }) {
  const ops = [];
  const root = document.querySelector(target) || document.body;
  const hide = document.createElement('style');
  hide.textContent =
    '[data-pz-before]::before,[data-pz-after]::after{content:none!important}';
  const swaps = [];
  root.querySelectorAll('*').forEach((el) => {
    if (el instanceof SVGElement) return;
    for (const p of ['before', 'after']) {
      const s = getComputedStyle(el, `::${p}`);
      if (
        !s.content ||
        s.content === 'none' ||
        s.content === 'normal' ||
        s.display === 'none'
      )
        continue;
      const span = document.createElement('span');
      for (const prop of s) span.style.setProperty(prop, s.getPropertyValue(prop));
      const lit = s.content.match(/^"(.*)"$/);
      if (lit)
        span.textContent = lit[1].replace(/\\([0-9a-f]{1,6}) ?/gi, (_, h) =>
          String.fromCodePoint(parseInt(h, 16)),
        );
      swaps.push([el, p, span]);
    }
  });
  for (const [el, p, span] of swaps) {
    el.setAttribute(`data-pz-${p}`, '');
    if (p === 'before') el.prepend(span);
    else el.append(span);
  }
  document.head.append(hide);
  const parseColor = (s) => {
    if (!s || s === 'transparent') return null;
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1]
      .split(/[ ,/]+/)
      .filter(Boolean)
      .map(Number);
    const a = p.length > 3 ? p[3] : 1;
    return a > 0.001 ? [p[0], p[1], p[2], a] : null;
  };
  const ascentCache = new Map();
  const cv = document.createElement('canvas').getContext('2d');
  const ascent = (cs) => {
    const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    if (!ascentCache.has(font)) {
      cv.font = font;
      ascentCache.set(font, cv.measureText('Hg').fontBoundingBoxAscent);
    }
    return ascentCache.get(font);
  };
  const rootBox = root.getBoundingClientRect();
  const sx = fullPage ? window.scrollX : -rootBox.left;
  const sy = fullPage ? window.scrollY : -rootBox.top;
  const clipOf = new Map();
  const inter = (a, b) => {
    if (!a) return b;
    if (!b) return a;
    const x0 = Math.max(a[0], b[0]),
      y0 = Math.max(a[1], b[1]);
    const x1 = Math.min(a[2], b[2]),
      y1 = Math.min(a[3], b[3]);
    return [x0, y0, Math.max(x0, x1), Math.max(y0, y1)];
  };
  const clipFor = (el) => {
    if (!el || el === document.documentElement) return null;
    if (clipOf.has(el)) return clipOf.get(el);
    let c = clipFor(el.parentElement);
    const cs = getComputedStyle(el);
    if (
      cs.overflowX !== 'visible' ||
      cs.overflowY !== 'visible' ||
      cs.clipPath !== 'none'
    ) {
      const r = el.getBoundingClientRect();
      c = inter(c, [r.left + sx, r.top + sy, r.right + sx, r.bottom + sy]);
    }
    clipOf.set(el, c);
    return c;
  };
  const opacityOf = new Map();
  const opac = (el) => {
    if (!el || el === document.documentElement) return 1;
    if (opacityOf.has(el)) return opacityOf.get(el);
    const v = Number(getComputedStyle(el).opacity) * opac(el.parentElement);
    opacityOf.set(el, v);
    return v;
  };
  const visible = (el, cs) =>
    cs.display !== 'none' && cs.visibility !== 'hidden' && opac(el) > 0.001;
  const clipRect = (x, y, w, h, c) => {
    if (!c) return [x, y, w, h];
    const x0 = Math.max(x, c[0]),
      y0 = Math.max(y, c[1]);
    const x1 = Math.min(x + w, c[2]),
      y1 = Math.min(y + h, c[3]);
    return x1 - x0 > 0.01 && y1 - y0 > 0.01 ? [x0, y0, x1 - x0, y1 - y0] : null;
  };
  const withAlpha = (c, o) => (c ? [c[0], c[1], c[2], c[3] * o] : null);

  const clipPoly = (poly, [x0, y0, x1, y1]) => {
    const edges = [
      [
        (p) => p[0] >= x0,
        (a, b) => [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])],
      ],
      [
        (p) => p[0] <= x1,
        (a, b) => [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])],
      ],
      [
        (p) => p[1] >= y0,
        (a, b) => [a[0] + ((b[0] - a[0]) * (y0 - a[1])) / (b[1] - a[1]), y0],
      ],
      [
        (p) => p[1] <= y1,
        (a, b) => [a[0] + ((b[0] - a[0]) * (y1 - a[1])) / (b[1] - a[1]), y1],
      ],
    ];
    for (const [inside, cut] of edges) {
      const out = [];
      poly.forEach((p, i) => {
        const q = poly[(i + poly.length - 1) % poly.length];
        if (inside(p)) {
          if (!inside(q)) out.push(cut(q, p));
          out.push(p);
        } else if (inside(q)) out.push(cut(q, p));
      });
      poly = out;
      if (!poly.length) break;
    }
    return poly;
  };
  const stripes = (img, x, y, w, h, o, c) => {
    const stops = [...img.matchAll(/(rgba?\([^)]+\))\s+([\d.]+)(px|%)/g)].map((m) => ({
      c: withAlpha(parseColor(m[1]), o),
      v: +m[2],
      u: m[3],
    }));
    const k = clipRect(x, y, w, h, c);
    if (!k || stops.length < 4) return;
    const L = (w + h) / Math.SQRT2;
    const at = (st) => (st.u === '%' ? (st.v / 100) * L : st.v);
    const cols = stops.map((st) => st.c);
    const band = at(stops[1]),
      period = at(stops[3]);
    const g = [Math.SQRT1_2, -Math.SQRT1_2],
      n = [Math.SQRT1_2, Math.SQRT1_2];
    const start = [x, y + h];
    ops.push({ t: 'r', x: k[0], y: k[1], w: k[2], h: k[3], rad: 0, c: cols[2] });
    const box4 = [k[0], k[1], k[0] + k[2], k[1] + k[3]];
    const segs = [];
    for (let t = 0; t < L + period; t += period) {
      const a = [start[0] + g[0] * t, start[1] + g[1] * t],
        b = [start[0] + g[0] * (t + band), start[1] + g[1] * (t + band)];
      const ext = L * 2;
      const poly = clipPoly(
        [
          [a[0] - n[0] * ext, a[1] - n[1] * ext],
          [a[0] + n[0] * ext, a[1] + n[1] * ext],
          [b[0] + n[0] * ext, b[1] + n[1] * ext],
          [b[0] - n[0] * ext, b[1] - n[1] * ext],
        ],
        box4,
      );
      if (poly.length > 2)
        segs.push(
          'M' + poly.map((p) => p[0].toFixed(2) + ' ' + p[1].toFixed(2)).join('L') + 'Z',
        );
    }
    if (segs.length) ops.push({ t: 'p', d: segs.join(''), c: cols[0] });
  };
  const hexToRgb = (v) =>
    v.replace(
      /^#(..)(..)(..)$/,
      (_, r, g2, b) => `rgb(${parseInt(r, 16)},${parseInt(g2, 16)},${parseInt(b, 16)})`,
    );
  const tokenColour = (el, names, fallback) => {
    for (const name of names) {
      const v = getComputedStyle(el).getPropertyValue(name).trim();
      if (v) return parseColor(hexToRgb(v)) ?? fallback;
    }
    return fallback;
  };
  const control = (el, cs) => {
    const r = el.getBoundingClientRect();
    const x = r.left + sx,
      y = r.top + sy;
    if (el.tagName === 'SELECT') {
      const label = el.options[el.selectedIndex]?.text ?? '';
      cv.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const mt = cv.measureText('Hg');
      const base =
        y +
        (r.height - mt.fontBoundingBoxAscent - mt.fontBoundingBoxDescent) / 2 +
        mt.fontBoundingBoxAscent;
      const col = withAlpha(parseColor(cs.color), opac(el));
      ops.push({
        t: 't',
        x: x + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft),
        y: base,
        s: label,
        lead: 0,
        ff: cs.fontFamily.split(',')[0].replace(/["']/g, '').trim(),
        fs: parseFloat(cs.fontSize),
        fw: cs.fontWeight,
        it: false,
        ls: 0,
        c: col,
      });
      const cx = x + r.width - 13,
        cy = y + r.height / 2;
      ops.push({
        t: 'ps',
        d: `M${(cx - 4).toFixed(2)} ${(cy - 2).toFixed(2)}L${cx.toFixed(2)} ${(cy + 2).toFixed(2)}L${(cx + 4).toFixed(2)} ${(cy - 2).toFixed(2)}`,
        sw: 1.8,
        cap: 'round',
        join: 'round',
        c: col,
      });
    } else if (el.type === 'radio' || el.type === 'checkbox') {
      const cx = x + r.width / 2,
        cy = y + r.height / 2,
        rr = Math.min(r.width, r.height) / 2 - 0.5;
      ops.push({
        t: 'es',
        x: cx,
        y: cy,
        rx: rr,
        ry: rr,
        sw: 1,
        c: tokenColour(
          el,
          ['--color-border-strong', '--color-border'],
          parseColor(cs.color),
        ),
      });
      if (el.checked)
        ops.push({
          t: 'e',
          x: cx,
          y: cy,
          rx: rr - 3,
          ry: rr - 3,
          c: tokenColour(el, ['--color-accent'], parseColor(cs.color)),
        });
    }
  };
  const box = (el, cs) => {
    const r = el.getBoundingClientRect();
    if (r.width < 0.01 || r.height < 0.01) return;
    const o = opac(el),
      c = clipFor(el.parentElement);
    const x = r.left + sx,
      y = r.top + sy;
    const rad = parseFloat(cs.borderTopLeftRadius) || 0;
    const bg = withAlpha(parseColor(cs.backgroundColor), o);
    const k = clipRect(x, y, r.width, r.height, c);
    if (!k) return;
    const full = k[2] === r.width && k[3] === r.height;
    if (bg)
      ops.push({
        t: 'r',
        x: k[0],
        y: k[1],
        w: k[2],
        h: k[3],
        rad: full ? Math.min(rad, r.height / 2, r.width / 2) : 0,
        c: bg,
      });
    if (cs.backgroundImage.includes('repeating-linear-gradient'))
      stripes(cs.backgroundImage, x, y, r.width, r.height, o, c);
    else if (cs.backgroundImage.includes('gradient'))
      ops.push({
        t: 'g',
        x: k[0],
        y: k[1],
        w: k[2],
        h: k[3],
        img: cs.backgroundImage,
        c: [0, 0, 0, 0],
      });
    const sides = ['Top', 'Right', 'Bottom', 'Left'].map((s) => ({
      w: cs[`border${s}Style`] === 'none' ? 0 : parseFloat(cs[`border${s}Width`]) || 0,
      c: withAlpha(parseColor(cs[`border${s}Color`]), o),
    }));
    const uniform = sides.every(
      (s) => s.w > 0 && s.c && s.w === sides[0].w && String(s.c) === String(sides[0].c),
    );
    if (uniform && rad > 0 && full) {
      const bw = sides[0].w;
      ops.push({
        t: 's',
        x: x + bw / 2,
        y: y + bw / 2,
        w: r.width - bw,
        h: r.height - bw,
        rad: Math.max(0, rad - bw / 2),
        sw: bw,
        c: sides[0].c,
      });
      return;
    }
    const [T, R, B, L] = sides;
    const edge = (s, ex, ey, ew, eh) => {
      if (!(s.w > 0 && s.c)) return;
      const e = clipRect(ex, ey, ew, eh, c);
      if (e) ops.push({ t: 'r', x: e[0], y: e[1], w: e[2], h: e[3], rad: 0, c: s.c });
    };
    edge(T, x, y, r.width, T.w);
    edge(B, x, y + r.height - B.w, r.width, B.w);
    edge(L, x, y + T.w, L.w, r.height - T.w - B.w);
    edge(R, x + r.width - R.w, y + T.w, R.w, r.height - T.w - B.w);
  };

  const text = (node, el, cs) => {
    const data = node.data;
    if (!data.trim()) return;
    const o = opac(el),
      c = clipFor(el);
    const col = withAlpha(parseColor(cs.color), o);
    if (!col) return;
    const rg = document.createRange();
    const lines = [];
    let cur = null;
    for (let i = 0; i < data.length; i += 1) {
      rg.setStart(node, i);
      rg.setEnd(node, i + 1);
      const rects = rg.getClientRects();
      if (!rects.length) continue;
      const q = rects[0];
      if (q.width < 0.01 && /\s/.test(data[i])) continue;
      if (
        c &&
        (q.left + sx + q.width / 2 < c[0] ||
          q.left + sx + q.width / 2 > c[2] ||
          q.top + sy + q.height / 2 < c[1] ||
          q.top + sy + q.height / 2 > c[3])
      )
        continue;
      const top = q.top + sy;
      if (!cur || Math.abs(top - cur.top) > 1 || q.left + sx < cur.right - 1) {
        if (/\s/.test(data[i])) {
          cur = null;
          continue;
        }
        cur = { top, left: q.left + sx, right: q.right + sx, s: '' };
        lines.push(cur);
      }
      cur.s += /\s/.test(data[i]) ? ' ' : data[i];
      cur.right = q.right + sx;
    }
    const tt = cs.textTransform;
    for (const l of lines) {
      let s = l.s.replace(/ +/g, ' ');
      const lead = s.length - s.trimStart().length;
      s = s.trim();
      if (!s) continue;
      if (tt === 'uppercase') s = s.toUpperCase();
      else if (tt === 'lowercase') s = s.toLowerCase();
      ops.push({
        t: 't',
        x: l.left,
        y: l.top + ascent(cs),
        s,
        lead,
        ff: cs.fontFamily.split(',')[0].replace(/["']/g, '').trim(),
        fs: parseFloat(cs.fontSize),
        fw: cs.fontWeight,
        it: cs.fontStyle === 'italic',
        ls: cs.letterSpacing === 'normal' ? 0 : parseFloat(cs.letterSpacing) || 0,
        c: col,
      });
    }
  };

  const svgShape = (el) => {
    const cs = getComputedStyle(el);
    if (!visible(el, cs)) return;
    const m = el.getScreenCTM();
    if (!m) return;
    const o = opac(el);
    const fill =
      cs.fill === 'none'
        ? null
        : withAlpha(parseColor(cs.fill), o * Number(cs.fillOpacity));
    const stroke =
      cs.stroke === 'none'
        ? null
        : withAlpha(parseColor(cs.stroke), o * Number(cs.strokeOpacity));
    const scale = Math.hypot(m.a, m.b);
    const sw =
      (parseFloat(cs.strokeWidth) || 0) *
      (cs.vectorEffect === 'non-scaling-stroke' ? 1 : scale);
    const tag = el.tagName.toLowerCase();
    const P = (x, y) => [m.a * x + m.c * y + m.e + sx, m.b * x + m.d * y + m.f + sy];
    if (tag === 'text') {
      if (!fill || !el.textContent.trim()) return;
      const p = el.getStartPositionOfChar(0);
      const y = P(p.x, p.y)[1];
      const x = el.getBoundingClientRect().left + sx;
      ops.push({
        t: 't',
        x,
        y,
        s: el.textContent.trim(),
        lead: 0,
        ff: cs.fontFamily.split(',')[0].replace(/["']/g, '').trim(),
        fs: parseFloat(cs.fontSize) * scale,
        fw: cs.fontWeight,
        it: cs.fontStyle === 'italic',
        ls: 0,
        c: fill,
        anchor: cs.textAnchor,
      });
      return;
    }
    const axis = Math.abs(m.b) < 1e-6 && Math.abs(m.c) < 1e-6;
    let d;
    if (tag === 'rect' && axis) {
      const x = el.x.baseVal.value,
        y = el.y.baseVal.value,
        w = el.width.baseVal.value,
        h = el.height.baseVal.value;
      const [X, Y] = P(x, y);
      const rr = (el.rx.baseVal.value || 0) * scale;
      if (fill)
        ops.push({ t: 'r', x: X, y: Y, w: w * m.a, h: h * m.d, rad: rr, c: fill });
      if (stroke && sw)
        ops.push({ t: 's', x: X, y: Y, w: w * m.a, h: h * m.d, rad: rr, sw, c: stroke });
      return;
    }
    if ((tag === 'circle' || tag === 'ellipse') && axis) {
      const cx = el.cx.baseVal.value,
        cy = el.cy.baseVal.value;
      const rx = tag === 'circle' ? el.r.baseVal.value : el.rx.baseVal.value;
      const ry = tag === 'circle' ? el.r.baseVal.value : el.ry.baseVal.value;
      const [X, Y] = P(cx, cy);
      if (fill) ops.push({ t: 'e', x: X, y: Y, rx: rx * m.a, ry: ry * m.d, c: fill });
      if (stroke && sw)
        ops.push({ t: 'es', x: X, y: Y, rx: rx * m.a, ry: ry * m.d, sw, c: stroke });
      return;
    }
    if (typeof el.getTotalLength !== 'function') return;
    const len = el.getTotalLength();
    if (!(len > 0)) return;
    if (tag === 'line' || tag === 'polyline' || tag === 'polygon') {
      const pts =
        tag === 'line'
          ? [
              [el.x1.baseVal.value, el.y1.baseVal.value],
              [el.x2.baseVal.value, el.y2.baseVal.value],
            ]
          : Array.from(el.points).map((p) => [p.x, p.y]);
      d =
        pts
          .map(
            (p, i) =>
              (i ? 'L' : 'M') +
              P(p[0], p[1])
                .map((v) => v.toFixed(2))
                .join(' '),
          )
          .join('') + (tag === 'polygon' ? 'Z' : '');
    } else {
      const raw = el.getAttribute('d') || '';
      const subpaths = raw.split(/(?=[Mm])/).length;
      const n = Math.min(4000, Math.max(16, Math.ceil(len / 1)));
      const pts = [];
      let prev = null;
      for (let i = 0; i <= n; i += 1) {
        const p = el.getPointAtLength((len * i) / n);
        const q = P(p.x, p.y);
        const jump =
          prev && Math.hypot(q[0] - prev[0], q[1] - prev[1]) > (len / n) * scale * 3 + 2;
        pts.push(
          (i === 0 || (jump && subpaths > 1) ? 'M' : 'L') +
            q[0].toFixed(2) +
            ' ' +
            q[1].toFixed(2),
        );
        prev = q;
      }
      d = pts.join('') + (/[zZ]\s*$/.test(raw) && subpaths === 1 ? 'Z' : '');
    }
    if (fill) ops.push({ t: 'p', d, c: fill });
    if (stroke && sw)
      ops.push({
        t: 'ps',
        d,
        sw,
        cap: cs.strokeLinecap,
        join: cs.strokeLinejoin,
        c: stroke,
      });
  };

  const walk = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none') return;
    if (el instanceof SVGElement) {
      if (el.tagName.toLowerCase() === 'svg') {
        if (!visible(el, cs)) return;
        el.querySelectorAll(
          'path,rect,circle,ellipse,line,polyline,polygon,text',
        ).forEach((s) => {
          if (!s.closest('defs,clipPath,mask,symbol')) svgShape(s);
        });
      }
      return;
    }
    const vis = visible(el, cs);
    if (vis) box(el, cs);
    if (el.tagName === 'IMG' && vis) {
      const r = el.getBoundingClientRect();
      ops.push({
        t: 'img',
        x: r.left + sx,
        y: r.top + sy,
        w: r.width,
        h: r.height,
        src: el.currentSrc,
        c: [0, 0, 0, 0],
      });
    }
    if (
      (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') &&
      vis
    ) {
      control(el, cs);
    }
    for (const ch of el.childNodes) {
      if (ch.nodeType === 3) {
        if (vis) text(ch, el, cs);
      } else if (ch.nodeType === 1) walk(ch);
    }
  };
  walk(root);
  const size = fullPage
    ? [document.documentElement.scrollWidth, document.documentElement.scrollHeight]
    : [rootBox.width, rootBox.height];
  return { ops, size };
}
