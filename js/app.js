// Mani — Uygulama Mantığı (v3)
"use strict";

/* ==========================================================
   Para birimleri
========================================================== */
const CURRENCIES = ["TRY", "USD", "EUR", "GBP", "CHF", "JPY", "RUB", "AED", "SAR", "BGN"];
const CURRENCY_SYMBOLS = { TRY: "₺", USD: "$", EUR: "€", GBP: "£", CHF: "Fr", JPY: "¥", RUB: "₽", AED: "د.إ", SAR: "﷼", BGN: "лв" };

/* ==========================================================
   Durum
========================================================== */
const state = {
  transactions: [], categories: [], budgets: [], recurring: [], wallets: [], goals: [],
  rates: null,
  settings: { theme: "system", currency: "TRY" },
  month: monthKey(new Date()),
  statsMode: "month", statsYear: new Date().getFullYear(),
  txFilter: "all", txRange: "all", txSearch: "", txView: "list",
  calMonth: monthKey(new Date()),
  priceSearch: "",
  editId: null,
  formType: "expense", formCat: null, formPhoto: null, formCurrency: "TRY",
  formWallet: null, formFrom: null, formTo: null, formInstallments: 1,
  view: "home"
};

/* ==========================================================
   Yardımcılar
========================================================== */
const $ = (sel, root = document) => root.querySelector(sel);
const el = (id) => document.getElementById(id);

function monthKey(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); }
function pad(x) { return String(x).padStart(2, "0"); }
function isoDate(dt) { return dt.getFullYear() + "-" + pad(dt.getMonth() + 1) + "-" + pad(dt.getDate()); }

function money(n, cur) {
  cur = cur || state.settings.currency || "TRY";
  try { return new Intl.NumberFormat("tr-TR", { style: "currency", currency: cur, maximumFractionDigits: 2 }).format(n || 0); }
  catch (e) { return (n || 0).toFixed(2) + " " + (CURRENCY_SYMBOLS[cur] || cur); }
}
function sym(cur) { return CURRENCY_SYMBOLS[cur || state.settings.currency] || (cur || "₺"); }

function parseAmount(str) {
  str = String(str).trim().replace(/[^\d.,-]/g, "");
  if (str.includes(",")) str = str.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(str); return isNaN(n) ? 0 : n;
}

const MONTHS_TR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const MONTHS_SHORT = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const DAYS_TR = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
const DAYS_MIN = ["Pt", "Sa", "Ça", "Pe", "Cu", "Ct", "Pz"]; // Pzt-başlangıç
const FREQ_TR = { daily: "Her gün", weekly: "Her hafta", monthly: "Her ay" };

function fmtMonthYear(key) { const [y, m] = key.split("-"); return MONTHS_TR[parseInt(m, 10) - 1] + " " + y; }
function fmtDateLong(s) { const d = new Date(s); return d.getDate() + " " + MONTHS_TR[d.getMonth()] + " " + d.getFullYear(); }
function fmtTime(s) { const d = new Date(s); return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
function dayLabel(s) {
  const d = new Date(s), today = new Date(), yest = new Date(); yest.setDate(today.getDate() - 1);
  const same = (a, b) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Bugün";
  if (same(d, yest)) return "Dün";
  return DAYS_TR[d.getDay()] + ", " + d.getDate() + " " + MONTHS_TR[d.getMonth()];
}
function toLocalInput(d) { return isoDate(d) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes()); }
function escapeHtml(s) { return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

function catById(id) { return state.categories.find((c) => c.id === id) || { name: "Diğer", icon: "📦", color: "#64748b" }; }
function walletById(id) { return state.wallets.find((w) => w.id === id) || { name: "—", icon: "👛", color: "#64748b" }; }
function budgetFor(catId) { return state.budgets.find((b) => b.categoryId === catId); }

let toastTimer;
function toast(msg) { const t = el("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2200); }

function distinct(field) { const s = new Set(); state.transactions.forEach((t) => { const v = (t[field] || "").trim(); if (v) s.add(v); }); return [...s].sort(); }

/* ==========================================================
   Kur çevirme
========================================================== */
function getRate(cur) {
  if (cur === state.settings.currency) return 1;
  const r = state.rates;
  if (r && r.base === state.settings.currency && r.rates && r.rates[cur]) return 1 / r.rates[cur];
  return null;
}
function toBase(amount, cur) { const r = getRate(cur || state.settings.currency); return r != null ? amount * r : amount; }
function baseOf(t) { return t.baseAmount != null ? t.baseAmount : t.amount; }

async function ensureRates() {
  const base = state.settings.currency;
  const r = state.rates;
  const fresh = r && r.base === base && r.ts && (Date.now() - r.ts < 12 * 3600 * 1000);
  if (fresh || !navigator.onLine) return;
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/" + base);
    const data = await res.json();
    if (data && data.rates) { state.rates = { base, rates: data.rates, ts: Date.now() }; await DB.setMeta("rates", state.rates); }
  } catch (e) { /* çevrimdışı: sessiz geç */ }
}

/* ==========================================================
   Tema
========================================================== */
function applyTheme() {
  const pref = state.settings.theme;
  const theme = pref === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : pref;
  document.documentElement.setAttribute("data-theme", theme);
}
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (state.settings.theme === "system") applyTheme(); });

/* ==========================================================
   Navigasyon + geri tuşu
========================================================== */
const VIEWS = { home: "view-home", tx: "view-tx", stats: "view-stats", settings: "view-settings" };
const RENDERERS = { home: renderHome, tx: renderTx, stats: renderStats, settings: renderSettings };

function navTo(key) {
  Object.values(VIEWS).forEach((id) => el(id).classList.remove("active"));
  el(VIEWS[key]).classList.add("active");
  document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.nav === key));
  state.view = key; RENDERERS[key](); window.scrollTo(0, 0);
}
function refreshActiveView() { const a = document.querySelector(".nav-item.active"); if (a) RENDERERS[a.dataset.nav](); }

let skipPop = false, exitArmed = false;
function isSheetOpen() { return el("sheet").classList.contains("open"); }
function handlePop() {
  if (skipPop) { skipPop = false; return; }
  if (isSheetOpen()) { doCloseSheet(); return; }
  if (state.view !== "home") { navTo("home"); history.pushState({ mani: "trap" }, ""); return; }
  if (!exitArmed) { exitArmed = true; toast("Çıkmak için tekrar geri tuşuna bas"); history.pushState({ mani: "trap" }, ""); setTimeout(() => { exitArmed = false; }, 2000); return; }
  skipPop = true; history.back();
}
function initHistory() { history.replaceState({ mani: "base" }, ""); history.pushState({ mani: "trap" }, ""); window.addEventListener("popstate", handlePop); }

/* ==========================================================
   Hesaplamalar
========================================================== */
function sortedTx(list) { return [...(list || state.transactions)].sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt || 0) - (a.createdAt || 0)); }
function totals(list) { let income = 0, expense = 0; for (const t of list) { if (t.type === "income") income += baseOf(t); else if (t.type === "expense") expense += baseOf(t); } return { income, expense, net: income - expense }; }
function monthTx(key) { return state.transactions.filter((t) => t.date.slice(0, 7) === key); }
function yearTx(year) { return state.transactions.filter((t) => t.date.slice(0, 4) === String(year)); }
function prevMonthKey(key) { const [y, m] = key.split("-").map(Number); return monthKey(new Date(y, m - 2, 1)); }

function walletBalance(id) {
  let bal = 0;
  for (const t of state.transactions) {
    if (t.type === "income" && t.walletId === id) bal += baseOf(t);
    else if (t.type === "expense" && t.walletId === id) bal -= baseOf(t);
    else if (t.type === "transfer") { if (t.fromWallet === id) bal -= baseOf(t); if (t.toWallet === id) bal += baseOf(t); }
  }
  return bal;
}

/* ==========================================================
   Tekrarlayan motoru
========================================================== */
function advanceDate(dateStr, freq) {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (freq === "daily") return isoDate(new Date(y, m - 1, d + 1));
  if (freq === "weekly") return isoDate(new Date(y, m - 1, d + 7));
  return isoDate(new Date(y, m, Math.min(d, new Date(y, m + 1, 0).getDate())));
}
async function runRecurring() {
  const today = new Date(); today.setHours(23, 59, 59, 0);
  let created = 0;
  for (const r of state.recurring) {
    if (!r.active) continue;
    let next = r.nextDate, guard = 0;
    while (next && new Date(next + "T12:00") <= today && guard < 400) {
      const amount = r.amount, cur = r.currency || state.settings.currency, rate = getRate(cur);
      const t = {
        id: DB.uid("tx"), type: r.type, amount, currency: cur, rate: rate, baseAmount: toBase(amount, cur),
        categoryId: r.categoryId, walletId: r.walletId || (state.wallets[0] && state.wallets[0].id),
        item: r.item || "", vendor: r.vendor || "", note: r.note || "", tags: r.tags || [], photo: null,
        date: next + "T09:00", createdAt: Date.now(), recurringId: r.id
      };
      await DB.saveTransaction(t); state.transactions.push(t); created++;
      next = advanceDate(next, r.frequency); guard++;
    }
    if (next !== r.nextDate) { r.nextDate = next; await DB.saveRecurring(r); }
  }
  return created;
}

/* ==========================================================
   ÖZET
========================================================== */
function renderHome() {
  const all = totals(state.transactions);
  const thisKey = monthKey(new Date());
  const tm = totals(monthTx(thisKey));
  const recent = sortedTx().slice(0, 6);

  let html = `
    <div class="page-head"><div><h1>Merhaba 👋</h1><div class="sub">${fmtMonthYear(thisKey)}</div></div></div>
    <div class="balance-card">
      <div class="label">Toplam Bakiye</div>
      <div class="amount">${money(all.net)}</div>
      <div class="row">
        <div class="pill"><div class="t">↓ Bu ay gelir</div><div class="v">${money(tm.income)}</div></div>
        <div class="pill"><div class="t">↑ Bu ay gider</div><div class="v">${money(tm.expense)}</div></div>
      </div>
    </div>`;

  // Cüzdanlar
  if (state.wallets.length) {
    html += `<div class="section-head"><h2>Cüzdanlar</h2><button class="link" data-action="wallets">Düzenle</button></div>
      <div class="wallet-scroll">` +
      state.wallets.map((w) => `<div class="wallet-card" style="background:linear-gradient(135deg, ${w.color}, ${shade(w.color)})">
        <div class="wn">${w.icon} ${escapeHtml(w.name)}</div><div class="wv">${money(walletBalance(w.id))}</div></div>`).join("") +
      `</div>`;
  }

  html += budgetAlert(thisKey);

  // Hedefler
  if (state.goals.length) {
    html += `<div class="section-head"><h2>Hedefler</h2><button class="link" data-action="goals">Yönet</button></div>`;
    html += state.goals.map(goalCard).join("");
  }

  // Hızlı ekle
  const templates = quickTemplates();
  if (templates.length) {
    html += `<div class="section-head"><h2>Hızlı ekle</h2></div><div class="quick-scroll">` +
      templates.map((q, i) => { const c = catById(q.categoryId); return `<button class="quick-chip" data-quick="${i}"><span class="qe">${c.icon}</span><span class="qt"><span class="qn">${escapeHtml(q.label)}</span><br><span class="qa">${money(q.amount, q.currency)}</span></span></button>`; }).join("") + `</div>`;
    state._templates = templates;
  }

  html += `<div class="section-head"><h2>Son işlemler</h2>${recent.length ? '<button class="link" data-goto="tx">Tümü →</button>' : ""}</div>`;
  html += recent.length ? '<div class="tx-list">' + recent.map(txRow).join("") + "</div>" : emptyState("🪙", "Henüz işlem yok", "Alttaki + butonuna basarak ilk kaydını ekle.");

  el("view-home").innerHTML = html;
}

