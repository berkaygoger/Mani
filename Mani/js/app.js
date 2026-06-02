// Mani — Uygulama Mantığı (v2)
// Tüm ekranlar, form, grafikler, bütçeler, tekrarlayanlar ve ayarlar.

"use strict";

/* ----------------------------------------------------------
   Para birimleri
---------------------------------------------------------- */
const CURRENCIES = ["TRY", "USD", "EUR", "GBP", "CHF", "JPY", "RUB", "AED", "SAR", "BGN"];
const CURRENCY_SYMBOLS = { TRY: "₺", USD: "$", EUR: "€", GBP: "£", CHF: "Fr", JPY: "¥", RUB: "₽", AED: "د.إ", SAR: "﷼", BGN: "лв" };

/* ----------------------------------------------------------
   Durum (state)
---------------------------------------------------------- */
const state = {
  transactions: [],
  categories: [],
  budgets: [],
  recurring: [],
  settings: { theme: "system", currency: "TRY" },
  month: monthKey(new Date()),
  txFilter: "all",
  txRange: "all",
  txSearch: "",
  priceSearch: "",
  editId: null,
  formType: "expense",
  formCat: null,
  formPhoto: null,
  formCurrency: "TRY"
};

/* ----------------------------------------------------------
   Yardımcılar
---------------------------------------------------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const el = (id) => document.getElementById(id);

function monthKey(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}
function pad(x) { return String(x).padStart(2, "0"); }
function isoDate(dt) { return dt.getFullYear() + "-" + pad(dt.getMonth() + 1) + "-" + pad(dt.getDate()); }

function money(n, cur) {
  cur = cur || state.settings.currency || "TRY";
  try {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency: cur, maximumFractionDigits: 2 }).format(n || 0);
  } catch (e) {
    return (n || 0).toFixed(2) + " " + (CURRENCY_SYMBOLS[cur] || cur);
  }
}
function sym(cur) { return CURRENCY_SYMBOLS[cur || state.settings.currency] || (cur || "₺"); }

function parseAmount(str) {
  str = String(str).trim().replace(/[^\d.,-]/g, "");
  if (str.includes(",")) str = str.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(str);
  return isNaN(n) ? 0 : n;
}

const MONTHS_TR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const DAYS_TR = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
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

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function catById(id) { return state.categories.find((c) => c.id === id) || { name: "Diğer", icon: "📦", color: "#64748b" }; }
function budgetFor(catId) { return state.budgets.find((b) => b.categoryId === catId); }

let toastTimer;
function toast(msg) {
  const t = el("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

function distinct(field) {
  const set = new Set();
  state.transactions.forEach((t) => { const v = (t[field] || "").trim(); if (v) set.add(v); });
  return [...set].sort();
}

/* ----------------------------------------------------------
   Tema
---------------------------------------------------------- */
function applyTheme() {
  const pref = state.settings.theme;
  let theme = pref === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : pref;
  document.documentElement.setAttribute("data-theme", theme);
}
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (state.settings.theme === "system") applyTheme();
});

/* ----------------------------------------------------------
   Navigasyon
---------------------------------------------------------- */
const VIEWS = { home: "view-home", tx: "view-tx", stats: "view-stats", settings: "view-settings" };
const RENDERERS = { home: renderHome, tx: renderTx, stats: renderStats, settings: renderSettings };

function navTo(key) {
  Object.values(VIEWS).forEach((id) => el(id).classList.remove("active"));
  el(VIEWS[key]).classList.add("active");
  document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.nav === key));
  RENDERERS[key]();
  window.scrollTo(0, 0);
}
function refreshActiveView() {
  const active = document.querySelector(".nav-item.active");
  if (active) RENDERERS[active.dataset.nav]();
}

/* ----------------------------------------------------------
   Hesaplamalar
---------------------------------------------------------- */
function sortedTx(list) {
  return [...(list || state.transactions)].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt || 0) - (a.createdAt || 0)
  );
}
function totals(list) {
  let income = 0, expense = 0;
  for (const t of list) { if (t.type === "income") income += t.amount; else expense += t.amount; }
  return { income, expense, net: income - expense };
}
function monthTx(key) { return state.transactions.filter((t) => t.date.slice(0, 7) === key); }
function prevMonthKey(key) { const [y, m] = key.split("-").map(Number); return monthKey(new Date(y, m - 2, 1)); }

/* ----------------------------------------------------------
   Tekrarlayan işlem motoru
---------------------------------------------------------- */
function advanceDate(dateStr, freq) {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (freq === "daily") return isoDate(new Date(y, m - 1, d + 1));
  if (freq === "weekly") return isoDate(new Date(y, m - 1, d + 7));
  const lastDayNext = new Date(y, m + 1, 0).getDate();
  return isoDate(new Date(y, m, Math.min(d, lastDayNext)));
}
async function runRecurring() {
  const today = new Date(); today.setHours(23, 59, 59, 0);
  let created = 0;
  for (const r of state.recurring) {
    if (!r.active) continue;
    let next = r.nextDate, guard = 0;
    while (next && new Date(next + "T12:00") <= today && guard < 400) {
      const t = {
        id: DB.uid("tx"), type: r.type, amount: r.amount, categoryId: r.categoryId,
        item: r.item || "", vendor: r.vendor || "", note: r.note || "", tags: r.tags || [],
        photo: null, currency: r.currency || state.settings.currency,
        date: next + "T09:00", createdAt: Date.now(), recurringId: r.id
      };
      await DB.saveTransaction(t); state.transactions.push(t); created++;
      next = advanceDate(next, r.frequency); guard++;
    }
    if (next !== r.nextDate) { r.nextDate = next; await DB.saveRecurring(r); }
  }
  return created;
}

