import { google } from "googleapis";
import crypto from "node:crypto";

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

const EXPENSES_SHEET = "Expenses";
const CATEGORIES_SHEET = "Categories";
const EXPENSE_HEADERS = [
  "id",
  "date",
  "amount",
  "category",
  "note",
  "source",
  "created_at",
];
const CATEGORY_HEADERS = ["name", "icon", "color"];

const DEFAULT_CATEGORIES = [
  ["Food", "🍔", "#F59E0B"],
  ["Transport", "🚗", "#3B82F6"],
  ["Shopping", "🛍️", "#EC4899"],
  ["Bills", "🧾", "#6366F1"],
  ["Health", "💊", "#10B981"],
  ["Entertainment", "🎬", "#8B5CF6"],
  ["Other", "📦", "#6B7280"],
];

let sheetsClient = null;

async function getSheets() {
  if (!sheetsClient) {
    // Cloud hosts: set GOOGLE_CREDENTIALS_JSON to the full JSON key content.
    // Local dev: set GOOGLE_APPLICATION_CREDENTIALS to the key file path.
    const auth = process.env.GOOGLE_CREDENTIALS_JSON
      ? new google.auth.GoogleAuth({
          credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON),
          scopes: ["https://www.googleapis.com/auth/spreadsheets"],
        })
      : new google.auth.GoogleAuth({
          keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
          scopes: ["https://www.googleapis.com/auth/spreadsheets"],
        });
    sheetsClient = google.sheets({ version: "v4", auth });
  }
  return sheetsClient;
}

/** Ensure both tabs exist with headers; seed default categories on first run. */
export async function ensureSheetsSetup() {
  const sheets = await getSheets();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const existing = new Set(meta.data.sheets.map((s) => s.properties.title));

  const requests = [];
  for (const title of [EXPENSES_SHEET, CATEGORIES_SHEET]) {
    if (!existing.has(title))
      requests.push({ addSheet: { properties: { title } } });
  }
  if (requests.length) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests },
    });
  }

  // Write headers if missing
  const headerRanges = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: SPREADSHEET_ID,
    ranges: [`${EXPENSES_SHEET}!A1:G1`, `${CATEGORIES_SHEET}!A1:C1`],
  });
  const [expHeader, catHeader] = headerRanges.data.valueRanges;

  const updates = [];
  if (!expHeader.values) {
    updates.push({ range: `${EXPENSES_SHEET}!A1`, values: [EXPENSE_HEADERS] });
  }
  if (!catHeader.values) {
    updates.push({
      range: `${CATEGORIES_SHEET}!A1`,
      values: [CATEGORY_HEADERS, ...DEFAULT_CATEGORIES],
    });
  }
  if (updates.length) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { valueInputOption: "RAW", data: updates },
    });
  }
}

// ---------- Read cache (Google Sheets calls take ~0.5–1.5s each) ----------

const CACHE_TTL = 30_000;
const cache = new Map(); // key -> { data, at }

const cacheGet = (key) => {
  const hit = cache.get(key);
  return hit && Date.now() - hit.at < CACHE_TTL ? hit.data : null;
};
const cacheSet = (key, data) => cache.set(key, { data, at: Date.now() });
const invalidate = (key) => cache.delete(key);

// ---------- Categories ----------

export async function listCategories() {
  const cached = cacheGet("categories");
  if (cached) return cached;
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${CATEGORIES_SHEET}!A2:C`,
  });
  const result = (res.data.values || [])
    .filter((r) => r[0])
    .map(([name, icon, color]) => ({
      name,
      icon: icon || "📦",
      color: color || "#6B7280",
    }));
  cacheSet("categories", result);
  return result;
}

export async function addCategory({ name, icon, color }) {
  const existing = await listCategories();
  if (existing.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
    throw Object.assign(new Error(`Category "${name}" already exists`), {
      status: 409,
    });
  }
  const sheets = await getSheets();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${CATEGORIES_SHEET}!A:C`,
    valueInputOption: "RAW",
    requestBody: { values: [[name, icon || "📦", color || "#6B7280"]] },
  });
  invalidate("categories");
  return { name, icon: icon || "📦", color: color || "#6B7280" };
}

