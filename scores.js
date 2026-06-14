/*
  Alsaleh World Cup Tournament 2026 - Front-end leaderboard
  -------------------------------------------------------------------
  Setup:
  1) Put Code.gs in Google Sheets > Extensions > Apps Script.
  2) Deploy as Web app.
  3) Paste the /exec URL below.
*/

const CONFIG = {
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbxh9g6gmTlj_pcIFwNtDHyLMNTjVH92WQq6JBNU23Qhq7EP3DpU3YoHAQYZ3J8gcKRX/exec",
  REFRESH_SECONDS: 60,
  USE_DEMO_DATA_WHEN_NOT_CONFIGURED: true,
  STORAGE_KEY: "alsaleh_wc_2026_previous_ranks_v2"
};

let state = { players: [], families: [], meta: {}, filtered: [], lastUpdated: null };
const $ = (id) => document.getElementById(id);
const fmt = (n) => Number(n || 0).toLocaleString("en-US");
const isConfigured = () => CONFIG.APPS_SCRIPT_URL && !CONFIG.APPS_SCRIPT_URL.includes("PASTE_YOUR");

function setStatus(text, type = "warn") {
  const dot = $("statusDot");
  $("statusText").textContent = text;
  dot.className = `dot ${type === "ok" ? "" : type}`.trim();
}

async function loadScores() {
  try {
    setStatus("Updating scores…", "warn");
    let data;
    if (!isConfigured()) {
      if (!CONFIG.USE_DEMO_DATA_WHEN_NOT_CONFIGURED) throw new Error("Paste your Google Apps Script Web App URL in scores.js.");
      data = demoData();
      data.meta.demo = true;
    } else {
      data = await loadFromAppsScript(CONFIG.APPS_SCRIPT_URL);
    }
    if (!data || data.ok === false) throw new Error(data && data.error ? data.error : "No data returned from Google Sheets.");
    state.players = (data.players || []).map(normalizePlayer).sort(sortPlayers);
    state.players.forEach((p, i) => p.rank = i + 1);
    state.families = data.families || summarizeFamilies(state.players);
    state.meta = data.meta || {};
    state.lastUpdated = new Date();
    renderAll();
    saveRanks(state.players);
    setStatus(`${data.meta && data.meta.demo ? "Demo data" : "Live"} • Updated ${state.lastUpdated.toLocaleTimeString()}`, data.meta && data.meta.demo ? "warn" : "ok");
  } catch (err) {
    console.error(err);
    renderError(err.message || String(err));
    setStatus("Setup needed", "bad");
  }
}

function loadFromAppsScript(url) {
  return new Promise((resolve, reject) => {
    const callbackName = "alsalehLeaderboard_" + Date.now() + "_" + Math.floor(Math.random() * 9999);
    const script = document.createElement("script");
    const sep = url.includes("?") ? "&" : "?";
    const timer = setTimeout(() => cleanup(new Error("Google Apps Script request timed out.")), 20000);

    window[callbackName] = (payload) => cleanup(null, payload);
    script.src = `${url}${sep}callback=${callbackName}&_=${Date.now()}`;
    script.onerror = () => cleanup(new Error("Could not load Google Apps Script. Check deployment access is set to Anyone."));
    document.body.appendChild(script);

    function cleanup(error, payload) {
      clearTimeout(timer);
      try { delete window[callbackName]; } catch (_) { window[callbackName] = undefined; }
      if (script.parentNode) script.parentNode.removeChild(script);
      error ? reject(error) : resolve(payload);
    }
  });
}

function normalizePlayer(p) {
  return {
    name: String(p.name || "Unknown"),
    family: String(p.family || detectFamily(p.name)),
    rank: Number(p.rank || 0),
    totalPoints: Number(p.totalPoints || 0),
    exactScores: Number(p.exactScores || 0),
    correctResults: Number(p.correctResults || 0),
    completedMatches: Number(p.completedMatches || 0),
    matches: Array.isArray(p.matches) ? p.matches.map(m => ({
      match: String(m.match || ""),
      prediction: String(m.prediction || ""),
      actual: String(m.actual || ""),
      completed: Boolean(m.completed),
      resultPoints: Number(m.resultPoints || 0),
      homePoints: Number(m.homePoints || 0),
      awayPoints: Number(m.awayPoints || 0),
      diffPoints: Number(m.diffPoints || 0),
      totalPoints: Number(m.totalPoints || 0)
    })) : []
  };
}

function sortPlayers(a, b) {
  return b.totalPoints - a.totalPoints || b.correctResults - a.correctResults || b.exactScores - a.exactScores || a.name.localeCompare(b.name);
}

function renderAll() {
  renderKpis();
  renderTop3();
  renderFamilies();
  renderFamilyFilter();
  renderTable();
  renderLatestMatches();
}

