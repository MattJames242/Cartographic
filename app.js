(() => {
  "use strict";
  const ROUNDS = 10, TRIES = 4, HINTS_PER_GAME = 3;
  const $ = (id) => document.getElementById(id);
  const store = {
    get(k, d) { try { const v = localStorage.getItem("carto:" + k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem("carto:" + k, JSON.stringify(v)); } catch {} }
  };

  // ---------- helpers ----------
  const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ").replace(/\b(the|sir|saint|st|dr|captain|king|queen)\b/g, " ").replace(/\s+/g, " ").trim();
  function lev(a, b) {
    const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, i) => i);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }
  function isMatch(guess, fig) {
    const g = norm(guess); if (!g) return false;
    return [fig.n, ...fig.a].some((name) => {
      const t = norm(name); if (!t) return false;
      if (g === t) return true;
      return lev(g, t) <= Math.max(1, Math.floor(t.length / 6));
    });
  }
  const fmtYear = (y, circa) => (circa ? "c. " : "") + (y < 0 ? `${-y} BC` : `${y}`);
  const initials = (n) => n.replace(/[,.]/g, "").split(/\s+/).map((w) => /^(of|the|da|de|van|von|du)$/i.test(w) ? w.toLowerCase() : w[0].toUpperCase() + ".").join(" ");
  function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function shuffle(arr, rand = Math.random) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  function toast(msg) { const t = $("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove("show"), 1600); }
  function show(id) { document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("active", s.id === id)); if (id === "game") setTimeout(() => map.invalidateSize(), 50); }

  // ---------- map ----------
  const map = L.map("map", { zoomControl: false, worldCopyJump: true, attributionControl: true }).setView([30, 10], 2);
  const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/";
  L.tileLayer(ESRI + "World_Terrain_Base/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 13, attribution: "Tiles &copy; Esri &mdash; Source: USGS, Esri, TANA, DeLorme, NPS"
  }).addTo(map);
  let labelsLayer = null;
  const layer = L.layerGroup().addTo(map);
  const pinIcon = (cls, text) => L.divIcon({ className: "", iconSize: [0, 0],
    html: `<div class="pin ${cls}" style="position:absolute;left:0;bottom:0;transform:translate(-50%,7px)"><div class="tag">${text}</div><div class="stem"></div><div class="pt"></div></div>` });

  function drawFigure(f) {
    layer.clearLayers();
    if (labelsLayer) { map.removeLayer(labelsLayer); labelsLayer = null; }
    const b = [f.b[2], f.b[3]], x = [f.x[2], f.x[3]];
    // Unwrap longitude so the line takes the shortest path across the antimeridian.
    let x2 = x[1]; if (x2 - b[1] > 180) x2 -= 360; else if (b[1] - x2 > 180) x2 += 360;
    const xx = [x[0], x2];
    const same = Math.abs(b[0] - x[0]) < 0.05 && Math.abs(b[1] - x[1]) < 0.05;
    if (!same) L.polyline([b, xx], { color: "#1f2f4b", weight: 3, dashArray: "6 8", opacity: .8 }).addTo(layer);
    L.marker(xx, { icon: pinIcon("died", same ? `Born & died` : `Died ${fmtYear(f.x[0], f.x[4])}`), zIndexOffset: 10 }).addTo(layer);
    if (!same) L.marker(b, { icon: pinIcon("born", `Born ${fmtYear(f.b[0], f.b[4])}`) }).addTo(layer);
    lastView = [b, xx, same];
    fitView(b, xx, same);
  }
  let lastView = null;
  const refit = () => requestAnimationFrame(() => lastView && fitView(...lastView));
  function fitView(b, xx, same) {
    const sheetH = $("sheet").offsetHeight || 300;
    const opts = { paddingTopLeft: [40, 120], paddingBottomRight: [40, sheetH + 30], maxZoom: 6, animate: true };
    if (same) map.fitBounds(L.latLng(b).toBounds(600000), opts);
    else map.fitBounds(L.latLngBounds([b, xx]), opts);
  }
  function showLabels() {
    if (labelsLayer) return;
    labelsLayer = L.tileLayer(ESRI + "Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", { maxZoom: 13, pane: "overlayPane" }).addTo(map);
  }

  // ---------- game state ----------
  let game = null;

  function newGame(mode) {
    const daily = mode === "daily";
    const pool = daily ? shuffle(FIGURES, rng(hashStr("carto" + todayKey()))) : shuffle(avoidRecent(FIGURES));
    game = { mode, figures: pool.slice(0, ROUNDS), round: 0, score: 0, results: [], hintsLeft: HINTS_PER_GAME };
    if (!daily) store.set("recent", [...game.figures.map((f) => f.n), ...store.get("recent", [])].slice(0, 60));
    show("game");
    startRound();
  }
  function hashStr(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
  function avoidRecent(all) { const recent = new Set(store.get("recent", [])); const fresh = all.filter((f) => !recent.has(f.n)); return fresh.length >= ROUNDS ? fresh : all; }

  function startRound() {
    const f = game.figures[game.round];
    game.cur = { f, tries: 0, hints: 0, wrong: [], done: false };
    $("round-label").textContent = `${game.round + 1} / ${ROUNDS}`;
    $("score").textContent = game.score;
    $("birth-year").textContent = fmtYear(f.b[0], f.b[4]);
    $("death-year").textContent = fmtYear(f.x[0], f.x[4]);
    $("hints").innerHTML = ""; $("wrong").innerHTML = "";
    $("guess").value = "";
    $("guess-area").classList.remove("hidden"); $("reveal").classList.add("hidden");
    renderAttempts();
    requestAnimationFrame(() => drawFigure(f));
  }
  function renderAttempts() {
    const used = game.cur.tries;
    const left = TRIES - used;
    $("attempts").innerHTML = `<span class="lbl">💡 Hints</span>` +
      Array.from({ length: HINTS_PER_GAME }, (_, i) => `<i class="${i < game.hintsLeft ? "" : "used"}"></i>`).join("") +
      `<span class="lbl">· ${left} ${left === 1 ? "guess" : "guesses"} left</span>`;
    renderHintBtn();
  }
  function renderHintBtn() {
    const c = game.cur, b = $("btn-hint");
    b.textContent = `💡 Hint (${game.hintsLeft} left)`;
    b.disabled = c.done || game.hintsLeft <= 0 || c.hints >= 3;
  }
  function revealHint() {
    const c = game.cur, f = c.f, n = c.hints; // n = hints used this round
    const li = document.createElement("li");
    if (n === 1) { li.innerHTML = `<b>Places</b>${esc(f.b[1])} → ${esc(f.x[1])}`; showLabels(); }
    else if (n === 2) li.innerHTML = `<b>Who</b>${esc(f.d)}`;
    else if (n === 3) li.innerHTML = `<b>Initials</b>${esc(initials(f.n))}`;
    else return;
    $("hints").appendChild(li);
    refit();
  }
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function useTry(wrongGuess) {
    const c = game.cur; c.tries++;
    if (wrongGuess) { c.wrong.push(wrongGuess); const s = document.createElement("span"); s.textContent = wrongGuess; $("wrong").appendChild(s); }
    renderAttempts();
    if (c.tries >= TRIES) return endRound(false);
  }
  function submitGuess(text) {
    const c = game.cur; if (c.done) return;
    text = text.trim(); if (!text) return;
    if (isMatch(text, c.f)) return endRound(true);
    if (c.wrong.some((w) => norm(w) === norm(text))) { toast("Already tried that"); return; }
    $("sheet").classList.remove("shake"); void $("sheet").offsetWidth; $("sheet").classList.add("shake");
    if (navigator.vibrate) navigator.vibrate(80);
    $("guess").value = "";
    useTry(text);
  }
  function endRound(win) {
    const c = game.cur; c.done = true; renderHintBtn();
    const pts = win ? TRIES - c.tries : 0;
    game.score += pts;
    game.results.push({ name: c.f.n, pts, win });
    $("score").textContent = game.score;
    $("guess").blur();
    $("guess-area").classList.add("hidden");
    const t = $("reveal-title");
    t.textContent = win ? (pts === TRIES ? `Perfect! +${pts}` : `Correct! +${pts}`) : "Out of guesses";
    t.className = "reveal-title " + (win ? "win" : "lose");
    $("reveal-name").textContent = c.f.n;
    $("reveal-desc").textContent = c.f.d;
    $("reveal-places").innerHTML = `<span class="g">●</span> ${esc(c.f.b[1])}, ${fmtYear(c.f.b[0], c.f.b[4])}<br><span class="r">●</span> ${esc(c.f.x[1])}, ${fmtYear(c.f.x[0], c.f.x[4])}`;
    $("btn-next").textContent = game.round + 1 >= ROUNDS ? "See results" : "Next →";
    $("reveal").classList.remove("hidden");
    showLabels();
    refit();
    if (win && navigator.vibrate) navigator.vibrate([30, 40, 30]);
  }
  function next() {
    game.round++;
    if (game.round >= ROUNDS) return finish();
    startRound();
  }

  function finish() {
    const g = game;
    const stats = store.get("stats", { played: 0, best: 0, total: 0 });
    stats.played++; stats.total += g.score; stats.best = Math.max(stats.best, g.score);
    store.set("stats", stats);
    if (g.mode === "daily") store.set("daily:" + todayKey(), { score: g.score, results: g.results });
    renderResults(g.score, g.results, g.mode);
    show("results");
  }
  const emoji = (r) => (!r.win ? "🟥" : r.pts === 4 ? "🟩" : r.pts >= 2 ? "🟨" : "🟧");
  function renderResults(score, results, mode) {
    const max = ROUNDS * TRIES;
    $("res-title").textContent = mode === "daily" ? `Daily · ${todayKey()}` : score >= 30 ? "Historian!" : score >= 18 ? "Well travelled" : "Keep exploring";
    $("res-score").textContent = score; $("res-max").textContent = max;
    $("res-grid").textContent = results.map(emoji).join("");
    $("res-best").textContent = `Best score: ${store.get("stats", { best: 0 }).best}`;
    $("res-list").innerHTML = results.map((r) => `<li><span>${emoji(r)} ${esc(r.name)}</span><span>+${r.pts}</span></li>`).join("");
    $("btn-again").textContent = mode === "daily" ? "Play classic" : "Play again";
    renderResults.share = `🗺️ Cartographic${mode === "daily" ? " Daily " + todayKey() : ""}\n${results.map(emoji).join("")}\n${score}/${max}`;
  }

  // ---------- wiring ----------
  $("guess-form").addEventListener("submit", (e) => { e.preventDefault(); submitGuess($("guess").value); });
  $("btn-hint").addEventListener("click", () => {
    const c = game.cur; if (c.done || game.hintsLeft <= 0 || c.hints >= 3) return;
    game.hintsLeft--; c.hints++; revealHint(); renderAttempts();
  });
  $("btn-skip").addEventListener("click", () => { if (!game.cur.done) { game.cur.tries = TRIES; renderAttempts(); endRound(false); } });
  $("btn-next").addEventListener("click", next);
  $("btn-quit").addEventListener("click", () => { if (confirm("Quit this game?")) { renderHome(); show("home"); } });
  $("btn-classic").addEventListener("click", () => newGame("classic"));
  $("btn-daily").addEventListener("click", () => {
    const done = store.get("daily:" + todayKey());
    if (done) { renderResults(done.score, done.results, "daily"); show("results"); } else newGame("daily");
  });
  $("btn-again").addEventListener("click", () => newGame("classic"));
  $("btn-home").addEventListener("click", () => { renderHome(); show("home"); });
  $("btn-share").addEventListener("click", async () => {
    const text = renderResults.share;
    try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); toast("Copied to clipboard"); } } catch {}
  });

  function renderHome() {
    const s = store.get("stats", { played: 0, best: 0, total: 0 });
    $("home-stats").innerHTML = `<div class="stat"><b>${s.played}</b><span>Played</span></div><div class="stat"><b>${s.best}</b><span>Best</span></div><div class="stat"><b>${s.played ? Math.round(s.total / s.played) : 0}</b><span>Average</span></div>`;
    const d = store.get("daily:" + todayKey());
    $("daily-status").textContent = d ? `Done today · ${d.score}/${ROUNDS * TRIES}` : "Same 10 for everyone today";
  }
  renderHome();

  if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
})();