function shade(hex) {
  // rengi biraz koyulaştır (gradyan için)
  try { const n = parseInt(hex.slice(1), 16); let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; r = Math.round(r * 0.72); g = Math.round(g * 0.72); b = Math.round(b * 0.72); return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1); } catch (e) { return hex; }
}

function goalCard(g) {
  const pct = g.target ? Math.min(100, (g.saved / g.target) * 100) : 0;
  return `<div class="goal-card">
    <div class="gtop"><div class="ge" style="background:${g.color}22">${g.icon}</div>
      <div style="flex:1"><div class="gn">${escapeHtml(g.name)}</div>
      <div class="gp">${money(g.saved)} / ${money(g.target)} · %${Math.round(pct)}</div></div></div>
    <div class="track"><div class="fill" style="width:${pct}%;background:${g.color}"></div></div>
    <div class="gactions">
      <button data-goal-add="${g.id}">+ Para ekle</button>
      <button data-goal-sub="${g.id}">− Çıkar</button>
      <button class="x" data-goal-del="${g.id}">🗑️</button>
    </div></div>`;
}

function budgetAlert(mk) {
  if (!state.budgets.length) return "";
  const spent = {};
  monthTx(mk).filter((t) => t.type === "expense").forEach((t) => { spent[t.categoryId] = (spent[t.categoryId] || 0) + baseOf(t); });
  let over = null, warn = null;
  for (const b of state.budgets) {
    if (!b.limit) continue;
    const s = spent[b.categoryId] || 0, ratio = s / b.limit;
    if (ratio >= 1 && (!over || ratio > over.ratio)) over = { b, s, ratio };
    else if (ratio >= 0.8 && ratio < 1 && (!warn || ratio > warn.ratio)) warn = { b, s, ratio };
  }
  if (over) { const c = catById(over.b.categoryId); return `<div class="alert over"><span class="ai">🚨</span><div>${c.icon} <b>${escapeHtml(c.name)}</b> bütçesini aştın — ${money(over.s)} / ${money(over.b.limit)}</div></div>`; }
  if (warn) { const c = catById(warn.b.categoryId); return `<div class="alert warn"><span class="ai">⚠️</span><div>${c.icon} <b>${escapeHtml(c.name)}</b> bütçesinin %${Math.round(warn.ratio * 100)}'ine ulaştın — ${money(warn.s)} / ${money(warn.b.limit)}</div></div>`; }
  return "";
}

function quickTemplates() {
  const map = {};
  state.transactions.filter((t) => t.type === "expense").forEach((t) => {
    const key = (t.item || t.vendor || "").toLowerCase().trim(); if (!key) return;
    if (!map[key]) map[key] = { count: 0, date: "", label: t.item || t.vendor, item: t.item, vendor: t.vendor, categoryId: t.categoryId, amount: t.amount, currency: t.currency, walletId: t.walletId };
    map[key].count++;
    if (t.date > map[key].date) { Object.assign(map[key], { date: t.date, amount: t.amount, categoryId: t.categoryId, vendor: t.vendor, item: t.item, label: t.item || t.vendor, currency: t.currency, walletId: t.walletId }); }
  });
  return Object.values(map).filter((x) => x.count >= 2).sort((a, b) => b.count - a.count).slice(0, 8);
}

function txRow(t) {
  if (t.type === "transfer") {
    const f = walletById(t.fromWallet), to = walletById(t.toWallet);
    return `<div class="tx" data-edit="${t.id}"><div class="emoji" style="background:#64748b22">🔄</div>
      <div class="main"><div class="title">${f.icon} ${escapeHtml(f.name)} → ${to.icon} ${escapeHtml(to.name)}</div>
      <div class="meta">Transfer · ${fmtTime(t.date)}</div></div>
      <div class="amt" style="color:var(--text-2)">${money(baseOf(t))}</div></div>`;
  }
  const c = catById(t.categoryId);
  const title = t.item || t.vendor || c.name;
  const w = t.walletId ? walletById(t.walletId) : null;
  const meta = []; if (t.vendor && t.item) meta.push(t.vendor); meta.push(c.name); if (w) meta.push(w.icon); meta.push(fmtTime(t.date));
  const sign = t.type === "income" ? "+" : "−";
  const tags = (t.tags && t.tags.length) ? `<div class="tags-inline">${t.tags.map((x) => `<span class="tag">${escapeHtml(x)}</span>`).join("")}</div>` : "";
  return `<div class="tx" data-edit="${t.id}"><div class="emoji" style="background:${c.color}22">${c.icon}</div>
    <div class="main"><div class="title">${escapeHtml(title)}${t.photo ? '<span class="clip">📎</span>' : ""}${t.recurringId ? '<span class="clip">🔁</span>' : ""}${t.installmentCount > 1 ? `<span class="clip">💳${t.installmentNo}/${t.installmentCount}</span>` : ""}</div>
    <div class="meta">${escapeHtml(meta.join(" · "))}</div>${tags}</div>
    <div class="amt ${t.type}">${sign}${money(t.amount, t.currency).replace("-", "")}</div></div>`;
}

function emptyState(big, t, d) { return `<div class="empty"><div class="big">${big}</div><div class="t">${t}</div><div class="d">${d}</div></div>`; }

/* ==========================================================
   İŞLEMLER
========================================================== */
function rangeBounds(preset) {
  const now = new Date();
  if (preset === "thismonth") return { from: monthKey(now) + "-01", to: "9999" };
  if (preset === "lastmonth") { const pk = prevMonthKey(monthKey(now)); return { from: pk + "-01", to: pk + "-31" }; }
  if (preset === "7d") { const d = new Date(); d.setDate(d.getDate() - 7); return { from: isoDate(d), to: "9999" }; }
  if (preset === "30d") { const d = new Date(); d.setDate(d.getDate() - 30); return { from: isoDate(d), to: "9999" }; }
  return null;
}

function renderTx() {
  let html = `<div class="page-head"><h1>İşlemler</h1>
    <div class="theme-toggle">
      <button data-txview="list" class="${state.txView === "list" ? "active" : ""}">Liste</button>
      <button data-txview="calendar" class="${state.txView === "calendar" ? "active" : ""}">Takvim</button>
    </div></div>`;

  if (state.txView === "calendar") { el("view-tx").innerHTML = html + renderCalendar(); return; }

  let list = sortedTx();
  if (state.txFilter !== "all") list = list.filter((t) => t.type === state.txFilter);
  const rb = rangeBounds(state.txRange);
  if (rb) list = list.filter((t) => { const d = t.date.slice(0, 10); return d >= rb.from && d <= rb.to; });
  if (state.txSearch.trim()) {
    const q = state.txSearch.toLowerCase().trim();
    list = list.filter((t) => { const c = catById(t.categoryId); return [t.item, t.vendor, t.note, c.name, (t.tags || []).join(" ")].some((f) => (f || "").toLowerCase().includes(q)); });
  }
  const sums = totals(list);

  html += `<div class="search"><span class="ic">🔍</span><input id="txSearch" placeholder="Ara: döner, market, etiket..." value="${escapeHtml(state.txSearch)}" /></div>
    <div class="filter-row">${["all", "expense", "income"].map((f) => `<button class="filter-chip ${state.txFilter === f ? "active" : ""}" data-filter="${f}">${f === "all" ? "Tümü" : f === "expense" ? "Giderler" : "Gelirler"}</button>`).join("")}</div>
    <div class="filter-row">${[["all", "Tüm zamanlar"], ["thismonth", "Bu ay"], ["lastmonth", "Geçen ay"], ["7d", "7 gün"], ["30d", "30 gün"]].map(([v, l]) => `<button class="filter-chip ${state.txRange === v ? "active" : ""}" data-range="${v}">${l}</button>`).join("")}</div>`;

  if (list.length === 0) html += emptyState("🔎", "Sonuç yok", "Farklı bir arama veya filtre dene.");
  else {
    html += `<div class="tx-group-date">${list.length} işlem · Gelir ${money(sums.income)} · Gider ${money(sums.expense)}</div>`;
    const groups = {};
    for (const t of list) { const k = t.date.slice(0, 10); (groups[k] = groups[k] || []).push(t); }
    for (const k of Object.keys(groups).sort().reverse()) {
      const dt = totals(groups[k]), net = dt.income - dt.expense;
      html += `<div class="tx-group-date">${dayLabel(k + "T12:00")} · ${net >= 0 ? "+" : "−"}${money(Math.abs(net))}</div>`;
      html += '<div class="tx-list">' + groups[k].map(txRow).join("") + "</div>";
    }
  }

  el("view-tx").innerHTML = html;
  const s = el("txSearch");
  if (s) s.addEventListener("input", (e) => { state.txSearch = e.target.value; const p = e.target.selectionStart; renderTx(); const ns = el("txSearch"); if (ns) { ns.focus(); ns.setSelectionRange(p, p); } });
}

function renderCalendar() {
  const [y, m] = state.calMonth.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const startOffset = (first.getDay() + 6) % 7; // Pazartesi=0
  const daysInMonth = new Date(y, m, 0).getDate();
  const byDay = {};
  monthTx(state.calMonth).forEach((t) => { const d = new Date(t.date).getDate(); if (!byDay[d]) byDay[d] = { exp: 0, inc: 0 }; if (t.type === "expense") byDay[d].exp += baseOf(t); else if (t.type === "income") byDay[d].inc += baseOf(t); });
  const todayStr = isoDate(new Date());

  let cells = "";
  for (let i = 0; i < startOffset; i++) cells += `<div class="cal-cell empty"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${y}-${pad(m)}-${pad(d)}`;
    const info = byDay[d];
    const isToday = ds === todayStr;
    cells += `<div class="cal-cell ${info ? "has" : ""} ${isToday ? "today" : ""}" data-calday="${ds}">
      <div class="d">${d}</div>${info && info.exp ? `<div class="ce">${shortMoney(info.exp)}</div>` : ""}</div>`;
  }
  const t = totals(monthTx(state.calMonth));
  return `<div class="month-switch"><button data-calmonth="-1">‹</button><div class="m">${fmtMonthYear(state.calMonth)}</div><button data-calmonth="1">›</button></div>
    <div class="stat-grid"><div class="stat"><div class="l">Gelir</div><div class="v income">${money(t.income)}</div></div>
    <div class="stat"><div class="l">Gider</div><div class="v expense">${money(t.expense)}</div></div></div>
    <div class="card"><div class="cal-head">${DAYS_MIN.map((d) => `<span>${d}</span>`).join("")}</div>
    <div class="cal-grid">${cells}</div></div>
    <div class="center muted" style="font-size:12px;margin-top:10px">Bir güne dokun, o günün işlemlerini gör.</div>`;
}

function shortMoney(n) { if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(".", ",") + "b"; return Math.round(n).toString(); }