function renderKpis() {
  const players = state.players;
  const completed = Math.max(0, ...players.map(p => p.completedMatches || 0));
  const leader = players[0];
  const avg = players.length ? Math.round(players.reduce((s, p) => s + p.totalPoints, 0) / players.length) : 0;
  const families = new Set(players.map(p => p.family)).size;
  $("kpis").innerHTML = [
    [players.length, "Participants"],
    [leader ? leader.totalPoints : 0, "Leader points"],
    [completed, "Completed matches"],
    [families, "Families"]
  ].map(([value, label]) => `<div class="kpi"><b>${fmt(value)}</b><span>${label}</span></div>`).join("");
}

function renderTop3() {
  const medals = ["🥇", "🥈", "🥉"];
  const top = state.players.slice(0, 3);
  if (!top.length) { $("top3").innerHTML = `<div class="loading">No participants yet.</div>`; return; }
  $("top3").innerHTML = top.map((p, i) => {
    const move = detectMovement(p);
    return `<article class="podium ${i === 0 ? "first" : ""}">
      <div class="medal">${medals[i]}</div>
      <div class="name">${escapeHtml(p.name)}</div>
      <div class="small">${escapeHtml(p.family)}</div>
      <div class="score">${fmt(p.totalPoints)}</div>
      <div class="small">Rank ${p.rank} • <span class="movement ${move.cls}">${move.label}</span></div>
    </article>`;
  }).join("");
}

function renderFamilies() {
  const families = state.families.length ? state.families : summarizeFamilies(state.players);
  const max = Math.max(1, ...families.map(f => f.averagePoints || f.totalPoints || 0));
  if (!families.length) { $("familyBars").innerHTML = `<div class="loading">No family data yet.</div>`; return; }
  $("familyBars").innerHTML = families.map(f => {
    const value = Number(f.averagePoints || f.totalPoints || 0);
    const width = Math.max(4, Math.round((value / max) * 100));
    return `<div class="bar-row"><div class="bar-title">${escapeHtml(f.family)}</div><div class="bar"><span style="width:${width}%"></span></div><div class="bar-value">${fmt(value)}</div><div class="small" style="grid-column:1 / -1">${fmt(f.participants || 0)} participants • ${fmt(f.totalPoints || 0)} total points</div></div>`;
  }).join("");
}

function renderFamilyFilter() {
  const select = $("familyFilter");
  const current = select.value || "all";
  const families = Array.from(new Set(state.players.map(p => p.family))).sort();
  select.innerHTML = `<option value="all">All families</option>` + families.map(f => `<option value="${escapeAttr(f)}">${escapeHtml(f)}</option>`).join("");
  select.value = families.includes(current) ? current : "all";
}

function renderTable() {
  const q = ($("search").value || "").trim().toLowerCase();
  const family = $("familyFilter").value || "all";
  const rows = state.players.filter(p => (!q || p.name.toLowerCase().includes(q)) && (family === "all" || p.family === family));
  state.filtered = rows;
  if (!rows.length) { $("leaderboardBody").innerHTML = `<tr><td colspan="8" class="loading">No matching participants.</td></tr>`; return; }
  $("leaderboardBody").innerHTML = rows.map(p => {
    const move = detectMovement(p);
    return `<tr>
      <td><span class="rank">#${p.rank}</span></td>
      <td><span class="movement ${move.cls}">${move.label}</span></td>
      <td class="name-cell">${escapeHtml(p.name)}</td>
      <td><span class="pill">👨‍👩‍👧‍👦 ${escapeHtml(p.family)}</span></td>
      <td class="num">${fmt(p.totalPoints)}</td>
      <td>${fmt(p.exactScores)}</td>
      <td>${fmt(p.correctResults)}</td>
      <td><button class="details" onclick="openPlayer('${escapeAttr(p.name)}')">View matches</button></td>
    </tr>`;
  }).join("");
}

function renderLatestMatches() {
  const items = [];
  state.players.forEach(p => (p.matches || []).forEach(m => {
    if (m.completed && m.totalPoints > 0) items.push({ ...m, player: p.name, family: p.family });
  }));
  items.sort((a, b) => b.totalPoints - a.totalPoints).splice(8);
  $("latestMatches").innerHTML = items.length ? items.map(m => `<article class="match-card">
    <span class="pts">+${fmt(m.totalPoints)}</span>
    <div class="teams">${escapeHtml(m.match)}</div>
    <div class="player">${escapeHtml(m.player)} • ${escapeHtml(m.family)}</div>
    <div class="player">Prediction ${escapeHtml(m.prediction || "-")} • Actual ${escapeHtml(m.actual || "-")}</div>
    <div class="breakdown"><span class="chip">Result ${fmt(m.resultPoints)}</span><span class="chip">Home ${fmt(m.homePoints)}</span><span class="chip">Away ${fmt(m.awayPoints)}</span><span class="chip">Diff ${fmt(m.diffPoints)}</span></div>
  </article>`).join("") : `<div class="loading">Match points will appear after results are entered.</div>`;
}

