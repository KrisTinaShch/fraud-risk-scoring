"use strict";

/* ---------- formatting ---------- */

const SVG_NS = "http://www.w3.org/2000/svg";
const formatters = {};

function num(value, digits = 0) {
  formatters[digits] ??= new Intl.NumberFormat("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return formatters[digits].format(value);
}

const count = (v) => num(Math.round(v));
const usd = (v) => `$${num(Math.round(v))}`;
const usdSmall = (v) => (Number.isInteger(v) ? `$${v}` : `$${num(v, 2)}`);
const pct = (v, digits = 0) => `${num(v * 100, digits)}%`;
const signed = (v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${num(Math.abs(v), 2)}`;
const plain = (v) => `${v < 0 ? "−" : ""}${num(Math.abs(v), 2)}`;
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/* ---------- DOM helpers ---------- */

function h(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function s(tag, attrs, parent, text) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs || {})) node.setAttribute(key, value);
  if (text != null) node.textContent = text;
  if (parent) parent.append(node);
  return node;
}

function legend(container, items) {
  container.replaceChildren();
  for (const item of items) {
    const entry = h("span", "legend-item");
    const swatch = h("span", item.kind === "line" ? "legend-line" : "legend-swatch");
    swatch.style.background = item.color;
    entry.append(swatch);
    if (item.icon) entry.append(h("span", "legend-icon", item.icon));
    entry.append(document.createTextNode(item.name));
    container.append(entry);
  }
}

function dataTable(container, head, rows) {
  const table = h("table");
  const headRow = table.createTHead().insertRow();
  for (const title of head) headRow.append(h("th", null, title));
  const body = table.createTBody();
  for (const row of rows) {
    const tr = body.insertRow();
    for (const cell of row) tr.insertCell().textContent = cell;
  }
  container.replaceChildren(table);
}

/* ---------- tooltip ---------- */

const tip = document.getElementById("tooltip");

function showTip(title, rows, clientX, clientY) {
  tip.replaceChildren();
  if (title) tip.append(h("div", "tip-title", title));
  for (const row of rows) {
    const line = h("div", "tip-row");
    if (row.color) {
      const key = h("span", row.box ? "tip-box" : "tip-key");
      key.style.background = row.color;
      line.append(key);
    }
    line.append(h("span", "tip-value", row.value));
    if (row.name) line.append(h("span", "tip-name", row.name));
    tip.append(line);
  }
  tip.hidden = false;
  const gap = 14;
  let left = clientX + gap;
  let top = clientY + gap;
  if (left + tip.offsetWidth > window.innerWidth - 8) left = clientX - tip.offsetWidth - gap;
  if (top + tip.offsetHeight > window.innerHeight - 8) top = clientY - tip.offsetHeight - gap;
  tip.style.left = `${Math.max(8, left)}px`;
  tip.style.top = `${Math.max(8, top)}px`;
}

function hideTip() {
  tip.hidden = true;
}

function hoverable(node, getTip) {
  node.addEventListener("pointermove", (event) => {
    const content = getTip();
    showTip(content.title, content.rows, event.clientX, event.clientY);
  });
  node.addEventListener("pointerleave", hideTip);
  node.addEventListener("focus", () => {
    const box = node.getBoundingClientRect();
    const content = getTip();
    showTip(content.title, content.rows, box.left + box.width / 2, box.bottom);
  });
  node.addEventListener("blur", hideTip);
}

/* ---------- line chart ---------- */

function lineChart(container, o) {
  container.replaceChildren();
  if (o.series.length > 1) {
    const box = h("div", "chart-legend");
    legend(box, o.series.map((sr) => ({ name: sr.name, color: sr.color, kind: "line" })));
    container.append(box);
  }
  const width = Math.max(260, container.clientWidth);
  const height = o.height || 240;
  const wantEndLabels = o.endLabels && width >= 480;
  const m = { top: 12, right: wantEndLabels ? 150 : 16, bottom: 42, left: 56 };
  const iw = width - m.left - m.right;
  const ih = height - m.top - m.bottom;
  const x = (v) => m.left + ((v - o.x.min) / (o.x.max - o.x.min)) * iw;
  const y = (v) => m.top + ih - ((v - o.y.min) / (o.y.max - o.y.min)) * ih;

  const svg = s("svg", { width, height, viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": o.label, tabindex: 0 });
  for (const tick of o.y.ticks) {
    s("line", { x1: m.left, x2: m.left + iw, y1: y(tick), y2: y(tick), class: tick === o.y.min ? "axis-line" : "grid-line" }, svg);
    s("text", { x: m.left - 8, y: y(tick) + 4, "text-anchor": "end", class: "tick" }, svg, o.y.format(tick));
  }
  for (const tick of o.x.ticks) {
    s("text", { x: x(tick), y: m.top + ih + 18, "text-anchor": "middle", class: "tick" }, svg, o.x.format(tick));
  }
  s("text", { x: m.left + iw / 2, y: height - 6, "text-anchor": "middle", class: "axis-label" }, svg, o.x.label);
  s("text", { transform: `translate(14 ${m.top + ih / 2}) rotate(-90)`, "text-anchor": "middle", class: "axis-label" }, svg, o.y.label);

  if (o.diagonal) {
    s("line", { x1: x(o.x.min), y1: y(o.y.min), x2: x(o.x.max), y2: y(o.y.max), class: "ref-line" }, svg);
    if (o.diagonal.label) {
      const at = o.diagonal.at;
      s("text", { x: x(at) + 6, y: y(at) + 14, class: "ref-label" }, svg, o.diagonal.label);
    }
  }
  if (o.hline) {
    s("line", { x1: m.left, x2: m.left + iw, y1: y(o.hline.value), y2: y(o.hline.value), class: "ref-line" }, svg);
    s("text", { x: m.left + 6, y: y(o.hline.value) - 6, class: "ref-label" }, svg, o.hline.label);
  }
  if (o.vline) {
    s("line", { x1: x(o.vline.value), x2: x(o.vline.value), y1: m.top, y2: m.top + ih, class: "ref-line" }, svg);
    s("text", { x: x(o.vline.value) + 6, y: m.top + 10, class: "ref-label" }, svg, o.vline.label);
  }

  for (const sr of o.series) {
    const d = sr.points.map((p, i) => `${i ? "L" : "M"}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join("");
    s("path", { d, class: "series-line", stroke: sr.color }, svg);
    if (o.markers) {
      for (const p of sr.points) s("circle", { cx: x(p[0]), cy: y(p[1]), r: 4, fill: sr.color, class: "dot" }, svg);
    }
    if (sr.highlight) {
      s("circle", { cx: x(sr.highlight[0]), cy: y(sr.highlight[1]), r: 5.5, fill: sr.color, class: "dot" }, svg);
    }
  }

  if (wantEndLabels) {
    const ends = o.series.map((sr) => ({ sr, p: sr.points[sr.points.length - 1] }));
    const apart = ends.every((a, i) => ends.every((b, j) => i === j || Math.abs(y(a.p[1]) - y(b.p[1])) >= 16));
    if (apart) {
      for (const e of ends) s("text", { x: x(e.p[0]) + 10, y: y(e.p[1]) + 4, class: "end-label" }, svg, e.sr.name);
    }
  }

  const cursor = s("line", { y1: m.top, y2: m.top + ih, class: "cursor-line", visibility: "hidden" }, svg);
  const dots = o.series.map((sr) => s("circle", { r: 4.5, fill: sr.color, class: "dot", visibility: "hidden" }, svg));
  const overlay = s("rect", { x: m.left, y: m.top, width: iw, height: ih, fill: "transparent" }, svg);
  const nearest = (points, xv) =>
    points.reduce((best, p) => (Math.abs(p[0] - xv) < Math.abs(best[0] - xv) ? p : best), points[0]);

  function show(xv, clientX, clientY) {
    let snap = null;
    for (const sr of o.series) {
      const p = nearest(sr.points, xv);
      if (snap === null || Math.abs(p[0] - xv) < Math.abs(snap - xv)) snap = p[0];
    }
    cursor.setAttribute("x1", x(snap));
    cursor.setAttribute("x2", x(snap));
    cursor.setAttribute("visibility", "visible");
    const rows = o.series.map((sr, i) => {
      const p = nearest(sr.points, snap);
      dots[i].setAttribute("cx", x(p[0]));
      dots[i].setAttribute("cy", y(p[1]));
      dots[i].setAttribute("visibility", "visible");
      return { color: sr.color, value: o.tipValue(p), name: sr.name };
    });
    showTip(o.tipTitle(snap), rows, clientX, clientY);
  }

  function hide() {
    cursor.setAttribute("visibility", "hidden");
    for (const dot of dots) dot.setAttribute("visibility", "hidden");
    hideTip();
  }

  overlay.addEventListener("pointermove", (event) => {
    const box = svg.getBoundingClientRect();
    const xv = o.x.min + ((event.clientX - box.left - m.left) / iw) * (o.x.max - o.x.min);
    show(xv, event.clientX, event.clientY);
  });
  overlay.addEventListener("pointerleave", hide);

  const keyXs = o.series[0].points.map((p) => p[0]);
  let keyIndex = Math.floor(keyXs.length / 2);
  function showKey() {
    const box = svg.getBoundingClientRect();
    show(keyXs[keyIndex], box.left + x(keyXs[keyIndex]), box.top + m.top + 24);
  }
  svg.addEventListener("focus", showKey);
  svg.addEventListener("blur", hide);
  svg.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight") keyIndex = Math.min(keyXs.length - 1, keyIndex + 1);
    else if (event.key === "ArrowLeft") keyIndex = Math.max(0, keyIndex - 1);
    else return;
    event.preventDefault();
    showKey();
  });

  container.append(svg);
}