function openDaySheet(ds) {
  const list = sortedTx(state.transactions.filter((t) => t.date.slice(0, 10) === ds));
  const t = totals(list);
  openSheet(`<h2>${fmtDateLong(ds + "T12:00")}</h2>
    <div class="stat-grid"><div class="stat"><div class="l">Gelir</div><div class="v income">${money(t.income)}</div></div>
    <div class="stat"><div class="l">Gider</div><div class="v expense">${money(t.expense)}</div></div></div>
    <div class="spacer"></div>
    ${list.length ? '<div class="tx-list">' + list.map(txRow).join("") + "</div>" : '<div class="muted center">Bu gün kayıt yok</div>'}
    <div class="spacer"></div>`);
}

/* ==========================================================
   ANALİZ
========================================================== */
function renderStats() {
  let html = `<div class="page-head"><h1>Analiz</h1>
    <div class="theme-toggle">
      <button data-statsmode="month" class="${state.statsMode === "month" ? "active" : ""}">Ay</button>
      <button data-statsmode="year" class="${state.statsMode === "year" ? "active" : ""}">Yıl</button>
    </div></div>`;
  html += state.statsMode === "year" ? renderYearStats() : renderMonthStats();
  el("view-stats").innerHTML = html;

  if (state.statsMode === "month") {
    renderPriceHistory();
    const ps = el("priceSearch");
    if (ps) ps.addEventListener("input", (e) => { state.priceSearch = e.target.value; renderPriceHistory(); });
  }
}

function renderMonthStats() {
  const list = monthTx(state.month), t = totals(list);
  const prev = totals(monthTx(prevMonthKey(state.month)));
  const byCat = {};
  list.filter((x) => x.type === "expense").forEach((x) => { byCat[x.categoryId] = (byCat[x.categoryId] || 0) + baseOf(x); });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const maxCat = cats.length ? cats[0][1] : 0;
  const [y, m] = state.month.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const daily = new Array(daysInMonth).fill(0);
  list.filter((x) => x.type === "expense").forEach((x) => { daily[new Date(x.date).getDate() - 1] += baseOf(x); });
  const maxDaily = Math.max(...daily, 1);

  let html = `<div class="month-switch"><button data-month="-1">‹</button><div class="m">${fmtMonthYear(state.month)}</div><button data-month="1">›</button></div>
    <div class="stat-grid">
      <div class="stat"><div class="l">Gelir ${deltaBadge(t.income, prev.income, true)}</div><div class="v income">${money(t.income)}</div></div>
      <div class="stat"><div class="l">Gider ${deltaBadge(t.expense, prev.expense, false)}</div><div class="v expense">${money(t.expense)}</div></div></div>
    <div class="stat" style="margin-bottom:8px"><div class="l">Kalan (Net)</div><div class="v" style="color:${t.net >= 0 ? "var(--income)" : "var(--expense)"}">${money(t.net)}</div></div>
    <button class="btn ghost" data-action="pdf" style="margin-bottom:8px">🧾 Bu ayın raporunu PDF yap</button>`;

  if (state.month === monthKey(new Date()) && t.expense > 0) {
    const dp = Math.max(1, new Date().getDate());
    html += `<div class="forecast-card"><div class="l">📈 Ay sonu gider tahmini</div><div class="v">${money((t.expense / dp) * daysInMonth)}</div><div class="d">Bu hızla gidersen (${dp}/${daysInMonth} gün geçti)</div></div>`;
  }

  html += budgetSection(byCat);

  if (t.expense > 0) {
    html += `<div class="section-head"><h2>Günlük gider</h2></div><div class="card"><div class="trend">${daily.map((v) => `<div class="bar" style="height:${Math.max(3, (v / maxDaily) * 100)}%" title="${money(v)}"></div>`).join("")}</div><div class="trend-labels"><span>1</span><span>${Math.ceil(daysInMonth / 2)}</span><span>${daysInMonth}</span></div></div>`;
  }

  html += `<div class="section-head"><h2>Kategoriye göre gider</h2></div>`;
  if (!cats.length) html += emptyState("📊", "Bu ay gider yok", "Bu ay kayıtlı harcama bulunamadı.");
  else {
    html += '<div class="card">';
    for (const [id, val] of cats) { const c = catById(id), pct = t.expense ? Math.round((val / t.expense) * 100) : 0; html += `<div class="cat-bar"><div class="top"><div class="name"><span class="e">${c.icon}</span>${escapeHtml(c.name)}</div><div><span class="val">${money(val)}</span><span class="pct">%${pct}</span></div></div><div class="track"><div class="fill" style="width:${Math.max(4, (val / maxCat) * 100)}%;background:${c.color}"></div></div></div>`; }
    html += "</div>";
  }

  const byVendor = {};
  list.filter((x) => x.type === "expense" && x.vendor).forEach((x) => { const k = x.vendor.trim(); if (!byVendor[k]) byVendor[k] = { total: 0, count: 0 }; byVendor[k].total += baseOf(x); byVendor[k].count++; });
  const vendors = Object.entries(byVendor).sort((a, b) => b[1].total - a[1].total).slice(0, 6);
  if (vendors.length) { html += `<div class="section-head"><h2>En çok harcadığın yerler</h2></div><div class="card">`; vendors.forEach(([n, v], i) => { html += `<div class="rank-row"><div class="rk">${i + 1}</div><div class="rn">${escapeHtml(n)}<div class="rc">${v.count} işlem</div></div><div class="rv">${money(v.total)}</div></div>`; }); html += "</div>"; }

  html += inflationSection();
  html += `<div class="section-head"><h2>Ürün fiyat geçmişi</h2></div><div class="search"><span class="ic">🏷️</span><input id="priceSearch" placeholder="Ürün ara: döner, kahve, ekmek..." value="${escapeHtml(state.priceSearch)}" /></div><div id="priceResult"></div>`;
  return html;
}

function renderYearStats() {
  const yr = state.statsYear;
  const list = yearTx(yr);
  const monthly = Array.from({ length: 12 }, () => ({ inc: 0, exp: 0 }));
  list.forEach((t) => { const mi = new Date(t.date).getMonth(); if (t.type === "income") monthly[mi].inc += baseOf(t); else if (t.type === "expense") monthly[mi].exp += baseOf(t); });
  const maxV = Math.max(1, ...monthly.map((m) => Math.max(m.inc, m.exp)));
  const tot = totals(list);
  const byCat = {};
  list.filter((x) => x.type === "expense").forEach((x) => { byCat[x.categoryId] = (byCat[x.categoryId] || 0) + baseOf(x); });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxCat = cats.length ? cats[0][1] : 0;

  let html = `<div class="month-switch"><button data-year="-1">‹</button><div class="m">${yr}</div><button data-year="1">›</button></div>
    <div class="stat-grid"><div class="stat"><div class="l">Yıllık gelir</div><div class="v income">${money(tot.income)}</div></div>
    <div class="stat"><div class="l">Yıllık gider</div><div class="v expense">${money(tot.expense)}</div></div></div>
    <div class="stat" style="margin-bottom:8px"><div class="l">Yıllık net</div><div class="v" style="color:${tot.net >= 0 ? "var(--income)" : "var(--expense)"}">${money(tot.net)}</div></div>
    <button class="btn ghost" data-action="pdf" style="margin-bottom:8px">🧾 ${yr} raporunu PDF yap</button>
    <div class="section-head"><h2>Aylara göre</h2></div>
    <div class="card"><div class="year-bars">${monthly.map((mo) => `<div class="year-col"><div class="yi" style="height:${(mo.inc / maxV) * 100}%" title="Gelir ${money(mo.inc)}"></div><div class="ye" style="height:${(mo.exp / maxV) * 100}%" title="Gider ${money(mo.exp)}"></div></div>`).join("")}</div>
    <div class="year-labels">${MONTHS_SHORT.map((m) => `<span>${m[0]}</span>`).join("")}</div>
    <div class="legend"><span><i style="background:var(--income)"></i>Gelir</span><span><i style="background:var(--expense)"></i>Gider</span></div></div>`;

  if (cats.length) { html += `<div class="section-head"><h2>Yılın kategorileri</h2></div><div class="card">`; for (const [id, val] of cats) { const c = catById(id); html += `<div class="cat-bar"><div class="top"><div class="name"><span class="e">${c.icon}</span>${escapeHtml(c.name)}</div><div><span class="val">${money(val)}</span></div></div><div class="track"><div class="fill" style="width:${Math.max(4, (val / maxCat) * 100)}%;background:${c.color}"></div></div></div>`; } html += "</div>"; }
  return html;
}

function deltaBadge(now, before, higherIsGood) {
  if (!before) return "";
  const diff = now - before; if (Math.abs(diff) < 0.01) return `<span class="delta flat">≈</span>`;
  const pct = Math.round((diff / before) * 100), up = diff > 0, good = higherIsGood ? up : !up;
  return `<span class="delta ${good ? "down" : "up"}">${up ? "▲" : "▼"} %${Math.abs(pct)}</span>`;
}

function budgetSection(byCat) {
  if (!state.budgets.length) return "";
  let rows = "";
  for (const b of state.budgets) {
    if (!b.limit) continue;
    const c = catById(b.categoryId), spent = byCat[b.categoryId] || 0, ratio = spent / b.limit;
    const cls = ratio >= 1 ? "over" : ratio >= 0.8 ? "warn" : "ok";
    rows += `<div class="cat-bar budget-bar"><div class="top"><div class="name"><span class="e">${c.icon}</span>${escapeHtml(c.name)}</div><div><span class="val">${money(spent)}</span><span class="pct">/ ${money(b.limit)}</span></div></div><div class="track"><div class="fill ${cls}" style="width:${Math.min(100, ratio * 100)}%"></div></div><div class="sub">${ratio >= 1 ? "Aşıldı 🚨" : "Kalan " + money(b.limit - spent)}</div></div>`;
  }
  return rows ? `<div class="section-head"><h2>Bütçeler</h2><button class="link" data-action="budgets">Düzenle</button></div><div class="card">${rows}</div>` : "";
}

function inflationSection() {
  const map = {};
  state.transactions.filter((t) => t.type === "expense" && t.item).forEach((t) => { const k = t.item.toLowerCase().trim(); (map[k] = map[k] || []).push(t); });
  const risers = [];
  for (const k in map) {
    const arr = map[k].sort((a, b) => a.date < b.date ? -1 : 1); if (arr.length < 2) continue;
    const first = arr[0].amount, last = arr[arr.length - 1].amount; if (first <= 0) continue;
    risers.push({ name: arr[arr.length - 1].item, pct: ((last - first) / first) * 100, first, last });
  }
  if (!risers.length) return "";
  const avg = risers.reduce((a, b) => a + b.pct, 0) / risers.length;
  const top = risers.filter((r) => Math.abs(r.pct) >= 1).sort((a, b) => b.pct - a.pct).slice(0, 4);
  const rows = top.map((r) => `<div class="rank-row"><div class="rn">${escapeHtml(r.name)}<div class="rc">${money(r.first)} → ${money(r.last)}</div></div><div class="rv" style="color:${r.pct >= 0 ? "var(--expense)" : "var(--income)"}">${r.pct >= 0 ? "+" : ""}%${Math.round(r.pct)}</div></div>`).join("");
  return `<div class="section-head"><h2>Kişisel enflasyonun</h2></div><div class="card"><div class="rank-row"><div class="rn">Takip edilen ürünlerde ortalama</div><div class="rv" style="color:${avg >= 0 ? "var(--expense)" : "var(--income)"}">${avg >= 0 ? "+" : ""}%${Math.round(avg)}</div></div>${rows}</div>`;
}