function openPlayer(name) {
  const p = state.players.find(x => x.name === name);
  if (!p) return;
  $("modalTitle").textContent = `${p.name} • Match-by-match points`;
  $("modalBody").innerHTML = (p.matches || []).map(m => `<tr>
    <td>${escapeHtml(m.match)}</td><td>${escapeHtml(m.prediction || "-")}</td><td>${escapeHtml(m.actual || "-")}</td>
    <td>${fmt(m.resultPoints)}</td><td>${fmt(m.homePoints)}</td><td>${fmt(m.awayPoints)}</td><td>${fmt(m.diffPoints)}</td><td><b>${fmt(m.totalPoints)}</b></td>
  </tr>`).join("") || `<tr><td colspan="8" class="loading">No match data.</td></tr>`;
  $("modal").classList.add("open");
  $("modal").setAttribute("aria-hidden", "false");
}

function detectMovement(player) {
  const previous = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEY) || "{}");
  const oldRank = previous[player.name];
  if (!oldRank) return { label: "NEW", cls: "new" };
  if (oldRank > player.rank) return { label: `↑ ${oldRank - player.rank}`, cls: "up" };
  if (oldRank < player.rank) return { label: `↓ ${player.rank - oldRank}`, cls: "down" };
  return { label: "–", cls: "same" };
}
function saveRanks(players) {
  const ranks = {};
  players.forEach(p => ranks[p.name] = p.rank);
  localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(ranks));
}

function summarizeFamilies(players) {
  const map = {};
  players.forEach(p => {
    const family = p.family || "Other";
    if (!map[family]) map[family] = { family, participants: 0, totalPoints: 0, averagePoints: 0 };
    map[family].participants += 1;
    map[family].totalPoints += Number(p.totalPoints || 0);
  });
  return Object.values(map).map(f => ({ ...f, averagePoints: f.participants ? Math.round(f.totalPoints / f.participants) : 0 })).sort((a, b) => b.averagePoints - a.averagePoints);
}
function detectFamily(name) {
  const n = String(name || "").toLowerCase();
  if (n.includes("abdulhadi") || n.includes("abdul hadi") || n.includes("عبدالهادي") || n.includes("عبد الهادي")) return "Abdulhadi";
  if (n.includes("alsaleh") || n.includes("saleh") || n.includes("الصالح") || n.includes("صالح")) return "Alsaleh";
  return "Other";
}
function renderError(message) {
  const safe = escapeHtml(message);
  $("leaderboardBody").innerHTML = `<tr><td colspan="8"><div class="error">${safe}<br><br>Open <b>scores.js</b> and paste your Google Apps Script Web App URL in <b>CONFIG.APPS_SCRIPT_URL</b>.</div></td></tr>`;
  $("top3").innerHTML = `<div class="error">${safe}</div>`;
  $("familyBars").innerHTML = `<div class="error">${safe}</div>`;
  $("latestMatches").innerHTML = `<div class="error">${safe}</div>`;
}
function escapeHtml(s){return String(s ?? "").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"}[c]));}
function escapeAttr(s){return escapeHtml(s).replace(/`/g,"&#96;");}

function demoData() {
  const players = [
    {name:"Raad Alsaleh",family:"Alsaleh",totalPoints:210,exactScores:2,correctResults:4,completedMatches:8},
    {name:"Fahad Abdulhadi",family:"Abdulhadi",totalPoints:196,exactScores:1,correctResults:4,completedMatches:8},
    {name:"Jassim Alsaleh",family:"Alsaleh",totalPoints:184,exactScores:1,correctResults:3,completedMatches:8},
    {name:"Yousef Abdulhadi",family:"Abdulhadi",totalPoints:162,exactScores:0,correctResults:3,completedMatches:8}
  ].map((p, i) => ({...p, matches:[
    {match:"Mexico vs South Africa",prediction:"2-0",actual:"2-0",completed:true,resultPoints:48,homePoints:15,awayPoints:15,diffPoints:12,totalPoints:i===0?90:48},
    {match:"South Korea vs Czechia",prediction:"1-1",actual:"2-1",completed:true,resultPoints:0,homePoints:0,awayPoints:15,diffPoints:0,totalPoints:i===1?63:15}
  ]}));
  return {ok:true,meta:{tournament:"Alsaleh World Cup Tournament 2026",updatedAt:new Date().toISOString(),participantCount:players.length,completedMatches:8},players,families:summarizeFamilies(players)};
}

$("refreshBtn").addEventListener("click", loadScores);
$("search").addEventListener("input", renderTable);
$("familyFilter").addEventListener("change", renderTable);
$("closeModal").addEventListener("click", () => { $("modal").classList.remove("open"); $("modal").setAttribute("aria-hidden", "true"); });
$("modal").addEventListener("click", e => { if (e.target.id === "modal") $("closeModal").click(); });
window.addEventListener("keydown", e => { if (e.key === "Escape") $("closeModal").click(); });

loadScores();
setInterval(loadScores, CONFIG.REFRESH_SECONDS * 1000);