/* ---------- horizontal bars ---------- */

function barPath(x0, y0, w, height, r) {
  const rr = Math.max(0, Math.min(r, w, height / 2));
  return (
    `M${x0},${y0}H${x0 + w - rr}Q${x0 + w},${y0} ${x0 + w},${y0 + rr}` +
    `V${y0 + height - rr}Q${x0 + w},${y0 + height} ${x0 + w - rr},${y0 + height}H${x0}Z`
  );
}

function barChart(container, o) {
  container.replaceChildren();
  const width = Math.max(260, container.clientWidth);
  const row = 26;
  const thick = 14;
  const m = { top: 4, right: 52, bottom: 36, left: Math.min(140, Math.round(width * 0.36)) };
  const height = m.top + o.items.length * row + m.bottom;
  const iw = width - m.left - m.right;
  const x = (v) => m.left + (v / o.max) * iw;
  const svg = s("svg", { width, height, viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": o.label });
  const bottom = m.top + o.items.length * row;

  for (const tick of o.ticks) {
    s("line", { x1: x(tick), x2: x(tick), y1: m.top, y2: bottom, class: tick === 0 ? "axis-line" : "grid-line" }, svg);
    s("text", { x: x(tick), y: bottom + 16, "text-anchor": "middle", class: "tick" }, svg, o.format(tick));
  }
  s("text", { x: m.left + iw / 2, y: height - 4, "text-anchor": "middle", class: "axis-label" }, svg, o.axisLabel);

  o.items.forEach((d, i) => {
    const top = m.top + i * row + (row - thick) / 2;
    const w = x(d.value) - m.left;
    const hit = s("rect", { x: 0, y: m.top + i * row, width, height: row, class: "hit", tabindex: 0 }, svg);
    s("path", { d: barPath(m.left, top, w, thick, 4), fill: d.color }, svg);
    s("text", { x: m.left - 8, y: top + thick / 2 + 4, "text-anchor": "end", class: "bar-name" }, svg, d.name);
    if (d.labelled) {
      s("text", { x: m.left + w + 6, y: top + thick / 2 + 4, class: "bar-value" }, svg, o.format(d.value));
    }
    hoverable(hit, () => ({ title: null, rows: [{ color: d.color, box: true, value: o.format(d.value), name: d.name }] }));
  });
  container.append(svg);
}

/* ---------- waterfall ---------- */

function niceStep(range) {
  for (const step of [0.5, 1, 2, 4, 5, 10]) if (range / step <= 7) return step;
  return 20;
}

function waterfall(container, r) {
  container.replaceChildren();
  const steps = [];
  let cum = r.base;
  r.features.forEach((name, i) => {
    steps.push({ name, from: cum, to: cum + r.values[i], delta: r.values[i] });
    cum += r.values[i];
  });
  steps.push({ name: `${r.rest_count} other columns`, from: cum, to: cum + r.rest, delta: r.rest });
  const rows = [{ name: "Starting point", point: r.base }, ...steps, { name: "This transaction", point: r.score }];

  const values = [r.base, r.score, ...steps.flatMap((st) => [st.from, st.to])];
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  const pad = (hi - lo) * 0.14;
  lo -= pad;
  hi += pad;

  const width = Math.max(260, container.clientWidth);
  const row = 26;
  const thick = 14;
  const m = { top: 18, right: 12, bottom: 38, left: Math.min(150, Math.round(width * 0.38)) };
  const height = m.top + rows.length * row + m.bottom;
  const iw = width - m.left - m.right;
  const x = (v) => m.left + ((v - lo) / (hi - lo)) * iw;
  const bottom = m.top + rows.length * row;
  const svg = s("svg", {
    width,
    height,
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": `Score breakdown from ${plain(r.base)} to ${plain(r.score)}`,
  });

  const step = niceStep(hi - lo);
  for (let tick = Math.ceil(lo / step) * step; tick <= hi; tick += step) {
    s("line", { x1: x(tick), x2: x(tick), y1: m.top, y2: bottom, class: tick === 0 ? "ref-line" : "grid-line" }, svg);
    const label = `${tick < 0 ? "−" : ""}${num(Math.abs(tick), Number.isInteger(tick) ? 0 : 1)}`;
    s("text", { x: x(tick), y: bottom + 16, "text-anchor": "middle", class: "tick" }, svg, label);
  }
  if (lo < 0 && hi > 0) {
    s("text", { x: x(0), y: m.top - 6, "text-anchor": "middle", class: "ref-label" }, svg, "0 = 50/50");
  }
  s("text", { x: width / 2, y: height - 4, "text-anchor": "middle", class: "axis-label" }, svg, "Model score (log-odds)");

  const fraudColor = cssVar("--towards-fraud");
  const honestColor = cssVar("--towards-honest");
  const inkColor = cssVar("--text");

  rows.forEach((d, i) => {
    const mid = m.top + i * row + row / 2;
    const hit = s("rect", { x: 0, y: m.top + i * row, width, height: row, class: "hit", tabindex: 0 }, svg);
    s("text", { x: m.left - 8, y: mid + 4, "text-anchor": "end", class: "bar-name" }, svg, d.name);
    if (d.point !== undefined) {
      s("circle", { cx: x(d.point), cy: mid, r: 5, fill: inkColor, class: "dot" }, svg);
      const right = x(d.point) < m.left + iw * 0.7;
      s(
        "text",
        { x: x(d.point) + (right ? 10 : -10), y: mid + 4, "text-anchor": right ? "start" : "end", class: "bar-value" },
        svg,
        plain(d.point),
      );
      hoverable(hit, () => ({ title: d.name, rows: [{ value: plain(d.point), name: "raw score (log-odds)" }] }));
      return;
    }
    const color = d.delta >= 0 ? fraudColor : honestColor;
    const x0 = x(Math.min(d.from, d.to));
    const w = Math.max(1, Math.abs(x(d.to) - x(d.from)));
    s("rect", { x: x0, y: mid - thick / 2, width: w, height: thick, rx: Math.min(3, w / 2), fill: color }, svg);
    const labelWidth = signed(d.delta).length * 7;
    let after = d.delta >= 0;
    if (!after && x0 - 6 - labelWidth < m.left) after = true;
    if (after && x0 + w + 6 + labelWidth > width) after = false;
    s(
      "text",
      { x: after ? x0 + w + 6 : x0 - 6, y: mid + 4, "text-anchor": after ? "start" : "end", class: "bar-value" },
      svg,
      signed(d.delta),
    );
    if (i < rows.length - 1) {
      s("line", { x1: x(d.to), x2: x(d.to), y1: mid + thick / 2, y2: mid + row - thick / 2, class: "grid-line" }, svg);
    }
    hoverable(hit, () => ({
      title: d.name,
      rows: [
        { color, box: true, value: signed(d.delta), name: d.delta >= 0 ? "towards fraud" : "towards honest" },
        { value: plain(d.to), name: "score after this step" },
      ],
    }));
  });
  container.append(svg);
}

/* ---------- segmented bar and loss breakdown ---------- */

function segBar(container, parts, total, label) {
  container.replaceChildren();
  container.setAttribute("role", "group");
  container.setAttribute("aria-label", `${label}: ${parts.map((p) => `${p.name} ${count(p.value)}`).join(", ")}`);
  for (const p of parts) {
    if (p.value <= 0) continue;
    const share = p.value / total;
    const seg = h("div", "seg");
    seg.style.flex = `${p.value} 1 0`;
    seg.style.background = p.color;
    seg.style.color = p.ink;
    seg.tabIndex = 0;
    seg.append(h("span", "seg-label", pct(share, share < 0.1 ? 1 : 0)));
    hoverable(seg, () => ({
      title: label,
      rows: [{ color: p.color, box: true, value: count(p.value), name: `${p.name} · ${pct(share, 1)}` }],
    }));
    container.append(seg);
  }
  for (const seg of container.children) {
    const text = seg.firstChild;
    text.classList.toggle("is-hidden", text.offsetWidth + 16 > seg.clientWidth);
  }
}

function breakdown(container, items, total) {
  container.replaceChildren();
  const max = Math.max(1, ...items.map((it) => it.value));
  for (const it of items) {
    const row = h("div", "bd-row");
    row.append(h("span", "bd-name", it.name), h("span", "bd-value", usd(it.value)));
    const track = h("div", "bd-track");
    const bar = h("div", "bd-bar");
    bar.style.width = `${(it.value / max) * 100}%`;
    bar.classList.toggle("is-zero", it.value <= 0);
    track.append(bar);
    row.append(track);
    container.append(row);
  }
  const sum = h("div", "bd-total");
  sum.append(h("span", null, "Total loss"), h("span", null, usd(total)));
  container.append(sum);
}

/* ---------- the decision simulator ---------- */

let DATA = null;
const MODEL_LABELS = { lightgbm: "LightGBM", logreg: "Logistic regression" };
const state = { model: "lightgbm", rule: "three", fee: 0, decline: 0, verify: 0, pass: 0 };
const SLIDERS = [
  { key: "fee", grid: "fraud_fee", format: usdSmall },
  { key: "decline", grid: "decline_cost", format: usdSmall },
  { key: "verify", grid: "verify_cost", format: usdSmall },
  { key: "pass", grid: "verify_pass", format: (v) => pct(v) },
];

function outcome(modelKey, rule, idx) {
  const g = DATA.grid;
  const nD = g.decline_cost.length;
  const nV = g.verify_cost.length;
  const nP = g.verify_pass.length;
  const three = rule === "three";
  const F = g.fraud_fee[idx.fee];
  const D = g.decline_cost[idx.decline];
  const V = g.verify_cost[idx.verify];
  const P = g.verify_pass[idx.pass];
  const model = DATA.models[modelKey];
  const row = three
    ? model.three[((idx.fee * nD + idx.decline) * nV + idx.verify) * nP + idx.pass]
    : model.two[idx.fee * nD + idx.decline];
  const [hd, hv, fd, fv, fvAmount, fa, faAmount] = row;
  const parts = {
    missed: faAmount + F * fa,
    passed: three ? P * (fvAmount + F * fv) : 0,
    confirm: three ? V * hv : 0,
    decline: D * hd,
  };
  const loss = parts.missed + parts.passed + parts.confirm + parts.decline;
  const approveAll = DATA.period.fraud_amount + F * DATA.period.frauds;
  return { F, D, V, P, hd, hv, fd, fv, fa, faAmount, parts, loss, approveAll, saved: approveAll - loss, share: (approveAll - loss) / approveAll };
}

function tile(label, value, sub) {
  const box = h("div", "tile");
  box.append(h("p", "tile-label", label), h("p", "tile-value", value), h("p", "tile-sub", sub));
  return box;
}

function actionColors() {
  return {
    approve: { color: cssVar("--act-approve"), ink: cssVar("--on-approve") },
    confirm: { color: cssVar("--act-confirm"), ink: cssVar("--on-confirm") },
    decline: { color: cssVar("--act-decline"), ink: cssVar("--on-decline") },
  };
}

function renderSimulator() {
  const r = outcome(state.model, state.rule, state);
  const other = outcome(state.model, state.rule === "three" ? "two" : "three", state);
  const per = DATA.period;
  const honest = per.transactions - per.frauds;
  const three = state.rule === "three";

  document.getElementById("hero-value").textContent = pct(r.share);
  document.getElementById("hero-sub").textContent =
    `${usd(r.saved)} saved and ${usd(r.loss)} still lost in one month (${count(per.transactions)} payments).`;
  document.getElementById("hero-compare").textContent = three
    ? `Approve · decline only: ${pct(other.share)} saved, ${count(other.hd)} honest customers declined.`
    : `With a confirmation step: ${pct(other.share)} saved, ${count(other.hd)} honest customers declined.`;

  const stopped = r.fd + r.fv * (1 - (three ? r.P : 0));
  document.getElementById("tiles").replaceChildren(
    tile("Honest customers declined", count(r.hd), `${pct(r.hd / honest, 1)} of honest payments`),
    tile(
      "Honest customers asked to confirm",
      three ? count(r.hv) : "–",
      three ? `${pct(r.hv / honest, 1)} of honest payments` : "No confirmation step",
    ),
    tile(
      "Frauds stopped",
      count(stopped),
      three
        ? `${count(r.fd)} declined, ${count(r.fv)} sent to confirm (${pct(r.P)} of those pass)`
        : `of ${count(per.frauds)} frauds`,
    ),
    tile("Frauds approved", count(r.fa), r.fa ? `average amount ${usd(r.faAmount / r.fa)}` : "none"),
  );

  const colors = actionColors();
  legend(document.getElementById("seg-legend"), [
    { name: "Approved", color: colors.approve.color, icon: "✓" },
    { name: "Asked to confirm", color: colors.confirm.color, icon: "?" },
    { name: "Declined", color: colors.decline.color, icon: "✕" },
  ]);
  document.getElementById("seg-note").textContent =
    `Test month, days ${per.first_day}–${per.last_day}. ${MODEL_LABELS[state.model]}, current assumptions.`;
  document.getElementById("seg-honest-title").replaceChildren(h("strong", null, "Honest payments"), document.createTextNode(` · ${count(honest)}`));
  document.getElementById("seg-fraud-title").replaceChildren(h("strong", null, "Fraudulent payments"), document.createTextNode(` · ${count(per.frauds)}`));
  const parts = (approve, confirm, decline) => [
    { name: "Approved", value: approve, ...colors.approve },
    { name: "Asked to confirm", value: confirm, ...colors.confirm },
    { name: "Declined", value: decline, ...colors.decline },
  ];
  segBar(document.getElementById("seg-honest"), parts(honest - r.hd - r.hv, r.hv, r.hd), honest, "Honest payments");
  segBar(document.getElementById("seg-fraud"), parts(r.fa, r.fv, r.fd), per.frauds, "Fraudulent payments");

  breakdown(
    document.getElementById("breakdown"),
    [
      { name: "Missed fraud: amount plus chargeback fee", value: r.parts.missed },
      { name: "Fraud that passed the confirmation", value: r.parts.passed },
      { name: "Confirmations of honest customers", value: r.parts.confirm },
      { name: "Declined honest customers", value: r.parts.decline },
    ],
    r.loss,
  );

  renderSensitivity();
}

function renderSensitivity() {
  const g = DATA.grid;
  const keys = ["lightgbm", "logreg"];
  const colors = { lightgbm: cssVar("--series-1"), logreg: cssVar("--series-2") };
  const series = keys.map((key) => {
    const points = g.verify_cost.map((v, iv) => [v, outcome(key, "three", { ...state, verify: iv }).share]);
    return { name: MODEL_LABELS[key], color: colors[key], points, highlight: points[state.verify] };
  });
  const all = series.flatMap((sr) => sr.points.map((p) => p[1]));
  const step = Math.max(...all) - Math.min(...all) > 0.3 ? 0.1 : 0.05;
  const yMin = Math.max(0, Math.floor(Math.min(...all) / step) * step - step);
  const yMax = Math.min(1, Math.ceil(Math.max(...all) / step) * step + step / 2);
  const ticks = [];
  for (let v = yMin; v <= yMax + 1e-9; v += step) ticks.push(Number(v.toFixed(2)));

  document.getElementById("sens-note").textContent =
    `Approve · confirm · decline with a chargeback fee of ${usdSmall(state.feeValue)}, a decline cost of ` +
    `${usdSmall(state.declineValue)} and ${pct(state.passValue)} of fraudsters passing. The marked points use the ` +
    `current confirmation cost.`;

  lineChart(document.getElementById("sens-chart"), {
    label: "Share of losses saved against the cost of a confirmation, for both models",
    series,
    height: 260,
    endLabels: true,
    x: { min: 0, max: 10, ticks: [0, 2, 4, 6, 8, 10], format: (v) => `$${v}`, label: "Cost of a confirmation for an honest customer" },
    y: { min: yMin, max: yMax, ticks, format: (v) => pct(v), label: "Losses saved" },
    vline: { value: series[0].highlight[0], label: "current" },
    tipTitle: (v) => `Confirmation costs ${usdSmall(v)}`,
    tipValue: (p) => `${pct(p[1], 1)} saved`,
  });

  dataTable(
    document.getElementById("sens-table"),
    ["Confirmation cost", ...series.map((sr) => sr.name)],
    g.verify_cost.map((v, i) => [usdSmall(v), ...series.map((sr) => pct(sr.points[i][1], 1))]),
  );
}

function syncControls() {
  const g = DATA.grid;
  for (const sl of SLIDERS) {
    document.getElementById(sl.key).value = state[sl.key];
    const value = g[sl.grid][state[sl.key]];
    state[`${sl.key}Value`] = value;
    document.getElementById(`${sl.key}-out`).textContent = sl.format(value);
  }
  const three = state.rule === "three";
  for (const label of document.querySelectorAll("[data-three-only]")) {
    label.classList.toggle("is-off", !three);
    label.querySelector("input").disabled = !three;
  }
  for (const [id, key] of [["model-toggle", "model"], ["rule-toggle", "rule"]]) {
    for (const button of document.getElementById(id).querySelectorAll("button")) {
      button.setAttribute("aria-pressed", String(button.dataset.value === state[key]));
    }
  }
}

function resetAssumptions() {
  const g = DATA.grid;
  const d = DATA.defaults;
  state.fee = g.fraud_fee.indexOf(d.fraud_fee);
  state.decline = g.decline_cost.indexOf(d.decline_cost);
  state.verify = g.verify_cost.indexOf(d.verify_cost);
  state.pass = g.verify_pass.indexOf(d.verify_pass);
}

function initSimulator() {
  const g = DATA.grid;
  resetAssumptions();
  for (const sl of SLIDERS) {
    const input = document.getElementById(sl.key);
    input.min = 0;
    input.max = g[sl.grid].length - 1;
    input.addEventListener("input", () => {
      state[sl.key] = Number(input.value);
      syncControls();
      renderSimulator();
    });
  }
  for (const [id, key] of [["model-toggle", "model"], ["rule-toggle", "rule"]]) {
    document.getElementById(id).addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      state[key] = button.dataset.value;
      syncControls();
      renderSimulator();
    });
  }
  document.getElementById("reset").addEventListener("click", () => {
    resetAssumptions();
    syncControls();
    renderSimulator();
  });
  syncControls();
  renderSimulator();
}