/* ----------------------------------------------------------
   ÖZET ekranı
---------------------------------------------------------- */
function renderHome() {
  const all = totals(state.transactions);
  const thisKey = monthKey(new Date());
  const thisMonth = totals(monthTx(thisKey));
  const recent = sortedTx().slice(0, 6);

  let html = `
    <div class="page-head">
      <div><h1>Merhaba 👋</h1><div class="sub">${fmtMonthYear(thisKey)}</div></div>
    </div>
    <div class="balance-card">
      <div class="label">Toplam Bakiye</div>
      <div class="amount">${money(all.net)}</div>
      <div class="row">
        <div class="pill"><div class="t">↓ Bu ay gelir</div><div class="v">${money(thisMonth.income)}</div></div>
        <div class="pill"><div class="t">↑ Bu ay gider</div><div class="v">${money(thisMonth.expense)}</div></div>
      </div>
    </div>
  `;

  // Bütçe uyarısı
  html += budgetAlert(thisKey);

  // Hızlı ekle
  const templates = quickTemplates();
  if (templates.length) {
    html += `<div class="section-head"><h2>Hızlı ekle</h2></div>
      <div class="quick-scroll">` +
      templates.map((q, i) => {
        const c = catById(q.categoryId);
        return `<button class="quick-chip" data-quick="${i}">
          <span class="qe">${c.icon}</span>
          <span class="qt"><span class="qn">${escapeHtml(q.label)}</span><br><span class="qa">${money(q.amount, q.currency)}</span></span>
        </button>`;
      }).join("") + `</div>`;
    state._templates = templates;
  }

  html += `<div class="section-head"><h2>Son işlemler</h2>${recent.length ? '<button class="link" data-goto="tx">Tümü →</button>' : ""}</div>`;
  html += recent.length
    ? '<div class="tx-list">' + recent.map(txRow).join("") + "</div>"
    : emptyState("🪙", "Henüz işlem yok", "Alttaki + butonuna basarak ilk kaydını ekle.");

  el("view-home").innerHTML = html;
}

function budgetAlert(monthKeyStr) {
  if (!state.budgets.length) return "";
  const list = monthTx(monthKeyStr).filter((t) => t.type === "expense");
  const spent = {};
  list.forEach((t) => { spent[t.categoryId] = (spent[t.categoryId] || 0) + t.amount; });
  let over = null, warn = null;
  for (const b of state.budgets) {
    if (!b.limit) continue;
    const s = spent[b.categoryId] || 0;
    const ratio = s / b.limit;
    if (ratio >= 1 && (!over || ratio > over.ratio)) over = { b, s, ratio };
    else if (ratio >= 0.8 && ratio < 1 && (!warn || ratio > warn.ratio)) warn = { b, s, ratio };
  }
  if (over) {
    const c = catById(over.b.categoryId);
    return `<div class="alert over"><span class="ai">🚨</span><div>${c.icon} <b>${escapeHtml(c.name)}</b> bütçesini aştın — ${money(over.s)} / ${money(over.b.limit)}</div></div>`;
  }
  if (warn) {
    const c = catById(warn.b.categoryId);
    return `<div class="alert warn"><span class="ai">⚠️</span><div>${c.icon} <b>${escapeHtml(c.name)}</b> bütçesinin %${Math.round(warn.ratio * 100)}'ine ulaştın — ${money(warn.s)} / ${money(warn.b.limit)}</div></div>`;
  }
  return "";
}

function quickTemplates() {
  const map = {};
  state.transactions.filter((t) => t.type === "expense").forEach((t) => {
    const key = (t.item || t.vendor || "").toLowerCase().trim();
    if (!key) return;
    if (!map[key]) map[key] = { count: 0, date: "", label: t.item || t.vendor, item: t.item, vendor: t.vendor, categoryId: t.categoryId, amount: t.amount, currency: t.currency };
    map[key].count++;
    if (t.date > map[key].date) {
      map[key].date = t.date; map[key].amount = t.amount; map[key].categoryId = t.categoryId;
      map[key].vendor = t.vendor; map[key].item = t.item; map[key].label = t.item || t.vendor; map[key].currency = t.currency;
    }
  });
  return Object.values(map).filter((x) => x.count >= 2).sort((a, b) => b.count - a.count).slice(0, 8);
}

function txRow(t) {
  const c = catById(t.categoryId);
  const title = t.item || t.vendor || c.name;
  const meta = [];
  if (t.vendor && t.item) meta.push(t.vendor);
  meta.push(c.name); meta.push(fmtTime(t.date));
  const sign = t.type === "income" ? "+" : "−";
  const tags = (t.tags && t.tags.length) ? `<div class="tags-inline">${t.tags.map((x) => `<span class="tag">${escapeHtml(x)}</span>`).join("")}</div>` : "";
  return `
    <div class="tx" data-edit="${t.id}">
      <div class="emoji" style="background:${c.color}22">${c.icon}</div>
      <div class="main">
        <div class="title">${escapeHtml(title)}${t.photo ? '<span class="clip">📎</span>' : ""}${t.recurringId ? '<span class="clip">🔁</span>' : ""}</div>
        <div class="meta">${escapeHtml(meta.join(" · "))}</div>
        ${tags}
      </div>
      <div class="amt ${t.type}">${sign}${money(t.amount, t.currency).replace("-", "")}</div>
    </div>`;
}

function emptyState(big, t, d) {
  return `<div class="empty"><div class="big">${big}</div><div class="t">${t}</div><div class="d">${d}</div></div>`;
}

/* ----------------------------------------------------------
   İŞLEMLER ekranı
---------------------------------------------------------- */
function rangeBounds(preset) {
  const now = new Date();
  if (preset === "thismonth") return { from: monthKey(now) + "-01", to: "9999" };
  if (preset === "lastmonth") { const pk = prevMonthKey(monthKey(now)); return { from: pk + "-01", to: pk + "-31" }; }
  if (preset === "7d") { const d = new Date(); d.setDate(d.getDate() - 7); return { from: isoDate(d), to: "9999" }; }
  if (preset === "30d") { const d = new Date(); d.setDate(d.getDate() - 30); return { from: isoDate(d), to: "9999" }; }
  return null;
}