function renderPriceHistory() {
  const box = el("priceResult"); if (!box) return;
  const q = state.priceSearch.toLowerCase().trim();
  if (!q) { box.innerHTML = `<div class="card center muted" style="font-size:14px">Bir ürün adı yaz, ne zaman nereden kaça aldığını gör.<br>Örn: <b>döner</b> → fiyatının zamanla değişimi.</div>`; return; }
  const matches = state.transactions.filter((t) => t.type === "expense" && [t.item, t.vendor].some((f) => (f || "").toLowerCase().includes(q))).sort((a, b) => a.date < b.date ? -1 : 1);
  if (!matches.length) { box.innerHTML = `<div class="card center muted" style="font-size:14px">"${escapeHtml(q)}" için kayıt yok.</div>`; return; }
  const prices = matches.map((t) => t.amount), min = Math.min(...prices), max = Math.max(...prices), avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  let html = `<div class="stat-grid"><div class="stat"><div class="l">En düşük</div><div class="v" style="font-size:17px">${money(min)}</div></div><div class="stat"><div class="l">En yüksek</div><div class="v" style="font-size:17px">${money(max)}</div></div></div><div class="stat" style="margin-bottom:10px"><div class="l">Ortalama (${matches.length} kayıt)</div><div class="v" style="font-size:17px">${money(avg)}</div></div><div class="card">`;
  [...matches].reverse().forEach((t) => {
    const idx = matches.indexOf(t), before = idx > 0 ? matches[idx - 1].amount : null;
    let tr = ""; if (before !== null) { if (t.amount > before) tr = `<span class="price-trend up">▲ ${money(t.amount - before)}</span>`; else if (t.amount < before) tr = `<span class="price-trend down">▼ ${money(before - t.amount)}</span>`; }
    html += `<div class="price-row"><div><div class="when">${fmtDateLong(t.date)}</div><div class="where">${escapeHtml(t.vendor || t.item || "")}</div></div><div><span class="price">${money(t.amount, t.currency)}</span>${tr}</div></div>`;
  });
  box.innerHTML = html + "</div>";
}

/* ==========================================================
   AYARLAR
========================================================== */
async function renderSettings() {
  const total = state.transactions.length;
  const lockEnabled = await DB.getMeta("lockEnabled", false);
  const notifyEnabled = await DB.getMeta("notifyEnabled", false);
  const bioEnabled = await DB.getMeta("bioEnabled", false);
  const bioOk = await bioAvailable();

  el("view-settings").innerHTML = `
    <div class="page-head"><h1>Ayarlar</h1></div>

    <div class="settings-group">
      <div class="settings-item"><div class="si-ic">🎨</div><div class="si-main"><div class="si-title">Görünüm</div><div class="si-desc">Tema tercihi</div></div>
        <div class="theme-toggle">${["system", "light", "dark"].map((m) => `<button data-theme-set="${m}" class="${state.settings.theme === m ? "active" : ""}">${m === "system" ? "Sistem" : m === "light" ? "Açık" : "Koyu"}</button>`).join("")}</div></div>
      <div class="settings-item"><div class="si-ic">💱</div><div class="si-main"><div class="si-title">Para birimi</div><div class="si-desc">Ana birim · kurlar otomatik güncellenir</div></div>
        <select class="cur-select" id="curSelect">${CURRENCIES.map((c) => `<option value="${c}" ${state.settings.currency === c ? "selected" : ""}>${c} ${CURRENCY_SYMBOLS[c] || ""}</option>`).join("")}</select></div>
    </div>

    <div class="settings-group">
      <div class="settings-item"><div class="si-ic">🔒</div><div class="si-main"><div class="si-title">Uygulama kilidi</div><div class="si-desc">Açılışta PIN iste</div></div>
        <label class="switch"><input type="checkbox" id="lockToggle" ${lockEnabled ? "checked" : ""}><span class="sl"></span></label></div>
      ${lockEnabled && bioOk ? `<div class="settings-item"><div class="si-ic">☝️</div><div class="si-main"><div class="si-title">Parmak izi / yüz ile aç</div><div class="si-desc">Cihaz biyometriğini kullan</div></div>
        <label class="switch"><input type="checkbox" id="bioToggle" ${bioEnabled ? "checked" : ""}><span class="sl"></span></label></div>` : ""}
      ${lockEnabled ? `<div class="settings-item" data-action="changepin"><div class="si-ic">🔑</div><div class="si-main"><div class="si-title">PIN'i değiştir</div></div><div class="si-action">›</div></div>` : ""}
      <div class="settings-item"><div class="si-ic">🔔</div><div class="si-main"><div class="si-title">Bildirimler</div><div class="si-desc">Bütçe aşımı & yaklaşan ödemeler</div></div>
        <label class="switch"><input type="checkbox" id="notifyToggle" ${notifyEnabled ? "checked" : ""}><span class="sl"></span></label></div>
    </div>

    <div class="settings-group">
      <div class="settings-item" data-action="wallets"><div class="si-ic">💳</div><div class="si-main"><div class="si-title">Cüzdanlar / hesaplar</div><div class="si-desc">${state.wallets.length} cüzdan</div></div><div class="si-action">›</div></div>
      <div class="settings-item" data-action="goals"><div class="si-ic">🎯</div><div class="si-main"><div class="si-title">Hedefler</div><div class="si-desc">${state.goals.length} hedef</div></div><div class="si-action">›</div></div>
      <div class="settings-item" data-action="budgets"><div class="si-ic">📉</div><div class="si-main"><div class="si-title">Bütçeler</div><div class="si-desc">${state.budgets.filter((b) => b.limit).length} kategoride limit</div></div><div class="si-action">›</div></div>
      <div class="settings-item" data-action="recurring"><div class="si-ic">🔁</div><div class="si-main"><div class="si-title">Tekrarlayan işlemler</div><div class="si-desc">${state.recurring.filter((r) => r.active).length} aktif</div></div><div class="si-action">›</div></div>
      <div class="settings-item" data-action="manage-cats"><div class="si-ic">🏷️</div><div class="si-main"><div class="si-title">Kategoriler</div><div class="si-desc">${state.categories.length} kategori</div></div><div class="si-action">›</div></div>
    </div>

    <div class="settings-group">
      <div class="settings-item" data-action="export"><div class="si-ic">⬇️</div><div class="si-main"><div class="si-title">Yedek al (JSON)</div><div class="si-desc">${total} işlem</div></div><div class="si-action">›</div></div>
      <div class="settings-item" data-action="csv"><div class="si-ic">📊</div><div class="si-main"><div class="si-title">CSV dışa aktar</div><div class="si-desc">Excel / Sheets</div></div><div class="si-action">›</div></div>
      <div class="settings-item" data-action="import"><div class="si-ic">⬆️</div><div class="si-main"><div class="si-title">Yedeği geri yükle</div></div><div class="si-action">›</div></div>
    </div>

    <div class="settings-group">
      <div class="settings-item" data-action="wipe"><div class="si-ic">🗑️</div><div class="si-main"><div class="si-title" style="color:var(--expense)">Tüm veriyi sil</div><div class="si-desc">Geri alınamaz</div></div><div class="si-action">›</div></div>
    </div>

    <div class="center muted" style="font-size:12px;margin-top:24px;line-height:1.6">Mani · Verilerin yalnızca bu cihazda saklanır.<br>Düzenli olarak yedek almayı unutma.</div>
    <input type="file" id="importFile" accept="application/json,.json" class="hidden" />`;

  const fi = el("importFile"); if (fi) fi.addEventListener("change", handleImportFile);
  const cs = el("curSelect"); if (cs) cs.addEventListener("change", async (e) => { state.settings.currency = e.target.value; await DB.setMeta("currency", state.settings.currency); await ensureRates(); toast("Para birimi: " + state.settings.currency); refreshActiveView(); });
  const lt = el("lockToggle"); if (lt) lt.addEventListener("change", (e) => toggleLock(e.target.checked));
  const bt = el("bioToggle"); if (bt) bt.addEventListener("change", (e) => toggleBio(e.target.checked));
  const nt = el("notifyToggle"); if (nt) nt.addEventListener("change", (e) => toggleNotify(e.target.checked));
}

/* ==========================================================
   Bottom Sheet
========================================================== */
function openSheet(html) {
  const wasOpen = isSheetOpen();
  el("sheet").innerHTML = '<div class="grabber"></div>' + html;
  el("backdrop").classList.add("open");
  requestAnimationFrame(() => el("sheet").classList.add("open"));
  if (!wasOpen) history.pushState({ mani: "sheet" }, "");
}
function doCloseSheet() { el("sheet").classList.remove("open"); el("backdrop").classList.remove("open"); }
function closeSheet() { if (!isSheetOpen()) return; doCloseSheet(); if (history.state && history.state.mani === "sheet") { skipPop = true; history.back(); } }

/* ---- İşlem formu ---- */
function openTxForm(data) {
  const editing = !!(data && data.id);
  const src = data || {};
  state.editId = editing ? data.id : null;
  state.formType = src.type || "expense";
  state.formCat = src.categoryId || null;
  state.formPhoto = src.photo || null;
  state.formCurrency = src.currency || state.settings.currency;
  state.formWallet = src.walletId || (state.wallets[0] && state.wallets[0].id);
  state.formFrom = src.fromWallet || (state.wallets[0] && state.wallets[0].id);
  state.formTo = src.toWallet || (state.wallets[1] && state.wallets[1].id) || (state.wallets[0] && state.wallets[0].id);
  state.formInstallments = 1;
  const dateDefault = editing ? new Date(src.date) : new Date();

  openSheet(`
    <h2>${editing ? "İşlemi düzenle" : "Yeni işlem"}</h2>
    <div class="segment" id="segType">
      <button class="exp ${state.formType === "expense" ? "active" : ""}" data-type="expense">Gider</button>
      <button class="inc ${state.formType === "income" ? "active" : ""}" data-type="income">Gelir</button>
      <button class="inc ${state.formType === "transfer" ? "active" : ""}" data-type="transfer">Transfer</button>
    </div>
    <div class="field"><div class="amount-input"><span class="cur" id="curSym">${sym(state.formCurrency)}</span>
      <input id="fAmount" inputmode="decimal" placeholder="0" value="${src.amount != null ? String(src.amount).replace(".", ",") : ""}" />
      <select class="cur-select" id="fCurrency">${CURRENCIES.map((c) => `<option value="${c}" ${state.formCurrency === c ? "selected" : ""}>${c}</option>`).join("")}</select></div>
      <div class="conv-hint" id="convHint"></div></div>

    <div id="transferFields" class="${state.formType === "transfer" ? "" : "hidden"}">
      <div class="field"><label>Cüzdanlar arası transfer</label>
        <div class="transfer-pick">
          <select class="select" id="fFrom">${state.wallets.map((w) => `<option value="${w.id}" ${state.formFrom === w.id ? "selected" : ""}>${w.icon} ${escapeHtml(w.name)}</option>`).join("")}</select>
          <span class="arrow">→</span>
          <select class="select" id="fTo">${state.wallets.map((w) => `<option value="${w.id}" ${state.formTo === w.id ? "selected" : ""}>${w.icon} ${escapeHtml(w.name)}</option>`).join("")}</select>
        </div></div>
    </div>

    <div id="normalFields" class="${state.formType === "transfer" ? "hidden" : ""}">
      <div class="field"><label>Kategori</label><div class="chips" id="fChips"></div></div>
      <div class="field"><label>Cüzdan / hesap</label><div class="chips" id="fWallets"></div></div>
      <div class="field" id="instField"></div>
      <div class="field"><label>Ne aldın / ne için? <span class="muted">(örn. Porsiyon Döner)</span></label><input class="input" id="fItem" list="dlItems" placeholder="Ürün veya açıklama" value="${escapeHtml(src.item || "")}" /></div>
      <div class="field"><label>Nerede / kimden?</label><input class="input" id="fVendor" list="dlVendors" placeholder="İşletme veya kişi" value="${escapeHtml(src.vendor || "")}" /></div>
      <div class="field"><label>Etiketler <span class="muted">(virgülle ayır)</span></label><input class="input" id="fTags" placeholder="örn. nakit, iş, tatil" value="${escapeHtml((src.tags || []).join(", "))}" /></div>
      <div class="field"><label>Fiş / fotoğraf</label><div id="photoBox"></div><input type="file" id="fPhoto" accept="image/*" capture="environment" class="hidden" /></div>
    </div>

    <div class="field"><label>Tarih ve saat</label><input class="input" id="fDate" type="datetime-local" value="${toLocalInput(dateDefault)}" /></div>
    <div class="field"><label>Not <span class="muted">(isteğe bağlı)</span></label><textarea class="textarea" id="fNote" placeholder="...">${escapeHtml(src.note || "")}</textarea></div>

    <button class="btn" id="fSave">${editing ? "Değişiklikleri kaydet" : "Kaydet"}</button>
    ${editing ? '<div class="btn-row"><button class="btn danger-ghost" id="fDelete">İşlemi sil</button></div>' : ""}
    <div class="spacer"></div>
    <datalist id="dlItems">${distinct("item").map((v) => `<option value="${escapeHtml(v)}">`).join("")}</datalist>
    <datalist id="dlVendors">${distinct("vendor").map((v) => `<option value="${escapeHtml(v)}">`).join("")}</datalist>`);

  renderChips(); renderWalletChips(); renderPhotoBox(); updateConvHint(); renderInstField(editing, src);

  $("#segType").addEventListener("click", (e) => {
    const b = e.target.closest("[data-type]"); if (!b) return;
    state.formType = b.dataset.type;
    $("#segType").querySelectorAll("button").forEach((x) => x.classList.toggle("active", x.dataset.type === state.formType));
    $("#transferFields").classList.toggle("hidden", state.formType !== "transfer");
    $("#normalFields").classList.toggle("hidden", state.formType === "transfer");
    if (state.formType !== "transfer") { state.formCat = null; renderChips(); }
  });
  $("#fChips").addEventListener("click", (e) => { const c = e.target.closest("[data-cat]"); if (!c) return; state.formCat = c.dataset.cat; renderChips(); });
  $("#fWallets").addEventListener("click", (e) => { const w = e.target.closest("[data-wal]"); if (!w) return; state.formWallet = w.dataset.wal; renderWalletChips(); });
  $("#fCurrency").addEventListener("change", (e) => { state.formCurrency = e.target.value; $("#curSym").textContent = sym(state.formCurrency); updateConvHint(); });
  $("#fAmount").addEventListener("input", () => { updateConvHint(); updateInstHint(); });
  $("#fDate").addEventListener("change", updateInstHint);
  $("#fFrom").addEventListener("change", (e) => { state.formFrom = e.target.value; });
  $("#fTo").addEventListener("change", (e) => { state.formTo = e.target.value; });
  $("#fPhoto").addEventListener("change", async (e) => { const f = e.target.files[0]; if (!f) return; toast("Fotoğraf işleniyor..."); state.formPhoto = await readPhoto(f); renderPhotoBox(); });
  $("#fSave").addEventListener("click", saveTxFromForm);
  if (editing) $("#fDelete").addEventListener("click", () => deleteTx(data.id));
  setTimeout(() => $("#fAmount") && $("#fAmount").focus(), 350);
}

function updateConvHint() {
  const box = $("#convHint"); if (!box) return;
  if (state.formCurrency === state.settings.currency) { box.textContent = ""; return; }
  const amt = parseAmount($("#fAmount") ? $("#fAmount").value : "0");
  const r = getRate(state.formCurrency);
  if (r == null) { box.textContent = "Kur bilgisi yok (çevrimdışı) — tutar ana birime çevrilmeden kaydedilir."; return; }
  box.textContent = `≈ ${money(amt * r)} (ana birim)`;
}

function renderChips() {
  const box = $("#fChips"); if (!box) return;
  const cats = state.categories.filter((c) => c.type === state.formType);
  if (!state.formCat && cats.length) state.formCat = cats[0].id;
  box.innerHTML = cats.map((c) => `<button class="chip ${state.formCat === c.id ? "active" : ""}" data-cat="${c.id}"><span class="e">${c.icon}</span>${escapeHtml(c.name)}</button>`).join("");
}

function addMonths(date, n) {
  const d = new Date(date), day = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return d;
}
function renderInstField(editing, src) {
  const box = $("#instField"); if (!box) return;
  if (editing && src && src.installmentCount > 1) {
    box.innerHTML = `<div class="alert warn" style="margin:0"><span class="ai">💳</span><div>Bu, bir taksit planının <b>${src.installmentNo}/${src.installmentCount}</b> taksidi. Düzenlersen yalnızca bu taksit değişir.</div></div>`;
    return;
  }
  if (editing) { box.innerHTML = ""; return; }
  const vals = [1, 2, 3, 4, 5, 6, 9, 12];
  box.innerHTML = `<label>Taksit <span class="muted">(varsayılan tek çekim)</span></label>
    <div class="chips" id="fInst">${vals.map((v) => `<button class="chip ${state.formInstallments === v ? "active" : ""}" data-inst="${v}">${v === 1 ? "Tek çekim" : v + " taksit"}</button>`).join("")}</div>
    <div class="conv-hint" id="instHint"></div>`;
  $("#fInst").addEventListener("click", (e) => { const b = e.target.closest("[data-inst]"); if (!b) return; state.formInstallments = +b.dataset.inst; renderInstField(false, null); updateInstHint(); });
  updateInstHint();
}
function updateInstHint() {
  const h = $("#instHint"); if (!h) return;
  const n = state.formInstallments;
  if (n <= 1) { h.textContent = ""; return; }
  const amt = parseAmount($("#fAmount") ? $("#fAmount").value : "0");
  const day = new Date(($("#fDate") && $("#fDate").value) || Date.now()).getDate();
  if (amt > 0) { const part = Math.round((amt / n) * 100) / 100; h.textContent = `Toplam ${money(amt, state.formCurrency)} → ${n} ay boyunca her ayın ${day}'inde ${money(part, state.formCurrency)}`; }
  else h.textContent = `${n} eşit taksite bölünür`;
}
function renderWalletChips() {
  const box = $("#fWallets"); if (!box) return;
  box.innerHTML = state.wallets.map((w) => `<button class="chip ${state.formWallet === w.id ? "active" : ""}" data-wal="${w.id}"><span class="e">${w.icon}</span>${escapeHtml(w.name)}</button>`).join("");
}
function renderPhotoBox() {
  const box = $("#photoBox"); if (!box) return;
  if (state.formPhoto) { box.innerHTML = `<div class="photo-preview"><img src="${state.formPhoto}" alt="fiş"><button class="rm" id="rmPhoto">✕</button></div>`; $("#rmPhoto").addEventListener("click", () => { state.formPhoto = null; renderPhotoBox(); }); }
  else { box.innerHTML = `<button class="photo-add" id="addPhoto">📷 Fotoğraf / fiş ekle</button>`; $("#addPhoto").addEventListener("click", () => $("#fPhoto").click()); }
}
function readPhoto(file) {
  return new Promise((res) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => { const max = 1100; let w = img.width, h = img.height; if (w > h && w > max) { h = h * max / w; w = max; } else if (h > max) { w = w * max / h; h = max; } const c = document.createElement("canvas"); c.width = w; c.height = h; c.getContext("2d").drawImage(img, 0, 0, w, h); URL.revokeObjectURL(url); try { res(c.toDataURL("image/jpeg", 0.7)); } catch (e) { res(null); } };
    img.onerror = () => { URL.revokeObjectURL(url); res(null); };
    img.src = url;
  });
}