/* ---------- models ---------- */

const VALID_TABLE = [
  { name: "Random guess", columns: null, roc: 0.5, pr: 0.034, caught: 0.01, test: "random" },
  { name: "Logistic regression", columns: 101, roc: 0.82, pr: 0.3, caught: 0.235, test: "logreg" },
  { name: "Random forest", columns: 101, roc: 0.905, pr: 0.489, caught: null },
  { name: "CatBoost", columns: 440, roc: 0.911, pr: 0.595, caught: null },
  { name: "LightGBM, 300 trees", columns: 440, roc: 0.928, pr: 0.607, caught: null },
  { name: "LightGBM, early stopping", columns: 440, roc: 0.931, pr: 0.648, caught: null },
  { name: "LightGBM, tuned", columns: 440, roc: 0.935, pr: 0.654, caught: 0.569, test: "lightgbm", main: true },
];

function renderModels() {
  const models = DATA.models;
  const colors = { lightgbm: cssVar("--series-1"), logreg: cssVar("--series-2") };
  const keys = ["lightgbm", "logreg"];
  const fraudShare = DATA.period.frauds / DATA.period.transactions;
  const unit = { min: 0, max: 1, ticks: [0, 0.25, 0.5, 0.75, 1], format: (v) => pct(v) };

  lineChart(document.getElementById("pr-chart"), {
    label: "Precision-recall curves on the test month for LightGBM and logistic regression",
    series: keys.map((k) => ({
      name: `${MODEL_LABELS[k]} · ${num(models[k].metrics.pr_auc, 3)}`,
      color: colors[k],
      points: models[k].pr.recall.map((rc, i) => [rc, models[k].pr.precision[i]]),
    })),
    x: { ...unit, label: "Fraud caught (recall)" },
    y: { ...unit, label: "Flagged that are fraud" },
    hline: { value: fraudShare, label: `random guess ${pct(fraudShare, 1)}` },
    tipTitle: (v) => `${pct(v)} of fraud caught`,
    tipValue: (p) => `${pct(p[1], 1)} precision`,
  });

  lineChart(document.getElementById("roc-chart"), {
    label: "ROC curves on the test month for LightGBM and logistic regression",
    series: keys.map((k) => ({
      name: `${MODEL_LABELS[k]} · ${num(models[k].metrics.roc_auc, 3)}`,
      color: colors[k],
      points: models[k].roc.fpr.map((f, i) => [f, models[k].roc.tpr[i]]),
    })),
    x: { ...unit, label: "Honest payments flagged" },
    y: { ...unit, label: "Fraud caught" },
    diagonal: { at: 0.55, label: "random guess" },
    tipTitle: (v) => `${pct(v, v < 0.01 ? 2 : 1)} of honest payments flagged`,
    tipValue: (p) => `${pct(p[1], 1)} of fraud caught`,
  });

  lineChart(document.getElementById("cal-chart"), {
    label: "Calibration on the test month: actual fraud share against predicted probability",
    series: keys.map((k) => ({
      name: MODEL_LABELS[k],
      color: colors[k],
      points: models[k].calibration.predicted.map((p, i) => [p, models[k].calibration.actual[i], models[k].calibration.count[i]]),
    })),
    x: { ...unit, label: "Predicted probability" },
    y: { ...unit, label: "Actual fraud share" },
    markers: true,
    diagonal: {},
    tipTitle: (v) => `Predicted about ${pct(v)}`,
    tipValue: (p) => `${pct(p[1], 1)} actual · ${count(p[2])} payments`,
  });

  const pick = (arr, wanted) => wanted.map((w) => arr.reduce((b, v, i) => (Math.abs(v - w) < Math.abs(arr[b] - w) ? i : b), 0));
  const prIdx = pick(models.lightgbm.pr.recall, [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]);
  dataTable(
    document.getElementById("pr-table"),
    ["Fraud caught", ...keys.map((k) => MODEL_LABELS[k])],
    prIdx.map((i) => [pct(models.lightgbm.pr.recall[i]), ...keys.map((k) => pct(models[k].pr.precision[i], 1))]),
  );
  const rocIdx = pick(models.lightgbm.roc.fpr, [0.001, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5]);
  dataTable(
    document.getElementById("roc-table"),
    ["Honest flagged", ...keys.map((k) => MODEL_LABELS[k])],
    rocIdx.map((i) => [pct(models.lightgbm.roc.fpr[i], 1), ...keys.map((k) => pct(models[k].roc.tpr[i], 1))]),
  );
  dataTable(
    document.getElementById("cal-table"),
    ["Model", "Predicted", "Actual", "Payments"],
    keys.flatMap((k) =>
      models[k].calibration.predicted.map((p, i) => [
        MODEL_LABELS[k],
        pct(p, 1),
        pct(models[k].calibration.actual[i], 1),
        count(models[k].calibration.count[i]),
      ]),
    ),
  );

  const table = document.getElementById("metrics-table");
  table.replaceChildren();
  const head = table.createTHead();
  const groups = head.insertRow();
  for (const [text, span] of [["", 2], ["Validation month", 3], ["Test month", 2]]) {
    const th = h("th", null, text);
    th.colSpan = span;
    groups.append(th);
  }
  const titles = head.insertRow();
  for (const text of ["Model", "Columns", "ROC-AUC", "PR-AUC", "Caught at 1% false alarms", "ROC-AUC", "PR-AUC"]) {
    titles.append(h("th", null, text));
  }
  const test = {
    random: [0.5, fraudShare],
    logreg: [models.logreg.metrics.roc_auc, models.logreg.metrics.pr_auc],
    lightgbm: [models.lightgbm.metrics.roc_auc, models.lightgbm.metrics.pr_auc],
  };
  const body = table.createTBody();
  for (const row of VALID_TABLE) {
    const tr = body.insertRow();
    if (row.main) tr.className = "is-main";
    const cells = [
      row.name,
      row.columns ? String(row.columns) : null,
      num(row.roc, 3),
      num(row.pr, 3),
      row.caught === null ? null : pct(row.caught, 1),
      ...(row.test ? test[row.test].map((v) => num(v, 3)) : [null, null]),
    ];
    for (const cell of cells) {
      const td = tr.insertCell();
      td.textContent = cell ?? "–";
      if (cell === null) td.className = "na";
    }
  }
}