function renderTx() {
  let list = sortedTx();
  if (state.txFilter !== "all") list = list.filter((t) => t.type === state.txFilter);

  const rb = rangeBounds(state.txRange);
  if (rb) list = list.filter((t) => { const d = t.date.slice(0, 10); return d >= rb.from && d <= rb.to; });

  if (state.txSearch.trim()) {
    const q = state.txSearch.toLowerCase().trim();
    list = list.filter((t) => {
      const c = catById(t.categoryId);
      return [t.item, t.vendor, t.note, c.name, (t.tags || []).join(" ")].some((f) => (f || "").toLowerCase().includes(q));
    });
  }

  const sums = totals(list);

  let html = `
    <div class="page-head"><h1>İşlemler</h1></div>
    <div class="search"><span class="ic">🔍</span>
      <input id="txSearch" placeholder="Ara: döner, market, etiket..." value="${escapeHtml(state.txSearch)}" /></div>
    <div class="filter-row">
      ${["all", "expense", "income"].map((f) =>
        `<button class="filter-chip ${state.txFilter === f ? "active" : ""}" data-filter="${f}">${f === "all" ? "Tümü" : f === "expense" ? "Giderler" : "Gelirler"}</button>`).join("")}
    </div>
    <div class="filter-row">
      ${[["all", "Tüm zamanlar"], ["thismonth", "Bu ay"], ["lastmonth", "Geçen ay"], ["7d", "7 gün"], ["30d", "30 gün"]].map(([v, l]) =>
        `<button class="filter-chip ${state.txRange === v ? "active" : ""}" data-range="${v}">${l}</button>`).join("")}
    </div>
  `;

  if (list.length === 0) {
    html += emptyState("🔎", "Sonuç yok", "Farklı bir arama veya filtre dene.");
  } else {
    html += `<div class="tx-group-date">${list.length} işlem · Gelir ${money(sums.income)} · Gider ${money(sums.expense)}</div>`;
    const groups = {};
    for (const t of list) { const k = t.date.slice(0, 10); (groups[k] = groups[k] || []).push(t); }
    for (const k of Object.keys(groups).sort().reverse()) {
      const dt = totals(groups[k]); const net = dt.income - dt.expense;
      html += `<div class="tx-group-date">${dayLabel(k + "T12:00")} · ${net >= 0 ? "+" : "−"}${money(Math.abs(net))}</div>`;
      html += '<div class="tx-list">' + groups[k].map(txRow).join("") + "</div>";
    }
  }

  el("view-tx").innerHTML = html;

  const s = el("txSearch");
  if (s) s.addEventListener("input", (e) => {
    state.txSearch = e.target.value;
    const pos = e.target.selectionStart;
    renderTx();
    const ns = el("txSearch");
    if (ns) { ns.focus(); ns.setSelectionRange(pos, pos); }
  });
}

/* ----------------------------------------------------------
   ANALİZ ekranı
---------------------------------------------------------- */
function renderStats() {
  const list = monthTx(state.month);
  const t = totals(list);
  const prevKey = prevMonthKey(state.month);
  const prev = totals(monthTx(prevKey));

  // Kategori dağılımı (gider)
  const byCat = {};
  list.filter((x) => x.type === "expense").forEach((x) => { byCat[x.categoryId] = (byCat[x.categoryId] || 0) + x.amount; });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const maxCat = cats.length ? cats[0][1] : 0;

  // Günlük gider trendi
  const [y, m] = state.month.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const daily = new Array(daysInMonth).fill(0);
  list.filter((x) => x.type === "expense").forEach((x) => { daily[new Date(x.date).getDate() - 1] += x.amount; });
  const maxDaily = Math.max(...daily, 1);

  let html = `
    <div class="page-head"><h1>Analiz</h1></div>
    <div class="month-switch">
      <button data-month="-1">‹</button><div class="m">${fmtMonthYear(state.month)}</div><button data-month="1">›</button>
    </div>
    <div class="stat-grid">
      <div class="stat"><div class="l">Gelir ${deltaBadge(t.income, prev.income, true)}</div><div class="v income">${money(t.income)}</div></div>
      <div class="stat"><div class="l">Gider ${deltaBadge(t.expense, prev.expense, false)}</div><div class="v expense">${money(t.expense)}</div></div>
    </div>
    <div class="stat" style="margin-bottom:8px">
      <div class="l">Kalan (Net)</div>
      <div class="v" style="color:${t.net >= 0 ? "var(--income)" : "var(--expense)"}">${money(t.net)}</div>
    </div>
  `;

  // Tahmin (sadece içinde bulunulan ay)
  if (state.month === monthKey(new Date()) && t.expense > 0) {
    const dayPassed = Math.max(1, new Date().getDate());
    const forecast = (t.expense / dayPassed) * daysInMonth;
    html += `<div class="forecast-card">
      <div class="l">📈 Ay sonu gider tahmini</div>
      <div class="v">${money(forecast)}</div>
      <div class="d">Bu hızla gidersen (${dayPassed}/${daysInMonth} gün geçti)</div>
    </div>`;
  }

  // Bütçeler
  html += budgetSection(byCat);

  // Trend
  if (t.expense > 0) {
    html += `<div class="section-head"><h2>Günlük gider</h2></div>
      <div class="card"><div class="trend">
        ${daily.map((v) => `<div class="bar" style="height:${Math.max(3, (v / maxDaily) * 100)}%" title="${money(v)}"></div>`).join("")}
      </div><div class="trend-labels"><span>1</span><span>${Math.ceil(daysInMonth / 2)}</span><span>${daysInMonth}</span></div></div>`;
  }

  // Kategori dağılımı
  html += `<div class="section-head"><h2>Kategoriye göre gider</h2></div>`;
  if (cats.length === 0) {
    html += emptyState("📊", "Bu ay gider yok", "Bu ay kayıtlı harcama bulunamadı.");
  } else {
    html += '<div class="card">';
    for (const [catId, val] of cats) {
      const c = catById(catId);
      const pct = t.expense ? Math.round((val / t.expense) * 100) : 0;
      html += `<div class="cat-bar"><div class="top">
          <div class="name"><span class="e">${c.icon}</span>${escapeHtml(c.name)}</div>
          <div><span class="val">${money(val)}</span><span class="pct">%${pct}</span></div></div>
        <div class="track"><div class="fill" style="width:${Math.max(4, (val / maxCat) * 100)}%;background:${c.color}"></div></div></div>`;
    }
    html += "</div>";
  }

  // İşletme raporu (bu ay)
  const byVendor = {};
  list.filter((x) => x.type === "expense" && x.vendor).forEach((x) => {
    const k = x.vendor.trim();
    if (!byVendor[k]) byVendor[k] = { total: 0, count: 0 };
    byVendor[k].total += x.amount; byVendor[k].count++;
  });
  const vendors = Object.entries(byVendor).sort((a, b) => b[1].total - a[1].total).slice(0, 6);
  if (vendors.length) {
    html += `<div class="section-head"><h2>En çok harcadığın yerler</h2></div><div class="card">`;
    vendors.forEach(([name, v], i) => {
      html += `<div class="rank-row"><div class="rk">${i + 1}</div>
        <div class="rn">${escapeHtml(name)}<div class="rc">${v.count} işlem</div></div>
        <div class="rv">${money(v.total)}</div></div>`;
    });
    html += "</div>";
  }

  // Enflasyon (tüm zamanlar)
  html += inflationSection();

  // Ürün fiyat geçmişi
  html += `<div class="section-head"><h2>Ürün fiyat geçmişi</h2></div>
    <div class="search"><span class="ic">🏷️</span>
      <input id="priceSearch" placeholder="Ürün ara: döner, kahve, ekmek..." value="${escapeHtml(state.priceSearch)}" /></div>
    <div id="priceResult"></div>`;

  el("view-stats").innerHTML = html;
  renderPriceHistory();
  const ps = el("priceSearch");
  if (ps) ps.addEventListener("input", (e) => { state.priceSearch = e.target.value; renderPriceHistory(); });
}