async function saveTxFromForm() {
  const amount = parseAmount($("#fAmount").value);
  if (amount <= 0) { toast("Geçerli bir tutar gir"); return; }
  const cur = state.formCurrency || state.settings.currency;
  const rate = getRate(cur);
  const dateVal = $("#fDate").value || toLocalInput(new Date());
  const createdAt = state.editId ? (state.transactions.find((x) => x.id === state.editId)?.createdAt || Date.now()) : Date.now();

  let t;
  if (state.formType === "transfer") {
    if (state.formFrom === state.formTo) { toast("Farklı cüzdanlar seç"); return; }
    t = { id: state.editId || DB.uid("tx"), type: "transfer", amount, currency: cur, rate, baseAmount: toBase(amount, cur), fromWallet: state.formFrom, toWallet: state.formTo, note: $("#fNote").value.trim(), date: dateVal, createdAt };
  } else {
    if (!state.formCat) { toast("Bir kategori seç"); return; }
    const tags = $("#fTags").value.split(",").map((s) => s.trim()).filter(Boolean);
    const item = $("#fItem").value.trim(), vendor = $("#fVendor").value.trim(), note = $("#fNote").value.trim();

    // Taksitli: yeni kayıtta aylara böl
    if (!state.editId && state.formInstallments > 1) {
      const n = state.formInstallments, total = amount, part = Math.round((total / n) * 100) / 100;
      const instId = DB.uid("ins"), baseDate = new Date(dateVal);
      for (let k = 0; k < n; k++) {
        const partAmt = k === n - 1 ? Math.round((total - part * (n - 1)) * 100) / 100 : part;
        const d = addMonths(baseDate, k);
        const tt = { id: DB.uid("tx"), type: state.formType, amount: partAmt, currency: cur, rate, baseAmount: toBase(partAmt, cur), categoryId: state.formCat, walletId: state.formWallet, item, vendor, tags, note, photo: k === 0 ? (state.formPhoto || null) : null, date: toLocalInput(d), createdAt: Date.now() + k, installmentId: instId, installmentNo: k + 1, installmentCount: n, installmentTotal: total };
        await DB.saveTransaction(tt); state.transactions.push(tt);
      }
      await DB.setMeta("lastWallet", state.formWallet);
      closeSheet(); toast(`${n} taksit oluşturuldu ✓`); refreshActiveView(); return;
    }

    t = { id: state.editId || DB.uid("tx"), type: state.formType, amount, currency: cur, rate, baseAmount: toBase(amount, cur), categoryId: state.formCat, walletId: state.formWallet, item, vendor, tags, note, photo: state.formPhoto || null, date: dateVal, createdAt };
    const old = state.editId && state.transactions.find((x) => x.id === state.editId);
    if (old && old.recurringId) t.recurringId = old.recurringId;
    if (old && old.installmentId) { t.installmentId = old.installmentId; t.installmentNo = old.installmentNo; t.installmentCount = old.installmentCount; t.installmentTotal = old.installmentTotal; }
    await DB.setMeta("lastWallet", state.formWallet);
  }

  await DB.saveTransaction(t);
  const idx = state.transactions.findIndex((x) => x.id === t.id);
  if (idx >= 0) state.transactions[idx] = t; else state.transactions.push(t);
  closeSheet(); toast(state.editId ? "Güncellendi ✓" : "Kaydedildi ✓"); refreshActiveView();
}

