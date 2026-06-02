// Mani — Veri Katmanı (v2)
// Tüm veriler telefonun içinde (IndexedDB) saklanır. Sunucu yok.

const DB_NAME = "mani-db";
const DB_VERSION = 2;

const DEFAULT_CATEGORIES = [
  // Giderler
  { id: "cat-yemek", name: "Yemek", type: "expense", icon: "🍽️", color: "#f59e0b" },
  { id: "cat-market", name: "Market", type: "expense", icon: "🛒", color: "#10b981" },
  { id: "cat-ulasim", name: "Ulaşım", type: "expense", icon: "🚌", color: "#3b82f6" },
  { id: "cat-fatura", name: "Faturalar", type: "expense", icon: "🧾", color: "#ef4444" },
  { id: "cat-kira", name: "Kira", type: "expense", icon: "🏠", color: "#8b5cf6" },
  { id: "cat-saglik", name: "Sağlık", type: "expense", icon: "💊", color: "#ec4899" },
  { id: "cat-giyim", name: "Giyim", type: "expense", icon: "👕", color: "#14b8a6" },
  { id: "cat-eglence", name: "Eğlence", type: "expense", icon: "🎮", color: "#f43f5e" },
  { id: "cat-teknoloji", name: "Teknoloji", type: "expense", icon: "💻", color: "#0ea5e9" },
  { id: "cat-egitim", name: "Eğitim", type: "expense", icon: "📚", color: "#a855f7" },
  { id: "cat-diger-gider", name: "Diğer", type: "expense", icon: "📦", color: "#64748b" },
  // Gelirler
  { id: "cat-maas", name: "Maaş", type: "income", icon: "💼", color: "#22c55e" },
  { id: "cat-ekgelir", name: "Ek Gelir", type: "income", icon: "💸", color: "#16a34a" },
  { id: "cat-hediye", name: "Hediye", type: "income", icon: "🎁", color: "#84cc16" },
  { id: "cat-satis", name: "Satış", type: "income", icon: "🏷️", color: "#06b6d4" },
  { id: "cat-diger-gelir", name: "Diğer", type: "income", icon: "➕", color: "#64748b" }
];

let _db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (_db) return resolve(_db);
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("transactions")) {
        const tx = db.createObjectStore("transactions", { keyPath: "id" });
        tx.createIndex("date", "date");
        tx.createIndex("type", "type");
        tx.createIndex("categoryId", "categoryId");
      }
      if (!db.objectStoreNames.contains("categories")) {
        db.createObjectStore("categories", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
      // v2 eklenenler
      if (!db.objectStoreNames.contains("budgets")) {
        db.createObjectStore("budgets", { keyPath: "categoryId" });
      }
      if (!db.objectStoreNames.contains("recurring")) {
        db.createObjectStore("recurring", { keyPath: "id" });
      }
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

function tx(store, mode = "readonly") {
  return openDB().then((db) => db.transaction(store, mode).objectStore(store));
}

function reqToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getAll(store) {
  return tx(store).then((s) => reqToPromise(s.getAll()));
}
function put(store, value) {
  return tx(store, "readwrite").then((s) => reqToPromise(s.put(value)));
}
function del(store, key) {
  return tx(store, "readwrite").then((s) => reqToPromise(s.delete(key)));
}
function clearStore(store) {
  return tx(store, "readwrite").then((s) => reqToPromise(s.clear()));
}

async function ensureSeed() {
  const cats = await getAll("categories");
  if (cats.length === 0) {
    for (const c of DEFAULT_CATEGORIES) await put("categories", c);
  }
}

function uid(prefix = "id") {
  return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

const DB = {
  open: openDB,
  ensureSeed,
  uid,

  // İşlemler
  getTransactions: () => getAll("transactions"),
  saveTransaction: (t) => put("transactions", t),
  deleteTransaction: (id) => del("transactions", id),

  // Kategoriler
  getCategories: () => getAll("categories"),
  saveCategory: (c) => put("categories", c),
  deleteCategory: (id) => del("categories", id),

  // Bütçeler
  getBudgets: () => getAll("budgets"),
  saveBudget: (b) => put("budgets", b),
  deleteBudget: (categoryId) => del("budgets", categoryId),

  // Tekrarlayan işlemler
  getRecurring: () => getAll("recurring"),
  saveRecurring: (r) => put("recurring", r),
  deleteRecurring: (id) => del("recurring", id),

  // Ayarlar (meta)
  getMeta: (key, fallback = null) =>
    tx("meta").then((s) => reqToPromise(s.get(key))).then((r) => (r ? r.value : fallback)),
  setMeta: (key, value) => put("meta", { key, value }),

  // Yedekleme
  async exportAll() {
    const [transactions, categories, budgets, recurring] = await Promise.all([
      getAll("transactions"), getAll("categories"), getAll("budgets"), getAll("recurring")
    ]);
    const theme = await this.getMeta("theme", "system");
    const currency = await this.getMeta("currency", "TRY");
    return {
      app: "Mani",
      version: 2,
      exportedAt: new Date().toISOString(),
      data: { transactions, categories, budgets, recurring, settings: { theme, currency } }
    };
  },

  async importAll(payload, { merge = false } = {}) {
    if (!payload || !payload.data) throw new Error("Geçersiz yedek dosyası.");
    const { transactions = [], categories = [], budgets = [], recurring = [], settings = {} } = payload.data;
    if (!merge) {
      await clearStore("transactions");
      await clearStore("categories");
      await clearStore("budgets");
      await clearStore("recurring");
    }
    for (const c of categories) await put("categories", c);
    for (const t of transactions) await put("transactions", t);
    for (const b of budgets) await put("budgets", b);
    for (const r of recurring) await put("recurring", r);
    if (settings.theme) await this.setMeta("theme", settings.theme);
    if (settings.currency) await this.setMeta("currency", settings.currency);
  },

  async wipe() {
    await clearStore("transactions");
    await clearStore("categories");
    await clearStore("budgets");
    await clearStore("recurring");
    await clearStore("meta");
  }
};

window.DB = DB;