function deltaBadge(now, before, higherIsGood) {
  if (!before) return "";
  const diff = now - before;
  if (Math.abs(diff) < 0.01) return `<span class="delta flat">≈</span>`;
  const pct = Math.round((diff / before) * 100);
  const up = diff > 0;
  const good = higherIsGood ? up : !up;
  return `<span class="delta ${good ? "down" : "up"}">${up ? "▲" : "▼"} %${Math.abs(pct)}</span>`;
}

function budgetSection(byCat) {
  if (!state.budgets.length) return "";
  let rows = "";
  for (const b of state.budgets) {
    if (!b.limit) continue;
    const c = catById(b.categoryId);
    const spent = byCat[b.categoryId] || 0;
    const ratio = spent / b.limit;
    const cls = ratio >= 1 ? "over" : ratio >= 0.8 ? "warn" : "ok";
    rows += `<div class="cat-bar budget-bar"><div class="top">
        <div class="name"><span class="e">${c.icon}</span>${escapeHtml(c.name)}</div>
        <div><span class="val">${money(spent)}</span><span class="pct">/ ${money(b.limit)}</span></div></div>
      <div class="track"><div class="fill ${cls}" style="width:${Math.min(100, ratio * 100)}%"></div></div>
      <div class="sub">${ratio >= 1 ? "Aşıldı 🚨" : "Kalan " + money(b.limit - spent)}</div></div>`;
  }
  if (!rows) return "";
  return `<div class="section-head"><h2>Bütçeler</h2><button class="link" data-action="budgets">Düzenle</button></div><div class="card">${rows}</div>`;
}

function inflationSection() {
  const map = {};
  state.transactions.filter((t) => t.type === "expense" && t.item).forEach((t) => {
    const k = t.item.toLowerCase().trim();
    (map[k] = map[k] || []).push(t);
  });
  const risers = [];
  for (const k in map) {
    const arr = map[k].sort((a, b) => (a.date < b.date ? -1 : 1));
    if (arr.length < 2) continue;
    const first = arr[0].amount, last = arr[arr.length - 1].amount;
    if (first <= 0) continue;
    const pct = ((last - first) / first) * 100;
    risers.push({ name: arr[arr.length - 1].item, pct, first, last, n: arr.length });
  }
  if (risers.length < 1) return "";
  const avg = risers.reduce((a, b) => a + b.pct, 0) / risers.length;
  const top = risers.filter((r) => Math.abs(r.pct) >= 1).sort((a, b) => b.pct - a.pct).slice(0, 4);
  let rows = top.map((r) => `<div class="rank-row">
      <div class="rn">${escapeHtml(r.name)}<div class="rc">${money(r.first)} → ${money(r.last)}</div></div>
      <div class="rv ${r.pct >= 0 ? "" : ""}" style="color:${r.pct >= 0 ? "var(--expense)" : "var(--income)"}">${r.pct >= 0 ? "+" : ""}%${Math.round(r.pct)}</div></div>`).join("");
  return `<div class="section-head"><h2>Kişisel enflasyonun</h2></div>
    <div class="card">
      <div class="rank-row"><div class="rn">Takip edilen ürünlerde ortalama</div>
      <div class="rv" style="color:${avg >= 0 ? "var(--expense)" : "var(--income)"}">${avg >= 0 ? "+" : ""}%${Math.round(avg)}</div></div>
      ${rows}
    </div>`;
}

function renderPriceHistory() {
  const box = el("priceResult");
  if (!box) return;
  const q = state.priceSearch.toLowerCase().trim();
  if (!q) {
    box.innerHTML = `<div class="card center muted" style="font-size:14px">Bir ürün adı yaz, ne zaman nereden kaça aldığını gör.<br>Örn: <b>döner</b> → fiyatının zamanla değişimi.</div>`;
    return;
  }
  const matches = state.transactions
    .filter((t) => t.type === "expense" && [t.item, t.vendor].some((f) => (f || "").toLowerCase().includes(q)))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (matches.length === 0) { box.innerHTML = `<div class="card center muted" style="font-size:14px">"${escapeHtml(q)}" için kayıt yok.</div>`; return; }

  const prices = matches.map((t) => t.amount);
  const min = Math.min(...prices), max = Math.max(...prices), avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  let html = `<div class="stat-grid">
      <div class="stat"><div class="l">En düşük</div><div class="v" style="font-size:17px">${money(min)}</div></div>
      <div class="stat"><div class="l">En yüksek</div><div class="v" style="font-size:17px">${money(max)}</div></div></div>
    <div class="stat" style="margin-bottom:10px"><div class="l">Ortalama (${matches.length} kayıt)</div><div class="v" style="font-size:17px">${money(avg)}</div></div>
    <div class="card">`;
  [...matches].reverse().forEach((t) => {
    const idx = matches.indexOf(t);
    const before = idx > 0 ? matches[idx - 1].amount : null;
    let trend = "";
    if (before !== null) {
      if (t.amount > before) trend = `<span class="price-trend up">▲ ${money(t.amount - before)}</span>`;
      else if (t.amount < before) trend = `<span class="price-trend down">▼ ${money(before - t.amount)}</span>`;
    }
    html += `<div class="price-row"><div>
        <div class="when">${fmtDateLong(t.date)}</div>
        <div class="where">${escapeHtml(t.vendor || t.item || "")}</div></div>
      <div><span class="price">${money(t.amount, t.currency)}</span>${trend}</div></div>`;
  });
  html += "</div>";
  box.innerHTML = html;
}