/* ---------- explanations ---------- */

function renderExplanations() {
  const shap = DATA.shap;
  const ours = cssVar("--series-1");
  const theirs = cssVar("--mark-muted");
  const built = (name) => name.endsWith("_start_day");
  legend(document.getElementById("imp-legend"), [
    { name: "Built in this project", color: ours },
    { name: "Original columns", color: theirs },
  ]);
  document.getElementById("imp-note").textContent =
    `Mean absolute contribution over ${count(shap.sample_size)} validation payments: how far a column moves the ` +
    `score on average, in either direction.`;
  const items = shap.importance.features.map((name, i) => ({
    name,
    value: shap.importance.values[i],
    color: built(name) ? ours : theirs,
    labelled: i === 0 || built(name),
  }));
  const max = Math.ceil(Math.max(...items.map((d) => d.value)) * 10) / 10;
  barChart(document.getElementById("imp-chart"), {
    label: "Mean absolute SHAP value of the 15 most important columns",
    items,
    max,
    ticks: Array.from({ length: Math.round(max / 0.1) + 1 }, (_, i) => Number((i * 0.1).toFixed(1))),
    format: (v) => num(v, 2),
    axisLabel: "Mean |SHAP|, score units",
  });
  dataTable(
    document.getElementById("imp-table"),
    ["Column", "Mean |SHAP|"],
    items.map((d) => [d.name, num(d.value, 3)]),
  );

  const wfLegend = [
    { name: "Towards fraud", color: cssVar("--towards-fraud") },
    { name: "Towards honest", color: cssVar("--towards-honest") },
  ];
  legend(document.getElementById("wf-legend-1"), wfLegend);
  legend(document.getElementById("wf-legend-2"), wfLegend);

  const flagged = shap.flagged;
  document.getElementById("wf-flagged-note").textContent =
    `The most suspicious of ${count(shap.sample_size)} validation payments. The model starts from its average raw ` +
    `score (${plain(flagged.base)}, a typical transaction) and ends at ${plain(flagged.score)}. Besides the nine ` +
    `largest pushes, the other ${flagged.rest_count} columns together add ${signed(flagged.rest)}. Scores are ` +
    `log-odds before calibration, so they are not read as probabilities.`;
  waterfall(document.getElementById("wf-flagged"), flagged);

  const missed = shap.missed;
  document.getElementById("wf-missed-note").textContent =
    `The fraud the model found most honest among the ${shap.frauds_in_sample} frauds in the sample: it ends at ` +
    `${plain(missed.score)}, below the starting point. The card's start day, card1, the amount and D1 push it ` +
    `towards honest, and the few warnings are outweighed: some fraud looks like an ordinary purchase.`;
  waterfall(document.getElementById("wf-missed"), missed);

  for (const [id, r] of [["wf-flagged-table", flagged], ["wf-missed-table", missed]]) {
    dataTable(document.getElementById(id), ["Step", "Contribution"], [
      ["Starting point", plain(r.base)],
      ...r.features.map((f, i) => [f, signed(r.values[i])]),
      [`${r.rest_count} other columns`, signed(r.rest)],
      ["This transaction", plain(r.score)],
    ]);
  }
}