async function deleteTx(id) {
  const t = state.transactions.find((x) => x.id === id);
  if (!confirm("Bu işlemi silmek istediğine emin misin?")) return;
  if (t && t.installmentId) {
    const all = confirm("Bu, bir taksit planının parçası.\n\nTÜM taksitleri silmek için: Tamam\nSadece bu taksidi silmek için: İptal");
    if (all) {
      const ids = state.transactions.filter((x) => x.installmentId === t.installmentId).map((x) => x.id);
      for (const i of ids) await DB.deleteTransaction(i);
      state.transactions = state.transactions.filter((x) => x.installmentId !== t.installmentId);
      closeSheet(); toast(`${ids.length} taksit silindi`); refreshActiveView(); return;
    }
  }
  await DB.deleteTransaction(id);
  state.transactions = state.transactions.filter((x) => x.id !== id);
  closeSheet(); toast("Silindi"); refreshActiveView();
}

/* ---- Kategori yönetimi ---- */
function openCatManager() {
  const render = () => {
    const exp = state.categories.filter((c) => c.type === "expense"), inc = state.categories.filter((c) => c.type === "income");
    const rows = (arr) => arr.map((c) => `<div class="row"><span class="e">${c.icon}</span><span class="n">${escapeHtml(c.name)}</span><button class="x" data-del-cat="${c.id}">✕</button></div>`).join("");
    openSheet(`<h2>Kategoriler</h2>
      <div class="field"><label>Yeni kategori</label><div class="btn-row" style="margin-top:0"><input class="input" id="ncIcon" placeholder="😀" style="flex:0 0 64px;text-align:center" maxlength="2" /><input class="input" id="ncName" placeholder="Kategori adı" style="flex:1" /></div>
        <div class="segment" id="ncType" style="margin:10px 0"><button class="exp active" data-nctype="expense">Gider</button><button class="inc" data-nctype="income">Gelir</button></div>
        <button class="btn" id="ncAdd">Ekle</button></div>
      <div class="section-head" style="margin-top:14px"><h2 style="font-size:15px">Giderler</h2></div><div class="cat-manage">${rows(exp) || '<div class="muted center">Yok</div>'}</div>
      <div class="section-head"><h2 style="font-size:15px">Gelirler</h2></div><div class="cat-manage">${rows(inc) || '<div class="muted center">Yok</div>'}</div><div class="spacer"></div>`);
    let nt = "expense";
    $("#ncType").addEventListener("click", (e) => { const b = e.target.closest("[data-nctype]"); if (!b) return; nt = b.dataset.nctype; $("#ncType").querySelectorAll("button").forEach((x) => x.classList.toggle("active", x.dataset.nctype === nt)); });
    $("#ncAdd").addEventListener("click", async () => { const name = $("#ncName").value.trim(), icon = $("#ncIcon").value.trim() || "🏷️"; if (!name) { toast("İsim gir"); return; } const pal = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#0ea5e9"]; const c = { id: DB.uid("cat"), name, type: nt, icon, color: pal[Math.floor(Math.random() * pal.length)] }; await DB.saveCategory(c); state.categories.push(c); toast("Eklendi ✓"); render(); });
    el("sheet").querySelectorAll("[data-del-cat]").forEach((b) => b.addEventListener("click", async () => { const id = b.dataset.delCat; if (state.transactions.some((t) => t.categoryId === id) && !confirm("Bu kategoride işlemler var. Silinsin mi?")) return; await DB.deleteCategory(id); state.categories = state.categories.filter((c) => c.id !== id); render(); }));
  };
  render();
}

/* ---- Cüzdan yönetimi ---- */
function openWalletManager() {
  const render = () => {
    const rows = state.wallets.map((w) => `<div class="row"><span class="e">${w.icon}</span><span class="n">${escapeHtml(w.name)}<div class="rc" style="font-size:12px;color:var(--text-3)">${money(walletBalance(w.id))}</div></span><button class="x" data-del-wal="${w.id}">✕</button></div>`).join("");
    openSheet(`<h2>Cüzdanlar / hesaplar</h2>
      <div class="field"><label>Yeni cüzdan</label><div class="btn-row" style="margin-top:0"><input class="input" id="nwIcon" placeholder="👛" style="flex:0 0 64px;text-align:center" maxlength="2" /><input class="input" id="nwName" placeholder="Cüzdan adı" style="flex:1" /></div><button class="btn" id="nwAdd" style="margin-top:10px">Ekle</button></div>
      <div class="cat-manage">${rows}</div><div class="spacer"></div>`);
    $("#nwAdd").addEventListener("click", async () => { const name = $("#nwName").value.trim(), icon = $("#nwIcon").value.trim() || "👛"; if (!name) { toast("İsim gir"); return; } const pal = ["#10b981", "#6366f1", "#0ea5e9", "#f59e0b", "#ec4899", "#14b8a6"]; const w = { id: DB.uid("w"), name, icon, color: pal[Math.floor(Math.random() * pal.length)] }; await DB.saveWallet(w); state.wallets.push(w); toast("Eklendi ✓"); render(); });
    el("sheet").querySelectorAll("[data-del-wal]").forEach((b) => b.addEventListener("click", async () => { const id = b.dataset.delWal; if (state.wallets.length <= 1) { toast("En az bir cüzdan olmalı"); return; } if (state.transactions.some((t) => t.walletId === id || t.fromWallet === id || t.toWallet === id) && !confirm("Bu cüzdanda işlemler var. Silinsin mi?")) return; await DB.deleteWallet(id); state.wallets = state.wallets.filter((w) => w.id !== id); render(); }));
  };
  render();
}

/* ---- Hedef yönetimi ---- */
function openGoalManager() {
  const render = () => {
    openSheet(`<h2>Hedefler</h2>
      <div class="muted" style="font-size:13px;margin-bottom:14px">Tasarruf hedeflerini takip et. Para ekledikçe çubuk dolar.</div>
      ${state.goals.map(goalCard).join("") || '<div class="muted center" style="margin-bottom:14px">Henüz hedef yok</div>'}
      <button class="btn ghost" id="addGoal">+ Yeni hedef</button><div class="spacer"></div>`);
    $("#addGoal").addEventListener("click", openGoalForm);
  };
  render();
}
function openGoalForm() {
  openSheet(`<h2>Yeni hedef</h2>
    <div class="field"><label>Hedef adı</label><input class="input" id="goName" placeholder="örn. Tatil, Yeni telefon" /></div>
    <div class="field"><label>İkon</label><input class="input" id="goIcon" placeholder="🎯" maxlength="2" style="width:80px;text-align:center" /></div>
    <div class="field"><div class="amount-input"><span class="cur">${sym()}</span><input id="goTarget" inputmode="decimal" placeholder="Hedef tutar" /></div></div>
    <div class="field"><div class="amount-input"><span class="cur">${sym()}</span><input id="goSaved" inputmode="decimal" placeholder="Şu an biriken (0)" /></div></div>
    <button class="btn" id="goSave">Kaydet</button><div class="spacer"></div>`);
  $("#goSave").addEventListener("click", async () => {
    const name = $("#goName").value.trim(), target = parseAmount($("#goTarget").value);
    if (!name || target <= 0) { toast("Ad ve hedef tutar gir"); return; }
    const pal = ["#6366f1", "#10b981", "#f59e0b", "#ec4899", "#0ea5e9"];
    const g = { id: DB.uid("goal"), name, icon: $("#goIcon").value.trim() || "🎯", target, saved: parseAmount($("#goSaved").value), color: pal[Math.floor(Math.random() * pal.length)], createdAt: Date.now() };
    await DB.saveGoal(g); state.goals.push(g); toast("Hedef eklendi ✓"); openGoalManager(); refreshActiveView();
  });
}
function goalContribute(id, sign, fromManager) {
  const g = state.goals.find((x) => x.id === id); if (!g) return;
  openSheet(`<h2>${sign > 0 ? "Para ekle" : "Para çıkar"} — ${escapeHtml(g.name)}</h2>
    <div class="field"><div class="amount-input"><span class="cur">${sym()}</span><input id="gcAmount" inputmode="decimal" placeholder="Tutar" /></div></div>
    <div class="muted" style="font-size:13px;margin-bottom:12px">Mevcut: ${money(g.saved)} / ${money(g.target)}</div>
    <button class="btn" id="gcSave">Onayla</button><div class="spacer"></div>`);
  setTimeout(() => $("#gcAmount") && $("#gcAmount").focus(), 350);
  $("#gcSave").addEventListener("click", async () => {
    const amt = parseAmount($("#gcAmount").value); if (amt <= 0) { toast("Tutar gir"); return; }
    g.saved = Math.max(0, g.saved + sign * amt); await DB.saveGoal(g);
    toast("Güncellendi ✓"); if (fromManager) openGoalManager(); else closeSheet(); refreshActiveView();
  });
}

/* ---- Bütçe yönetimi ---- */
function openBudgetManager() {
  const exp = state.categories.filter((c) => c.type === "expense");
  openSheet(`<h2>Aylık bütçeler</h2><div class="muted" style="font-size:13px;margin-bottom:14px">Her kategori için aylık limit belirle. Limite yaklaşınca uyarılırsın.</div>
    <div class="cat-manage" id="budgetList">${exp.map((c) => { const b = budgetFor(c.id); return `<div class="row"><span class="e">${c.icon}</span><span class="n">${escapeHtml(c.name)}</span><div class="amount-input" style="flex:0 0 130px;padding:2px 10px"><span class="cur" style="font-size:16px">${sym()}</span><input inputmode="decimal" data-budget="${c.id}" placeholder="0" value="${b && b.limit ? String(b.limit).replace(".", ",") : ""}" style="font-size:18px;padding:6px 0" /></div></div>`; }).join("")}</div>
    <button class="btn" id="saveBudgets" style="margin-top:14px">Kaydet</button><div class="spacer"></div>`);
  $("#saveBudgets").addEventListener("click", async () => {
    for (const inp of el("sheet").querySelectorAll("[data-budget]")) { const id = inp.dataset.budget, v = parseAmount(inp.value); if (v > 0) await DB.saveBudget({ categoryId: id, limit: v }); else await DB.deleteBudget(id); }
    state.budgets = await DB.getBudgets(); closeSheet(); toast("Bütçeler kaydedildi ✓"); refreshActiveView();
  });
}

/* ---- Tekrarlayanlar ---- */
function openRecurringManager() {
  const render = () => {
    const rows = state.recurring.map((r) => { const c = catById(r.categoryId); return `<div class="rec-row"><span class="e">${c.icon}</span><div class="m"><div class="rt">${escapeHtml(r.item || c.name)}</div><div class="rd">${FREQ_TR[r.frequency]} · sonraki: ${fmtDateLong(r.nextDate + "T12:00")}${r.active ? "" : " · durduruldu"}</div></div><div class="amt ${r.type}">${r.type === "income" ? "+" : "−"}${money(r.amount, r.currency).replace("-", "")}</div><button class="x" data-del-rec="${r.id}">✕</button></div>`; }).join("");
    openSheet(`<h2>Tekrarlayan işlemler</h2><div class="muted" style="font-size:13px;margin-bottom:14px">Kira, maaş, abonelik gibi düzenli işlemler; uygulamayı açtığında vadesi gelenler otomatik eklenir.</div>${rows || '<div class="muted center" style="margin-bottom:14px">Henüz yok</div>'}<button class="btn ghost" id="addRec">+ Yeni tekrarlayan</button><div class="spacer"></div>`);
    el("sheet").querySelectorAll("[data-del-rec]").forEach((b) => b.addEventListener("click", async () => { if (!confirm("Silinsin mi? (geçmiş kayıtlar kalır)")) return; await DB.deleteRecurring(b.dataset.delRec); state.recurring = state.recurring.filter((r) => r.id !== b.dataset.delRec); render(); }));
    $("#addRec").addEventListener("click", openRecurringForm);
  };
  render();
}
function openRecurringForm() {
  let rType = "expense", rCat = null, rFreq = "monthly", rWallet = state.wallets[0] && state.wallets[0].id;
  openSheet(`<h2>Yeni tekrarlayan</h2>
    <div class="segment" id="rSeg"><button class="exp active" data-rt="expense">Gider</button><button class="inc" data-rt="income">Gelir</button></div>
    <div class="field"><div class="amount-input"><span class="cur">${sym()}</span><input id="rAmount" inputmode="decimal" placeholder="0" /></div></div>
    <div class="field"><label>Kategori</label><div class="chips" id="rChips"></div></div>
    <div class="field"><label>Cüzdan</label><div class="chips" id="rWallets"></div></div>
    <div class="field"><label>Açıklama</label><input class="input" id="rItem" placeholder="örn. Ev kirası, Netflix, Maaş" /></div>
    <div class="field"><label>Sıklık</label><div class="segment" id="rFreq"><button data-rf="daily">Günlük</button><button data-rf="weekly">Haftalık</button><button class="active inc" data-rf="monthly">Aylık</button></div></div>
    <div class="field"><label>İlk / sonraki tarih</label><input class="input" id="rDate" type="date" value="${isoDate(new Date())}" /></div>
    <button class="btn" id="rSave">Kaydet</button><div class="spacer"></div>`);
  const drawCats = () => { const box = $("#rChips"), cats = state.categories.filter((c) => c.type === rType); if (!rCat && cats.length) rCat = cats[0].id; box.innerHTML = cats.map((c) => `<button class="chip ${rCat === c.id ? "active" : ""}" data-rcat="${c.id}"><span class="e">${c.icon}</span>${escapeHtml(c.name)}</button>`).join(""); };
  const drawWal = () => { const box = $("#rWallets"); box.innerHTML = state.wallets.map((w) => `<button class="chip ${rWallet === w.id ? "active" : ""}" data-rwal="${w.id}"><span class="e">${w.icon}</span>${escapeHtml(w.name)}</button>`).join(""); };
  drawCats(); drawWal();
  $("#rSeg").addEventListener("click", (e) => { const b = e.target.closest("[data-rt]"); if (!b) return; rType = b.dataset.rt; rCat = null; $("#rSeg").querySelectorAll("button").forEach((x) => x.classList.toggle("active", x.dataset.rt === rType)); drawCats(); });
  $("#rChips").addEventListener("click", (e) => { const c = e.target.closest("[data-rcat]"); if (!c) return; rCat = c.dataset.rcat; drawCats(); });
  $("#rWallets").addEventListener("click", (e) => { const w = e.target.closest("[data-rwal]"); if (!w) return; rWallet = w.dataset.rwal; drawWal(); });
  $("#rFreq").addEventListener("click", (e) => { const b = e.target.closest("[data-rf]"); if (!b) return; rFreq = b.dataset.rf; $("#rFreq").querySelectorAll("button").forEach((x) => { const on = x.dataset.rf === rFreq; x.classList.toggle("active", on); x.classList.toggle("inc", on); }); });
  $("#rSave").addEventListener("click", async () => {
    const amount = parseAmount($("#rAmount").value); if (amount <= 0) { toast("Tutar gir"); return; } if (!rCat) { toast("Kategori seç"); return; }
    const r = { id: DB.uid("rec"), type: rType, amount, categoryId: rCat, walletId: rWallet, item: $("#rItem").value.trim(), vendor: "", note: "", tags: [], currency: state.settings.currency, frequency: rFreq, nextDate: $("#rDate").value || isoDate(new Date()), active: true };
    await DB.saveRecurring(r); state.recurring.push(r);
    const created = await runRecurring();
    toast(created ? `Eklendi ✓ (${created} kayıt)` : "Eklendi ✓"); openRecurringManager(); refreshActiveView();
  });
}

/* ==========================================================
   Kilit (PIN + biyometrik)
========================================================== */
async function sha256(str) { const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str)); return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join(""); }
function bufToB64(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))); }
function b64ToBuf(b64) { const bin = atob(b64), arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); return arr.buffer; }