/* ----------------------------------------------------------
   AYARLAR ekranı
---------------------------------------------------------- */
function renderSettings() {
  const total = state.transactions.length;
  el("view-settings").innerHTML = `
    <div class="page-head"><h1>Ayarlar</h1></div>

    <div class="settings-group">
      <div class="settings-item">
        <div class="si-ic">🎨</div>
        <div class="si-main"><div class="si-title">Görünüm</div><div class="si-desc">Tema tercihi</div></div>
        <div class="theme-toggle">
          ${["system", "light", "dark"].map((m) => `<button data-theme-set="${m}" class="${state.settings.theme === m ? "active" : ""}">${m === "system" ? "Sistem" : m === "light" ? "Açık" : "Koyu"}</button>`).join("")}
        </div>
      </div>
      <div class="settings-item">
        <div class="si-ic">💱</div>
        <div class="si-main"><div class="si-title">Para birimi</div><div class="si-desc">Uygulama genelinde gösterim</div></div>
        <select class="cur-select" id="curSelect">
          ${CURRENCIES.map((c) => `<option value="${c}" ${state.settings.currency === c ? "selected" : ""}>${c} ${CURRENCY_SYMBOLS[c] || ""}</option>`).join("")}
        </select>
      </div>
    </div>

    <div class="settings-group">
      <div class="settings-item" data-action="budgets">
        <div class="si-ic">🎯</div>
        <div class="si-main"><div class="si-title">Bütçeler</div><div class="si-desc">${state.budgets.filter((b) => b.limit).length} kategoride limit</div></div>
        <div class="si-action">›</div>
      </div>
      <div class="settings-item" data-action="recurring">
        <div class="si-ic">🔁</div>
        <div class="si-main"><div class="si-title">Tekrarlayan işlemler</div><div class="si-desc">${state.recurring.filter((r) => r.active).length} aktif (kira, maaş, abonelik...)</div></div>
        <div class="si-action">›</div>
      </div>
      <div class="settings-item" data-action="manage-cats">
        <div class="si-ic">🏷️</div>
        <div class="si-main"><div class="si-title">Kategoriler</div><div class="si-desc">${state.categories.length} kategori · düzenle</div></div>
        <div class="si-action">›</div>
      </div>
    </div>

    <div class="settings-group">
      <div class="settings-item" data-action="export">
        <div class="si-ic">⬇️</div>
        <div class="si-main"><div class="si-title">Yedek al (JSON)</div><div class="si-desc">Tüm verini dosyaya kaydet (${total} işlem)</div></div>
        <div class="si-action">›</div>
      </div>
      <div class="settings-item" data-action="csv">
        <div class="si-ic">📊</div>
        <div class="si-main"><div class="si-title">CSV dışa aktar</div><div class="si-desc">Excel / Sheets'te aç</div></div>
        <div class="si-action">›</div>
      </div>
      <div class="settings-item" data-action="import">
        <div class="si-ic">⬆️</div>
        <div class="si-main"><div class="si-title">Yedeği geri yükle</div><div class="si-desc">JSON yedeğini yükle</div></div>
        <div class="si-action">›</div>
      </div>
    </div>

    <div class="settings-group">
      <div class="settings-item" data-action="wipe">
        <div class="si-ic">🗑️</div>
        <div class="si-main"><div class="si-title" style="color:var(--expense)">Tüm veriyi sil</div><div class="si-desc">Geri alınamaz</div></div>
        <div class="si-action">›</div>
      </div>
    </div>

    <div class="center muted" style="font-size:12px;margin-top:24px;line-height:1.6">
      Mani · Verilerin yalnızca bu cihazda saklanır.<br>Düzenli olarak yedek almayı unutma.
    </div>
    <input type="file" id="importFile" accept="application/json,.json" class="hidden" />
  `;

  const fi = el("importFile");
  if (fi) fi.addEventListener("change", handleImportFile);
  const cs = el("curSelect");
  if (cs) cs.addEventListener("change", async (e) => {
    state.settings.currency = e.target.value;
    await DB.setMeta("currency", state.settings.currency);
    toast("Para birimi: " + state.settings.currency);
  });
}

/* ----------------------------------------------------------
   Bottom Sheet
---------------------------------------------------------- */
function openSheet(html) {
  el("sheet").innerHTML = '<div class="grabber"></div>' + html;
  el("backdrop").classList.add("open");
  requestAnimationFrame(() => el("sheet").classList.add("open"));
}
function closeSheet() {
  el("sheet").classList.remove("open");
  el("backdrop").classList.remove("open");
}

/* ---- İşlem ekle / düzenle ---- */
function openTxForm(data) {
  const editing = !!(data && data.id);
  const src = data || {};
  state.editId = editing ? data.id : null;
  state.formType = src.type || "expense";
  state.formCat = src.categoryId || null;
  state.formPhoto = src.photo || null;
  state.formCurrency = src.currency || state.settings.currency;

  const dateDefault = editing ? new Date(src.date) : new Date();
  const tagStr = (src.tags || []).join(", ");

  openSheet(`
    <h2>${editing ? "İşlemi düzenle" : "Yeni işlem"}</h2>
    <div class="segment" id="segType">
      <button class="exp ${state.formType === "expense" ? "active" : ""}" data-type="expense">Gider</button>
      <button class="inc ${state.formType === "income" ? "active" : ""}" data-type="income">Gelir</button>
    </div>
    <div class="field">
      <div class="amount-input">
        <span class="cur" id="curSym">${sym(state.formCurrency)}</span>
        <input id="fAmount" inputmode="decimal" placeholder="0" value="${src.amount != null ? String(src.amount).replace(".", ",") : ""}" />
        <select class="cur-select" id="fCurrency">
          ${CURRENCIES.map((c) => `<option value="${c}" ${state.formCurrency === c ? "selected" : ""}>${c}</option>`).join("")}
        </select>
      </div>
    </div>
    <div class="field"><label>Kategori</label><div class="chips" id="fChips"></div></div>
    <div class="field"><label>Ne aldın / ne için? <span class="muted">(örn. Porsiyon Döner)</span></label>
      <input class="input" id="fItem" list="dlItems" placeholder="Ürün veya açıklama" value="${escapeHtml(src.item || "")}" /></div>
    <div class="field"><label>Nerede / kimden? <span class="muted">(örn. Falanca Dönerci)</span></label>
      <input class="input" id="fVendor" list="dlVendors" placeholder="İşletme veya kişi" value="${escapeHtml(src.vendor || "")}" /></div>
    <div class="field"><label>Etiketler <span class="muted">(virgülle ayır)</span></label>
      <input class="input" id="fTags" placeholder="örn. nakit, iş, tatil" value="${escapeHtml(tagStr)}" /></div>
    <div class="field"><label>Tarih ve saat</label>
      <input class="input" id="fDate" type="datetime-local" value="${toLocalInput(dateDefault)}" /></div>
    <div class="field"><label>Fiş / fotoğraf <span class="muted">(isteğe bağlı)</span></label>
      <div id="photoBox"></div>
      <input type="file" id="fPhoto" accept="image/*" capture="environment" class="hidden" /></div>
    <div class="field"><label>Not <span class="muted">(isteğe bağlı)</span></label>
      <textarea class="textarea" id="fNote" placeholder="Eklemek istediğin bir şey...">${escapeHtml(src.note || "")}</textarea></div>

    <button class="btn" id="fSave">${editing ? "Değişiklikleri kaydet" : "Kaydet"}</button>
    ${editing ? '<div class="btn-row"><button class="btn danger-ghost" id="fDelete">İşlemi sil</button></div>' : ""}
    <div class="spacer"></div>

    <datalist id="dlItems">${distinct("item").map((v) => `<option value="${escapeHtml(v)}">`).join("")}</datalist>
    <datalist id="dlVendors">${distinct("vendor").map((v) => `<option value="${escapeHtml(v)}">`).join("")}</datalist>
  `);

  renderChips();
  renderPhotoBox();

  $("#segType").addEventListener("click", (e) => {
    const b = e.target.closest("[data-type]"); if (!b) return;
    state.formType = b.dataset.type; state.formCat = null;
    $("#segType").querySelectorAll("button").forEach((x) => x.classList.toggle("active", x.dataset.type === state.formType));
    renderChips();
  });
  $("#fChips").addEventListener("click", (e) => {
    const c = e.target.closest("[data-cat]"); if (!c) return;
    state.formCat = c.dataset.cat; renderChips();
  });
  $("#fCurrency").addEventListener("change", (e) => {
    state.formCurrency = e.target.value; $("#curSym").textContent = sym(state.formCurrency);
  });
  $("#fPhoto").addEventListener("change", async (e) => {
    const file = e.target.files[0]; if (!file) return;
    toast("Fotoğraf işleniyor...");
    state.formPhoto = await readPhoto(file);
    renderPhotoBox();
  });
  $("#fSave").addEventListener("click", saveTxFromForm);
  if (editing) $("#fDelete").addEventListener("click", () => deleteTx(data.id));
  setTimeout(() => $("#fAmount") && $("#fAmount").focus(), 350);
}