/* ---------- header and about ---------- */

function renderFacts() {
  const per = DATA.period;
  const facts = [
    ["Card payments", count(590540), "182 days of e-commerce data"],
    ["Fraud share", pct(0.035, 1), "about 1 payment in 28"],
    ["Test month", count(per.transactions), `days ${per.first_day}–${per.last_day}, used once`],
    ["LightGBM on test", `PR-AUC ${num(DATA.models.lightgbm.metrics.pr_auc, 3)}`, `random guess ${num(per.frauds / per.transactions, 3)}`],
  ];
  const list = document.getElementById("facts");
  list.replaceChildren();
  for (const [term, value, note] of facts) {
    const item = h("div");
    const dd = h("dd", null, value);
    dd.append(h("small", null, note));
    item.append(h("dt", null, term), dd);
    list.append(item);
  }
}

function renderTimeline() {
  const parts = [
    { name: "Train", days: `days 1–120 · ${count(414542)} payments`, span: 120, bg: "--train", ink: "--on-train" },
    { name: "Validation", days: `days 121–150 · ${count(83571)}`, span: 30, bg: "--valid", ink: "--on-valid" },
    { name: "Test", days: `days 151–182 · ${count(92427)}`, span: 32, bg: "--test", ink: "--on-test" },
  ];
  const box = document.getElementById("timeline");
  box.replaceChildren();
  box.setAttribute("role", "img");
  box.setAttribute("aria-label", "Train days 1 to 120, validation days 121 to 150, test days 151 to 182");
  for (const p of parts) {
    const part = h("div", "tl-part");
    part.style.flex = `${p.span} 1 0`;
    part.style.background = `var(${p.bg})`;
    part.style.color = `var(${p.ink})`;
    part.append(h("strong", null, p.name), h("span", null, p.days));
    box.append(part);
  }
}

/* ---------- start ---------- */

let resizeTimer = null;
let lastWidth = window.innerWidth;
window.addEventListener("resize", () => {
  if (window.innerWidth === lastWidth) return;
  lastWidth = window.innerWidth;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (!DATA) return;
    renderSensitivity();
    renderModels();
    renderExplanations();
  }, 150);
});

fetch("results.json")
  .then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  })
  .then((data) => {
    DATA = data;
    renderFacts();
    renderTimeline();
    initSimulator();
    renderModels();
    renderExplanations();
  })
  .catch((error) => {
    const note = h("p", "section-intro wrap", `Could not load the results (${error.message}). Open the page through a web server.`);
    document.querySelector("main").prepend(note);
  });