export async function deleteCategory(name) {
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${CATEGORIES_SHEET}!A2:A`,
  });
  const rows = res.data.values || [];
  const idx = rows.findIndex(
    (r) => (r[0] || "").toLowerCase() === name.toLowerCase(),
  );
  if (idx === -1)
    throw Object.assign(new Error(`Category "${name}" not found`), {
      status: 404,
    });
  await deleteRow(CATEGORIES_SHEET, idx + 1); // +1 to skip header (0-based row index)
  invalidate("categories");
}

// ---------- Expenses ----------

export async function listExpenses({ from, to } = {}) {
  let items = cacheGet("expenses");
  if (!items) {
    const sheets = await getSheets();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${EXPENSES_SHEET}!A2:G`,
    });
    items = (res.data.values || [])
      .filter((r) => r[0])
      .map(([id, date, amount, category, note, source, created_at]) => ({
        id,
        date,
        amount: Number(amount) || 0,
        category,
        note: note || "",
        source: source || "app",
        created_at,
      }));
    // Newest first
    items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    cacheSet("expenses", items);
  }
  if (from) items = items.filter((e) => e.date >= from);
  if (to) items = items.filter((e) => e.date <= to);
  return items;
}

export async function addExpense({
  amount,
  category,
  note = "",
  date,
  source = "app",
}) {
  const expense = {
    id: crypto.randomUUID(),
    date: date || new Date().toISOString().slice(0, 10),
    amount: Number(amount),
    category,
    note,
    source,
    created_at: new Date().toISOString(),
  };
  if (!Number.isFinite(expense.amount) || expense.amount <= 0) {
    throw Object.assign(new Error("Amount must be a positive number"), {
      status: 400,
    });
  }
  if (!category) {
    throw Object.assign(new Error("Category is required"), { status: 400 });
  }
  const sheets = await getSheets();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${EXPENSES_SHEET}!A:G`,
    valueInputOption: "RAW",
    requestBody: {
      values: [
        [
          expense.id,
          expense.date,
          expense.amount,
          expense.category,
          expense.note,
          expense.source,
          expense.created_at,
        ],
      ],
    },
  });
  invalidate("expenses");
  return expense;
}

export async function updateExpense(id, { amount, category, note, date }) {
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${EXPENSES_SHEET}!A2:G`,
  });
  const rows = res.data.values || [];
  const idx = rows.findIndex((r) => r[0] === id);
  if (idx === -1)
    throw Object.assign(new Error("Expense not found"), { status: 404 });

  const [, curDate, curAmount, curCategory, curNote, curSource, curCreatedAt] =
    rows[idx];
  const expense = {
    id,
    date: date ?? curDate,
    amount: amount !== undefined ? Number(amount) : Number(curAmount),
    category: category ?? curCategory,
    note: note ?? curNote ?? "",
    source: curSource || "app",
    created_at: curCreatedAt,
  };
  if (!Number.isFinite(expense.amount) || expense.amount <= 0) {
    throw Object.assign(new Error("Amount must be a positive number"), {
      status: 400,
    });
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${EXPENSES_SHEET}!A${idx + 2}:G${idx + 2}`,
    valueInputOption: "RAW",
    requestBody: {
      values: [
        [
          expense.id,
          expense.date,
          expense.amount,
          expense.category,
          expense.note,
          expense.source,
          expense.created_at,
        ],
      ],
    },
  });
  invalidate("expenses");
  return expense;
}

export async function deleteExpense(id) {
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${EXPENSES_SHEET}!A2:A`,
  });
  const rows = res.data.values || [];
  const idx = rows.findIndex((r) => r[0] === id);
  if (idx === -1)
    throw Object.assign(new Error("Expense not found"), { status: 404 });
  await deleteRow(EXPENSES_SHEET, idx + 1);
  invalidate("expenses");
}

// ---------- helpers ----------

async function deleteRow(sheetTitle, rowIndex) {
  const sheets = await getSheets();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sheet = meta.data.sheets.find((s) => s.properties.title === sheetTitle);
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: sheet.properties.sheetId,
              dimension: "ROWS",
              startIndex: rowIndex,
              endIndex: rowIndex + 1,
            },
          },
        },
      ],
    },
  });
}