function renderChips() {
  const box = $("#fChips"); if (!box) return;
  const cats = state.categories.filter((c) => c.type === state.formType);
  if (!state.formCat && cats.length) state.formCat = cats[0].id;
  box.innerHTML = cats.map((c) => `<button class="chip ${state.formCat === c.id ? "active" : ""}" data-cat="${c.id}"><span class="e">${c.icon}</span>${escapeHtml(c.name)}</button>`).join("");
}

function renderPhotoBox() {
  const box = $("#photoBox"); if (!box) return;
  if (state.formPhoto) {
    box.innerHTML = `<div class="photo-preview"><img src="${state.formPhoto}" alt="fiş"><button class="rm" id="rmPhoto">✕</button></div>`;
    $("#rmPhoto").addEventListener("click", () => { state.formPhoto = null; renderPhotoBox(); });
  } else {
    box.innerHTML = `<button class="photo-add" id="addPhoto">📷 Fotoğraf / fiş ekle</button>`;
    $("#addPhoto").addEventListener("click", () => $("#fPhoto").click());
  }
}

function readPhoto(file) {
  return new Promise((res) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 1100; let w = img.width, h = img.height;
      if (w > h && w > max) { h = h * max / w; w = max; }
      else if (h > max) { w = w * max / h; h = max; }
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      try { res(c.toDataURL("image/jpeg", 0.7)); } catch (e) { res(null); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); res(null); };
    img.src = url;
  });
}

async function saveTxFromForm() {
  const amount = parseAmount($("#fAmount").value);
  if (amount <= 0) { toast("Geçerli bir tutar gir"); return; }
  if (!state.formCat) { toast("Bir kategori seç"); return; }
  const tags = $("#fTags").value.split(",").map((s) => s.trim()).filter(Boolean);
  const t = {
    id: state.editId || DB.uid("tx"),
    type: state.formType, amount,
    currency: state.formCurrency || state.settings.currency,
    categoryId: state.formCat,
    item: $("#fItem").value.trim(), vendor: $("#fVendor").value.trim(),
    tags, note: $("#fNote").value.trim(), photo: state.formPhoto || null,
    date: $("#fDate").value || toLocalInput(new Date()),
    createdAt: state.editId ? (state.transactions.find((x) => x.id === state.editId)?.createdAt || Date.now()) : Date.now()
  };
  if (state.editId) { const old = state.transactions.find((x) => x.id === state.editId); if (old && old.recurringId) t.recurringId = old.recurringId; }
  await DB.saveTransaction(t);
  const idx = state.transactions.findIndex((x) => x.id === t.id);
  if (idx >= 0) state.transactions[idx] = t; else state.transactions.push(t);
  closeSheet();
  toast(state.editId ? "Güncellendi ✓" : "Kaydedildi ✓");
  refreshActiveView();
}

async function deleteTx(id) {
  if (!confirm("Bu işlemi silmek istediğine emin misin?")) return;
  await DB.deleteTransaction(id);
  state.transactions = state.transactions.filter((x) => x.id !== id);
  closeSheet(); toast("Silindi"); refreshActiveView();
}