async function bioAvailable() { try { return !!(window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); } catch (e) { return false; } }
async function registerBio() {
  try {
    const cred = await navigator.credentials.create({ publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), rp: { name: "Mani" }, user: { id: crypto.getRandomValues(new Uint8Array(16)), name: "mani", displayName: "Mani" }, pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }], authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" }, timeout: 60000, attestation: "none" } });
    if (cred) { await DB.setMeta("bioCredId", bufToB64(cred.rawId)); return true; }
  } catch (e) {}
  return false;
}
async function verifyBio() {
  try {
    const id = await DB.getMeta("bioCredId", ""); if (!id) return false;
    const a = await navigator.credentials.get({ publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), allowCredentials: [{ type: "public-key", id: b64ToBuf(id) }], userVerification: "required", timeout: 60000 } });
    return !!a;
  } catch (e) { return false; }
}

function showLock() {
  return new Promise(async (resolve) => {
    const salt = await DB.getMeta("pinSalt", ""), hash = await DB.getMeta("pinHash", ""), bio = await DB.getMeta("bioEnabled", false);
    let entered = "";
    const overlay = document.createElement("div"); overlay.className = "lock"; overlay.id = "lockScreen";
    const render = () => { overlay.innerHTML = `<img class="logo" src="./icons/icon.svg" alt=""><h2>Mani kilitli</h2><div class="hint">PIN'ini gir</div><div class="dots">${[0, 1, 2, 3].map((i) => `<div class="dot ${i < entered.length ? "on" : ""}"></div>`).join("")}</div><div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-k="${n}">${n}</button>`).join("")}<button class="alt bio" data-k="bio">${bio ? "☝️" : ""}</button><button data-k="0">0</button><button class="alt" data-k="del">⌫</button></div>`; };
    render(); document.body.appendChild(overlay);
    const cleanup = () => overlay.remove();
    const tryBio = async () => { if (await verifyBio()) { cleanup(); resolve(); } };
    overlay.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-k]"); if (!b) return;
      const k = b.dataset.k;
      if (k === "del") { entered = entered.slice(0, -1); return render(); }
      if (k === "bio") { if (bio) tryBio(); return; }
      if (entered.length >= 4) return;
      entered += k; render();
      if (entered.length === 4) { const h = await sha256(salt + entered); if (h === hash) { cleanup(); resolve(); } else { entered = ""; overlay.classList.add("shake"); setTimeout(() => overlay.classList.remove("shake"), 400); render(); } }
    });
    if (bio) setTimeout(tryBio, 350);
  });
}

function openPinSetup(onDone) {
  openSheet(`<h2>PIN belirle</h2><div class="muted" style="font-size:13px;margin-bottom:14px">4 haneli bir PIN gir. Açılışta bu sorulacak.</div>
    <div class="field"><label>Yeni PIN</label><input class="input" id="pin1" inputmode="numeric" maxlength="4" type="password" placeholder="••••" style="letter-spacing:8px;text-align:center;font-size:22px" /></div>
    <div class="field"><label>PIN tekrar</label><input class="input" id="pin2" inputmode="numeric" maxlength="4" type="password" placeholder="••••" style="letter-spacing:8px;text-align:center;font-size:22px" /></div>
    <button class="btn" id="pinSave">Kaydet</button><div class="spacer"></div>`);
  setTimeout(() => $("#pin1") && $("#pin1").focus(), 350);
  $("#pinSave").addEventListener("click", async () => {
    const p1 = $("#pin1").value, p2 = $("#pin2").value;
    if (!/^\d{4}$/.test(p1)) { toast("4 haneli rakam gir"); return; }
    if (p1 !== p2) { toast("PIN'ler eşleşmiyor"); return; }
    const salt = bufToB64(crypto.getRandomValues(new Uint8Array(8)));
    await DB.setMeta("pinSalt", salt); await DB.setMeta("pinHash", await sha256(salt + p1)); await DB.setMeta("lockEnabled", true);
    closeSheet(); toast("Kilit açık ✓"); if (onDone) onDone();
  });
}

async function toggleLock(on) {
  if (on) { openPinSetup(() => renderSettings()); }
  else {
    // kapatmak için mevcut PIN doğrula
    const hash = await DB.getMeta("pinHash", "");
    if (hash) { await showLock(); } // doğru PIN girilince devam eder
    await DB.setMeta("lockEnabled", false); await DB.setMeta("bioEnabled", false);
    await DB.delMeta("pinHash"); await DB.delMeta("pinSalt"); await DB.delMeta("bioCredId");
    toast("Kilit kapatıldı"); renderSettings();
  }
}
async function toggleBio(on) {
  if (on) { const ok = await registerBio(); if (ok) { await DB.setMeta("bioEnabled", true); toast("Biyometrik açık ✓"); } else { toast("Biyometrik ayarlanamadı"); } }
  else { await DB.setMeta("bioEnabled", false); await DB.delMeta("bioCredId"); toast("Biyometrik kapatıldı"); }
  renderSettings();
}
async function toggleNotify(on) {
  if (on) {
    if (!("Notification" in window)) { toast("Cihaz bildirimi desteklemiyor"); renderSettings(); return; }
    const perm = await Notification.requestPermission();
    if (perm === "granted") { await DB.setMeta("notifyEnabled", true); toast("Bildirimler açık ✓"); notify("Mani", "Bildirimler etkin. Bütçe ve ödeme hatırlatmaları burada görünecek."); }
    else { toast("İzin verilmedi"); }
  } else { await DB.setMeta("notifyEnabled", false); toast("Bildirimler kapatıldı"); }
  renderSettings();
}

/* ==========================================================
   Bildirimler
========================================================== */
async function notify(title, body) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try { const reg = await navigator.serviceWorker.getRegistration(); if (reg && reg.showNotification) reg.showNotification(title, { body, icon: "./icons/icon.svg", badge: "./icons/icon.svg" }); else new Notification(title, { body, icon: "./icons/icon.svg" }); }
  catch (e) { try { new Notification(title, { body }); } catch (_) {} }
}
async function notifyOnOpen() {
  if (!(await DB.getMeta("notifyEnabled", false)) || !("Notification" in window) || Notification.permission !== "granted") return;
  const todayStr = isoDate(new Date());
  if ((await DB.getMeta("lastNotifyDate", "")) === todayStr) return;
  const msgs = [], mk = monthKey(new Date()), spent = {};
  monthTx(mk).filter((t) => t.type === "expense").forEach((t) => { spent[t.categoryId] = (spent[t.categoryId] || 0) + baseOf(t); });
  state.budgets.forEach((b) => { if (b.limit && (spent[b.categoryId] || 0) >= b.limit) { const c = catById(b.categoryId); msgs.push(`${c.icon} ${c.name} bütçesi aşıldı`); } });
  state.recurring.forEach((r) => { if (r.active) { const diff = (new Date(r.nextDate + "T12:00") - new Date()) / 86400000; if (diff >= 0 && diff <= 2) { const c = catById(r.categoryId); msgs.push(`🔁 ${r.item || c.name} yaklaşıyor (${fmtDateLong(r.nextDate + "T12:00")})`); } } });
  if (msgs.length) { notify("Mani hatırlatma", msgs.slice(0, 4).join("\n")); await DB.setMeta("lastNotifyDate", todayStr); }
}

/* ==========================================================
   PDF rapor
========================================================== */
function exportPDF() {
  const isYear = state.statsMode === "year";
  const list = isYear ? yearTx(state.statsYear) : monthTx(state.month);
  const title = isYear ? state.statsYear + " Yıllık Rapor" : fmtMonthYear(state.month) + " Raporu";
  const t = totals(list);
  const byCat = {};
  list.filter((x) => x.type === "expense").forEach((x) => { byCat[x.categoryId] = (byCat[x.categoryId] || 0) + baseOf(x); });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const rowsTx = sortedTx(list).map((x) => {
    if (x.type === "transfer") return `<tr><td>${x.date.slice(0, 10)}</td><td>Transfer</td><td>${escapeHtml(walletById(x.fromWallet).name)}→${escapeHtml(walletById(x.toWallet).name)}</td><td class="r">${money(baseOf(x))}</td></tr>`;
    const c = catById(x.categoryId);
    return `<tr><td>${x.date.slice(0, 10)}</td><td>${x.type === "income" ? "Gelir" : "Gider"}</td><td>${escapeHtml((x.item || x.vendor || c.name))} <span class="muted">(${escapeHtml(c.name)})</span></td><td class="r">${x.type === "income" ? "+" : "−"}${money(baseOf(x))}</td></tr>`;
  }).join("");
  el("printArea").innerHTML = `
    <h1>Mani — ${title}</h1>
    <div class="muted">Oluşturulma: ${fmtDateLong(new Date().toISOString())} · Para birimi: ${state.settings.currency}</div>
    <div class="sum"><div><b>Gelir</b><br>${money(t.income)}</div><div><b>Gider</b><br>${money(t.expense)}</div><div><b>Net</b><br>${money(t.net)}</div></div>
    <h2>Kategoriye göre gider</h2>
    <table><tr><th>Kategori</th><th class="r">Tutar</th><th class="r">%</th></tr>
    ${cats.map(([id, v]) => `<tr><td>${escapeHtml(catById(id).name)}</td><td class="r">${money(v)}</td><td class="r">${t.expense ? Math.round(v / t.expense * 100) : 0}</td></tr>`).join("") || '<tr><td colspan="3" class="muted">Yok</td></tr>'}</table>
    <h2>İşlemler (${list.length})</h2>
    <table><tr><th>Tarih</th><th>Tür</th><th>Açıklama</th><th class="r">Tutar</th></tr>${rowsTx || '<tr><td colspan="4" class="muted">Yok</td></tr>'}</table>`;
  toast("Yazdırma penceresi açılıyor...");
  setTimeout(() => window.print(), 300);
}

/* ==========================================================
   Yedekleme
========================================================== */
async function exportData() { const p = await DB.exportAll(); downloadFile(JSON.stringify(p, null, 2), `mani-yedek-${isoDate(new Date())}.json`, "application/json"); toast("Yedek indirildi ✓"); }
function csvCell(v) { v = String(v == null ? "" : v); return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function exportCSV() {
  const rows = [["Tarih", "Saat", "Tür", "Tutar", "ParaBirimi", "AnaBirim", "Kategori", "Cüzdan", "Ürün", "Yer", "Etiketler", "Not"]];
  sortedTx().forEach((t) => { const c = t.type === "transfer" ? { name: "Transfer" } : catById(t.categoryId); rows.push([t.date.slice(0, 10), fmtTime(t.date), t.type === "income" ? "Gelir" : t.type === "transfer" ? "Transfer" : "Gider", String(t.amount).replace(".", ","), t.currency || state.settings.currency, String(baseOf(t)).replace(".", ","), c.name, t.walletId ? walletById(t.walletId).name : "", t.item || "", t.vendor || "", (t.tags || []).join("|"), (t.note || "").replace(/\n/g, " ")]); });
  downloadFile("﻿" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n"), `mani-${isoDate(new Date())}.csv`, "text/csv;charset=utf-8");
  toast("CSV indirildi ✓");
}
function downloadFile(content, name, type) { const blob = new Blob([content], { type }), url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }
async function handleImportFile(e) { const f = e.target.files[0]; if (!f) return; try { const p = JSON.parse(await f.text()); if (!confirm("Yedek yüklenecek. Mevcut veriler değiştirilsin mi?")) { e.target.value = ""; return; } await DB.importAll(p, { merge: false }); await loadData(); applyTheme(); toast("Yedek yüklendi ✓"); renderSettings(); } catch (err) { toast("Dosya okunamadı"); } e.target.value = ""; }
async function wipeData() { if (!confirm("TÜM verilerin kalıcı olarak silinecek. Emin misin?")) return; if (!confirm("Son kez: gerçekten tüm veriyi sil?")) return; await DB.wipe(); await DB.ensureSeed(); await loadData(); toast("Tüm veri silindi"); navTo("home"); }

/* ==========================================================
   Olaylar
========================================================== */
function bindGlobalEvents() {
  document.querySelectorAll(".nav-item").forEach((b) => b.addEventListener("click", () => navTo(b.dataset.nav)));
  el("fab").addEventListener("click", () => openTxForm(null));
  el("backdrop").addEventListener("click", closeSheet);

  document.querySelector(".app").addEventListener("click", (e) => {
    const goto = e.target.closest("[data-goto]"); if (goto) return navTo(goto.dataset.goto);
    const quick = e.target.closest("[data-quick]"); if (quick) { const q = (state._templates || [])[+quick.dataset.quick]; if (q) openTxForm({ type: "expense", categoryId: q.categoryId, item: q.item, vendor: q.vendor, amount: q.amount, currency: q.currency, walletId: q.walletId }); return; }
    const editBtn = e.target.closest("[data-edit]"); if (editBtn) { const t = state.transactions.find((x) => x.id === editBtn.dataset.edit); if (t) openTxForm(t); return; }
    const filter = e.target.closest("[data-filter]"); if (filter) { state.txFilter = filter.dataset.filter; return renderTx(); }
    const range = e.target.closest("[data-range]"); if (range) { state.txRange = range.dataset.range; return renderTx(); }
    const txv = e.target.closest("[data-txview]"); if (txv) { state.txView = txv.dataset.txview; return renderTx(); }
    const calDay = e.target.closest("[data-calday]"); if (calDay) return openDaySheet(calDay.dataset.calday);
    const calM = e.target.closest("[data-calmonth]"); if (calM) { const [y, m] = state.calMonth.split("-").map(Number); state.calMonth = monthKey(new Date(y, m - 1 + (+calM.dataset.calmonth), 1)); return renderTx(); }
    const sm = e.target.closest("[data-statsmode]"); if (sm) { state.statsMode = sm.dataset.statsmode; return renderStats(); }
    const monthBtn = e.target.closest("[data-month]"); if (monthBtn) { const [y, m] = state.month.split("-").map(Number); state.month = monthKey(new Date(y, m - 1 + (+monthBtn.dataset.month), 1)); return renderStats(); }
    const yearBtn = e.target.closest("[data-year]"); if (yearBtn) { state.statsYear += (+yearBtn.dataset.year); return renderStats(); }
    const themeBtn = e.target.closest("[data-theme-set]"); if (themeBtn) { state.settings.theme = themeBtn.dataset.themeSet; DB.setMeta("theme", state.settings.theme); applyTheme(); return renderSettings(); }
    const goalAdd = e.target.closest("[data-goal-add]"); if (goalAdd) return goalContribute(goalAdd.dataset.goalAdd, 1, isSheetOpen());
    const goalSub = e.target.closest("[data-goal-sub]"); if (goalSub) return goalContribute(goalSub.dataset.goalSub, -1, isSheetOpen());
    const goalDel = e.target.closest("[data-goal-del]"); if (goalDel) { const fromMgr = isSheetOpen(); return (async () => { if (!confirm("Hedef silinsin mi?")) return; await DB.deleteGoal(goalDel.dataset.goalDel); state.goals = state.goals.filter((g) => g.id !== goalDel.dataset.goalDel); if (fromMgr) openGoalManager(); else refreshActiveView(); })(); }

    const action = e.target.closest("[data-action]");
    if (action) {
      const a = action.dataset.action;
      if (a === "manage-cats") openCatManager();
      else if (a === "wallets") openWalletManager();
      else if (a === "goals") openGoalManager();
      else if (a === "budgets") openBudgetManager();
      else if (a === "recurring") openRecurringManager();
      else if (a === "export") exportData();
      else if (a === "csv") exportCSV();
      else if (a === "import") el("importFile").click();
      else if (a === "pdf") exportPDF();
      else if (a === "wipe") wipeData();
      else if (a === "changepin") openPinSetup(() => renderSettings());
    }
  });

  // Arka plandan dönünce yeniden kilitle
  let hiddenAt = 0;
  document.addEventListener("visibilitychange", async () => {
    if (document.hidden) hiddenAt = Date.now();
    else { const en = await DB.getMeta("lockEnabled", false); if (en && hiddenAt && Date.now() - hiddenAt > 20000 && !el("lockScreen")) await showLock(); }
  });
}

/* ==========================================================
   Başlatma
========================================================== */
async function loadData() {
  state.transactions = await DB.getTransactions();
  state.categories = await DB.getCategories();
  state.budgets = await DB.getBudgets();
  state.recurring = await DB.getRecurring();
  state.wallets = await DB.getWallets();
  state.goals = await DB.getGoals();
  state.settings.theme = await DB.getMeta("theme", "system");
  state.settings.currency = await DB.getMeta("currency", "TRY");
  state.rates = await DB.getMeta("rates", null);
  state.statsYear = new Date().getFullYear();
}

async function init() {
  await DB.open();
  await DB.ensureSeed();
  await loadData();
  applyTheme();
  if (await DB.getMeta("lockEnabled", false)) await showLock();
  await runRecurring();
  bindGlobalEvents();
  navTo("home");
  initHistory();
  if ("serviceWorker" in navigator) { try { await navigator.serviceWorker.register("./sw.js"); } catch (e) {} }
  ensureRates();
  notifyOnOpen();
}

init();
