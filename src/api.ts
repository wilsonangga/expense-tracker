import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Expense, Category, Receipt } from "./types";

const SETTINGS_KEY = "settings";

export interface Settings {
  serverUrl: string;
  apiKey: string;
}

export async function loadSettings(): Promise<Settings> {
  const raw = await AsyncStorage.getItem(SETTINGS_KEY);
  return raw ? JSON.parse(raw) : { serverUrl: "", apiKey: "" };
}

export async function saveSettings(s: Settings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { serverUrl, apiKey } = await loadSettings();
  if (!serverUrl) throw new Error("Server URL not configured. Open Settings.");
  const res = await fetch(`${serverUrl.replace(/\/$/, "")}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error || `Request failed (${res.status})`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const api = {
  listExpenses: (params?: { from?: string; to?: string }) => {
    const q = new URLSearchParams();
    if (params?.from) q.set("from", params.from);
    if (params?.to) q.set("to", params.to);
    const qs = q.toString();
    return request<Expense[]>(`/expenses${qs ? `?${qs}` : ""}`);
  },
  addExpense: (e: {
    amount: number;
    category: string;
    note?: string;
    date?: string;
  }) =>
    request<Expense>("/expenses", { method: "POST", body: JSON.stringify(e) }),
  updateExpense: (
    id: string,
    e: { amount?: number; category?: string; note?: string; date?: string },
  ) =>
    request<Expense>(`/expenses/${id}`, {
      method: "PUT",
      body: JSON.stringify(e),
    }),
  deleteExpense: (id: string) =>
    request<void>(`/expenses/${id}`, { method: "DELETE" }),
  listCategories: () => request<Category[]>("/categories"),
  addCategory: (c: Category) =>
    request<Category>("/categories", {
      method: "POST",
      body: JSON.stringify(c),
    }),
  deleteCategory: (name: string) =>
    request<void>(`/categories/${encodeURIComponent(name)}`, {
      method: "DELETE",
    }),
  scanReceipt: (imageBase64: string, mimeType = "image/jpeg") =>
    request<Receipt>("/receipts/scan", {
      method: "POST",
      body: JSON.stringify({ image: imageBase64, mimeType }),
    }),
};

export const formatMoney = (n: number) => "Rp " + n.toLocaleString("id-ID");