/* ---- Kategori yönetimi ---- */
function openCatManager() {
  const render = () => {
    const exp = state.categories.filter((c) => c.type === "expense");
    const inc = state.categories.filter((c) => c.type === "income");
    const rows = (arr) => arr.map((c) => `<div class="row"><span class="e">${c.icon}</span><span class="n">${escapeHtml(c.name)}</span><button class="x" data-del-cat="${c.id}">✕</button></div>`).join("");
    openSheet(`
      <h2>Kategoriler</h2>
      <div class="field"><label>Yeni kategori ekle</label>
        <div class="btn-row" style="margin-top:0">
          <input class="input" id="ncIcon" placeholder="😀" style="flex:0 0 64px;text-align:center" maxlength="2" />
          <input class="input" id="ncName" placeholder="Kategori adı" style="flex:1" /></div>
        <div class="segment" id="ncType" style="margin:10px 0">
          <button class="exp active" data-nctype="expense">Gider</button>
          <button class="inc" data-nctype="income">Gelir</button></div>
        <button class="btn" id="ncAdd">Ekle</button></div>
      <div class="section-head" style="margin-top:14px"><h2 style="font-size:15px">Giderler</h2></div>
      <div class="cat-manage">${rows(exp) || '<div class="muted center">Yok</div>'}</div>
      <div class="section-head"><h2 style="font-size:15px">Gelirler</h2></div>
      <div class="cat-manage">${rows(inc) || '<div class="muted center">Yok</div>'}</div>
      <div class="spacer"></div>`);

    let ncType = "expense";
    $("#ncType").addEventListener("click", (e) => {
      const b = e.target.closest("[data-nctype]"); if (!b) return;
      ncType = b.dataset.nctype;
      $("#ncType").querySelectorAll("button").forEach((x) => x.classList.toggle("active", x.dataset.nctype === ncType));
    });
    $("#ncAdd").addEventListener("click", async () => {
      const name = $("#ncName").value.trim(), icon = $("#ncIcon").value.trim() || "🏷️";
      if (!name) { toast("Kategori adı gir"); return; }
      const palette = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#0ea5e9"];
      const c = { id: DB.uid("cat"), name, type: ncType, icon, color: palette[Math.floor(Math.random() * palette.length)] };
      await DB.saveCategory(c); state.categories.push(c); toast("Eklendi ✓"); render();
    });
    el("sheet").querySelectorAll("[data-del-cat]").forEach((b) => b.addEventListener("click", async () => {
      const id = b.dataset.delCat;
      if (state.transactions.some((t) => t.categoryId === id) && !confirm("Bu kategoride işlemler var. Silinsin mi? (işlemler 'Diğer' görünür)")) return;
      await DB.deleteCategory(id); state.categories = state.categories.filter((c) => c.id !== id); render();
    }));
  };
  render();
}

/* ---- Bütçe yönetimi ---- */
function openBudgetManager() {
  const exp = state.categories.filter((c) => c.type === "expense");
  openSheet(`
    <h2>Aylık bütçeler</h2>
    <div class="muted" style="font-size:13px;margin-bottom:14px">Her kategori için aylık harcama limiti belirle. Limite yaklaşınca uyarılırsın.</div>
    <div class="cat-manage" id="budgetList">
      ${exp.map((c) => {
        const b = budgetFor(c.id);
        return `<div class="row"><span class="e">${c.icon}</span><span class="n">${escapeHtml(c.name)}</span>
          <div class="amount-input" style="flex:0 0 130px;padding:2px 10px"><span class="cur" style="font-size:16px">${sym()}</span>
          <input inputmode="decimal" data-budget="${c.id}" placeholder="0" value="${b && b.limit ? String(b.limit).replace(".", ",") : ""}" style="font-size:18px;padding:6px 0" /></div></div>`;
      }).join("")}
    </div>
    <button class="btn" id="saveBudgets" style="margin-top:14px">Kaydet</button>
    <div class="spacer"></div>`);
  $("#saveBudgets").addEventListener("click", async () => {
    for (const inp of el("sheet").querySelectorAll("[data-budget]")) {
      const catId = inp.dataset.budget, val = parseAmount(inp.value);
      if (val > 0) await DB.saveBudget({ categoryId: catId, limit: val });
      else { await DB.deleteBudget(catId); }
    }
    state.budgets = await DB.getBudgets();
    closeSheet(); toast("Bütçeler kaydedildi ✓"); refreshActiveView();
  });
}

/* ---- Tekrarlayan işlemler ---- */
function openRecurringManager() {
  const render = () => {
    const rows = state.recurring.map((r) => {
      const c = catById(r.categoryId);
      return `<div class="rec-row"><span class="e">${c.icon}</span>
        <div class="m"><div class="rt">${escapeHtml(r.item || r.vendor || c.name)}</div>
        <div class="rd">${FREQ_TR[r.frequency]} · sonraki: ${fmtDateLong(r.nextDate + "T12:00")}${r.active ? "" : " · durduruldu"}</div></div>
        <div class="amt ${r.type}">${r.type === "income" ? "+" : "−"}${money(r.amount, r.currency).replace("-", "")}</div>
        <button class="x" data-del-rec="${r.id}">✕</button></div>`;
    }).join("");
    openSheet(`
      <h2>Tekrarlayan işlemler</h2>
      <div class="muted" style="font-size:13px;margin-bottom:14px">Kira, maaş, abonelik gibi düzenli işlemleri tanımla; uygulamayı her açtığında vadesi gelenler otomatik eklenir.</div>
      ${rows || '<div class="muted center" style="margin-bottom:14px">Henüz yok</div>'}
      <button class="btn ghost" id="addRec">+ Yeni tekrarlayan ekle</button>
      <div class="spacer"></div>`);
    el("sheet").querySelectorAll("[data-del-rec]").forEach((b) => b.addEventListener("click", async () => {
      if (!confirm("Bu tekrarlayan işlem silinsin mi? (geçmiş kayıtlar kalır)")) return;
      await DB.deleteRecurring(b.dataset.delRec);
      state.recurring = state.recurring.filter((r) => r.id !== b.dataset.delRec); render();
    }));
    $("#addRec").addEventListener("click", openRecurringForm);
  };
  render();
}

function openRecurringForm() {
  let rType = "expense", rCat = null, rFreq = "monthly";
  openSheet(`
    <h2>Yeni tekrarlayan</h2>
    <div class="segment" id="rSeg">
      <button class="exp active" data-rt="expense">Gider</button>
      <button class="inc" data-rt="income">Gelir</button></div>
    <div class="field"><div class="amount-input"><span class="cur">${sym()}</span>
      <input id="rAmount" inputmode="decimal" placeholder="0" /></div></div>
    <div class="field"><label>Kategori</label><div class="chips" id="rChips"></div></div>
    <div class="field"><label>Açıklama</label><input class="input" id="rItem" placeholder="örn. Ev kirası, Netflix, Maaş" /></div>
    <div class="field"><label>Sıklık</label>
      <div class="segment" id="rFreq">
        <button data-rf="daily">Günlük</button>
        <button data-rf="weekly">Haftalık</button>
        <button class="active inc" data-rf="monthly">Aylık</button></div></div>
    <div class="field"><label>İlk / sonraki tarih</label><input class="input" id="rDate" type="date" value="${isoDate(new Date())}" /></div>
    <button class="btn" id="rSave">Kaydet</button><div class="spacer"></div>`);

  const drawChips = () => {
    const box = $("#rChips"); const cats = state.categories.filter((c) => c.type === rType);
    if (!rCat && cats.length) rCat = cats[0].id;
    box.innerHTML = cats.map((c) => `<button class="chip ${rCat === c.id ? "active" : ""}" data-rcat="${c.id}"><span class="e">${c.icon}</span>${escapeHtml(c.name)}</button>`).join("");
  };
  drawChips();
  $("#rSeg").addEventListener("click", (e) => { const b = e.target.closest("[data-rt]"); if (!b) return; rType = b.dataset.rt; rCat = null; $("#rSeg").querySelectorAll("button").forEach((x) => x.classList.toggle("active", x.dataset.rt === rType)); drawChips(); });
  $("#rChips").addEventListener("click", (e) => { const c = e.target.closest("[data-rcat]"); if (!c) return; rCat = c.dataset.rcat; drawChips(); });
  $("#rFreq").addEventListener("click", (e) => { const b = e.target.closest("[data-rf]"); if (!b) return; rFreq = b.dataset.rf; $("#rFreq").querySelectorAll("button").forEach((x) => { x.classList.toggle("active", x.dataset.rf === rFreq); x.classList.toggle("inc", x.dataset.rf === rFreq); }); });
  $("#rSave").addEventListener("click", async () => {
    const amount = parseAmount($("#rAmount").value);
    if (amount <= 0) { toast("Tutar gir"); return; }
    if (!rCat) { toast("Kategori seç"); return; }
    const r = {
      id: DB.uid("rec"), type: rType, amount, categoryId: rCat,
      item: $("#rItem").value.trim(), vendor: "", note: "", tags: [],
      currency: state.settings.currency, frequency: rFreq,
      nextDate: $("#rDate").value || isoDate(new Date()), active: true
    };
    await DB.saveRecurring(r); state.recurring.push(r);
    const created = await runRecurring();
    closeSheet();
    toast(created ? `Eklendi ✓ (${created} kayıt oluşturuldu)` : "Eklendi ✓");
    openRecurringManager(); refreshActiveView();
  });
}

/* ---- Yedekleme ---- */
async function exportData() {
  const payload = await DB.exportAll();
  downloadFile(JSON.stringify(payload, null, 2), `mani-yedek-${isoDate(new Date())}.json`, "application/json");
  toast("Yedek indirildi ✓");
}

function csvCell(v) { v = String(v == null ? "" : v); return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function exportCSV() {
  const rows = [["Tarih", "Saat", "Tür", "Tutar", "ParaBirimi", "Kategori", "Ürün", "Yer", "Etiketler", "Not"]];
  sortedTx().forEach((t) => {
    const c = catById(t.categoryId);
    rows.push([t.date.slice(0, 10), fmtTime(t.date), t.type === "income" ? "Gelir" : "Gider",
      String(t.amount).replace(".", ","), t.currency || state.settings.currency, c.name,
      t.item || "", t.vendor || "", (t.tags || []).join("|"), (t.note || "").replace(/\n/g, " ")]);
  });
  const csv = rows.map((r) => r.map(csvCell).join(";")).join("\r\n");
  downloadFile("﻿" + csv, `mani-${isoDate(new Date())}.csv`, "text/csv;charset=utf-8");
  toast("CSV indirildi ✓");
}

function downloadFile(content, name, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

async function handleImportFile(e) {
  const file = e.target.files[0]; if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    if (!confirm("Yedek yüklenecek. Mevcut veriler bu yedekle değiştirilsin mi?")) { e.target.value = ""; return; }
    await DB.importAll(payload, { merge: false });
    await loadData(); applyTheme();
    toast("Yedek yüklendi ✓"); renderSettings();
  } catch (err) { toast("Dosya okunamadı"); }
  e.target.value = "";
}

async function wipeData() {
  if (!confirm("TÜM verilerin kalıcı olarak silinecek. Emin misin?")) return;
  if (!confirm("Son kez: gerçekten tüm veriyi sil?")) return;
  await DB.wipe(); await DB.ensureSeed(); await loadData();
  toast("Tüm veri silindi"); navTo("home");
}

/* ----------------------------------------------------------
   Olay bağlama
---------------------------------------------------------- */
function bindGlobalEvents() {
  document.querySelectorAll(".nav-item").forEach((b) => b.addEventListener("click", () => navTo(b.dataset.nav)));
  el("fab").addEventListener("click", () => openTxForm(null));
  el("backdrop").addEventListener("click", closeSheet);

  document.querySelector(".app").addEventListener("click", (e) => {
    const goto = e.target.closest("[data-goto]"); if (goto) return navTo(goto.dataset.goto);

    const quick = e.target.closest("[data-quick]");
    if (quick) { const q = (state._templates || [])[+quick.dataset.quick]; if (q) openTxForm({ type: "expense", categoryId: q.categoryId, item: q.item, vendor: q.vendor, amount: q.amount, currency: q.currency }); return; }

    const editBtn = e.target.closest("[data-edit]");
    if (editBtn) { const t = state.transactions.find((x) => x.id === editBtn.dataset.edit); if (t) openTxForm(t); return; }

    const filter = e.target.closest("[data-filter]"); if (filter) { state.txFilter = filter.dataset.filter; return renderTx(); }
    const range = e.target.closest("[data-range]"); if (range) { state.txRange = range.dataset.range; return renderTx(); }

    const monthBtn = e.target.closest("[data-month]");
    if (monthBtn) { const [y, m] = state.month.split("-").map(Number); state.month = monthKey(new Date(y, m - 1 + (+monthBtn.dataset.month), 1)); return renderStats(); }

    const themeBtn = e.target.closest("[data-theme-set]");
    if (themeBtn) { state.settings.theme = themeBtn.dataset.themeSet; DB.setMeta("theme", state.settings.theme); applyTheme(); return renderSettings(); }

    const action = e.target.closest("[data-action]");
    if (action) {
      const a = action.dataset.action;
      if (a === "manage-cats") openCatManager();
      else if (a === "budgets") openBudgetManager();
      else if (a === "recurring") openRecurringManager();
      else if (a === "export") exportData();
      else if (a === "csv") exportCSV();
      else if (a === "import") el("importFile").click();
      else if (a === "wipe") wipeData();
    }
  });
}

/* ----------------------------------------------------------
   Başlatma
---------------------------------------------------------- */
async function loadData() {
  state.transactions = await DB.getTransactions();
  state.categories = await DB.getCategories();
  state.budgets = await DB.getBudgets();
  state.recurring = await DB.getRecurring();
  state.settings.theme = await DB.getMeta("theme", "system");
  state.settings.currency = await DB.getMeta("currency", "TRY");
}

async function init() {
  await DB.open();
  await DB.ensureSeed();
  await loadData();
  applyTheme();
  await runRecurring();
  bindGlobalEvents();
  navTo("home");
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
}

init();
