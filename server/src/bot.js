import { Bot, InlineKeyboard } from "grammy";
import {
  addExpense,
  listCategories,
  listExpenses,
  addCategory,
} from "./sheets.js";
import { scanReceipt, splitAmount } from "./vision.js";

/**
 * Parse a free-form chat message into an expense.
 * Supported forms (case-insensitive):
 *   "25000 lunch"                  -> amount + note, category guessed
 *   "food 25000 nasi goreng"       -> category + amount + note
 *   "25k coffee"  / "1.5m rent"    -> k = thousand, m = million shorthand
 *   "25 jun 25000 transport"       -> explicit date (defaults to today)
 *   also: "jun 25", "25/6", "25-06-2026", "2026-06-25", "kemarin"/"yesterday"
 */
const MONTHS = {
  jan: 1,
  januari: 1,
  january: 1,
  feb: 2,
  februari: 2,
  february: 2,
  mar: 3,
  maret: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  mei: 5,
  jun: 6,
  juni: 6,
  june: 6,
  jul: 7,
  juli: 7,
  july: 7,
  aug: 8,
  agu: 8,
  agustus: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  okt: 10,
  oktober: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  des: 12,
  desember: 12,
  december: 12,
};

const pad2 = (n) => String(n).padStart(2, "0");

const isValidDay = (d) => Number.isInteger(d) && d >= 1 && d <= 31;

const toISO = (y, mo, d) => {
  const date = new Date(y, mo - 1, d);
  if (date.getMonth() !== mo - 1 || date.getDate() !== d) return null; // e.g. 31 Feb
  return `${y}-${pad2(mo)}-${pad2(d)}`;
};

/**
 * Extract a date from the token list. Returns { date, usedIndexes } or null.
 * Date tokens are removed from note/amount parsing by index.
 */
function extractDate(tokens) {
  const now = new Date();
  const year = now.getFullYear();

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i].toLowerCase().replace(/,$/, "");

    // yesterday / kemarin, today / hari ini handled loosely
    if (t === "yesterday" || t === "kemarin") {
      const d = new Date(now.getTime() - 86400000);
      return {
        date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
        usedIndexes: [i],
      };
    }

    // ISO: 2026-06-25
    let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const iso = toISO(Number(m[1]), Number(m[2]), Number(m[3]));
      if (iso) return { date: iso, usedIndexes: [i] };
    }

    // 25/6, 25/06/2026, 25-6-2026 (day first, Indonesian convention)
    m = t.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?$/);
    if (m) {
      const d = Number(m[1]);
      const mo = Number(m[2]);
      let y = m[3] ? Number(m[3]) : year;
      if (y < 100) y += 2000;
      if (isValidDay(d) && mo >= 1 && mo <= 12) {
        const iso = toISO(y, mo, d);
        if (iso) return { date: iso, usedIndexes: [i] };
      }
    }

    // "25 jun" / "25 juni" — day followed by month name
    if (/^\d{1,2}$/.test(t) && i + 1 < tokens.length) {
      const mo = MONTHS[tokens[i + 1].toLowerCase().replace(/,$/, "")];
      const d = Number(t);
      if (mo && isValidDay(d)) {
        // optional year after the month name
        const maybeYear = tokens[i + 2];
        if (maybeYear && /^\d{4}$/.test(maybeYear)) {
          const iso = toISO(Number(maybeYear), mo, d);
          if (iso) return { date: iso, usedIndexes: [i, i + 1, i + 2] };
        }
        const iso = toISO(year, mo, d);
        if (iso) return { date: iso, usedIndexes: [i, i + 1] };
      }
    }

    // "jun 25" — month name followed by day
    if (MONTHS[t] && i + 1 < tokens.length && /^\d{1,2}$/.test(tokens[i + 1])) {
      const d = Number(tokens[i + 1]);
      if (isValidDay(d)) {
        const maybeYear = tokens[i + 2];
        if (maybeYear && /^\d{4}$/.test(maybeYear)) {
          const iso = toISO(Number(maybeYear), MONTHS[t], d);
          if (iso) return { date: iso, usedIndexes: [i, i + 1, i + 2] };
        }
        const iso = toISO(year, MONTHS[t], d);
        if (iso) return { date: iso, usedIndexes: [i, i + 1] };
      }
    }
  }
  return null;
}

export function parseExpenseMessage(text, categories) {
  const tokens = text.trim().split(/\s+/);
  if (!tokens.length) return null;

  const dateResult = extractDate(tokens);
  const skip = new Set(dateResult?.usedIndexes || []);

  const catNames = categories.map((c) => c.name.toLowerCase());
  let amount = null;
  let category = null;
  const noteParts = [];

  for (let i = 0; i < tokens.length; i++) {
    if (skip.has(i)) continue;
    const token = tokens[i];
    const m = token.toLowerCase().match(/^(?:rp\.?)?([\d.,]+)(k|rb|m|jt)?$/i);
    if (amount === null && m && /\d/.test(m[1])) {
      let value = Number(
        m[1].replace(/[.,](?=\d{3}\b)/g, "").replace(",", "."),
      );
      const suffix = (m[2] || "").toLowerCase();
      if (suffix === "k" || suffix === "rbu") value *= 1_000;
      if (suffix === "m" || suffix === "jt") value *= 1_000_000;
      amount = value;
      continue;
    }
    if (category === null && catNames.includes(token.toLowerCase())) {
      category = categories[catNames.indexOf(token.toLowerCase())].name;
      continue;
    }
    noteParts.push(token);
  }

  if (amount === null || amount <= 0) return null;
  return {
    amount,
    category,
    note: noteParts.join(" "),
    date: dateResult?.date, // undefined -> server defaults to today
  };
}

/** Simple keyword → category guesser as a fallback. */
const CATEGORY_KEYWORDS = {
  Food: [
    "lunch",
    "dinner",
    "breakfast",
    "coffee",
    "makan",
    "nasi",
    "kopi",
    "snack",
    "food",
    "restaurant",
  ],
  Transport: [
    "gojek",
    "grab",
    "taxi",
    "bus",
    "train",
    "fuel",
    "bensin",
    "parkir",
    "parking",
    "toll",
    "tol",
  ],
  Bills: [
    "electricity",
    "listrik",
    "internet",
    "water",
    "pulsa",
    "rent",
    "sewa",
    "bill",
  ],
  Health: ["doctor", "dokter", "medicine", "obat", "gym", "vitamin"],
  Entertainment: ["movie", "film", "netflix", "spotify", "game", "concert"],
  Shopping: [
    "shirt",
    "baju",
    "shoes",
    "sepatu",
    "tokopedia",
    "shopee",
    "amazon",
  ],
};

export function guessCategory(note, categories) {
  const lower = note.toLowerCase();
  for (const [cat, words] of Object.entries(CATEGORY_KEYWORDS)) {
    if (
      categories.some((c) => c.name === cat) &&
      words.some((w) => lower.includes(w))
    ) {
      return cat;
    }
  }
  return (
    categories.find((c) => c.name === "Other")?.name || categories[0]?.name
  );
}

const fmt = (n) => "Rp " + Number(n).toLocaleString("id-ID");

export function createBot() {
  const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);

  const allowed = (process.env.ALLOWED_TELEGRAM_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Auth guard
  bot.use(async (ctx, next) => {
    if (allowed.length && !allowed.includes(String(ctx.from?.id))) {
      await ctx.reply(
        `Sorry, you are not authorized. Your Telegram ID is ${ctx.from?.id}.`,
      );
      return;
    }
    await next();
  });

  bot.command("start", (ctx) =>
    ctx.reply(
      [
        "👋 Welcome to your expense tracker!",
        "",
        "Just type an expense, e.g.:",
        "• 25000 lunch",
        "• food 25k nasi goreng",
        "• transport 15rb gojek",
        "",
        "Date is today unless you add one:",
        "• 25 jun 25000 transport",
        "• kemarin 10k parkir",
        "",
        "📸 Or send a photo of a receipt — I'll scan the items so you can pick which ones are yours (handy for split bills).",
        "",
        "Commands:",
        "/today — today's total",
        "/week — last 7 days summary",
        "/month — this month summary",
        "/categories — list categories",
        "/addcategory <name> [icon] — add a category",
      ].join("\n"),
    ),
  );

  bot.command("categories", async (ctx) => {
    const cats = await listCategories();
    await ctx.reply(
      "📂 Categories:\n" + cats.map((c) => `${c.icon} ${c.name}`).join("\n"),
    );
  });

  bot.command("addcategory", async (ctx) => {
    const [name, icon] = (ctx.match || "").trim().split(/\s+/);
    if (!name) return ctx.reply("Usage: /addcategory <name> [icon]");
    try {
      const cat = await addCategory({ name, icon });
      await ctx.reply(`✅ Category added: ${cat.icon} ${cat.name}`);
    } catch (err) {
      await ctx.reply(`⚠️ ${err.message}`);
    }
  });

  const summary = async (ctx, from, label) => {
    const items = await listExpenses({ from });
    if (!items.length) return ctx.reply(`No expenses ${label}. 🎉`);
    const total = items.reduce((s, e) => s + e.amount, 0);
    const byCat = {};
    for (const e of items)
      byCat[e.category] = (byCat[e.category] || 0) + e.amount;
    const lines = Object.entries(byCat)
      .sort((a, b) => b[1] - a[1])
      .map(([c, v]) => `• ${c}: ${fmt(v)}`);
    await ctx.reply(
      `📊 Spending ${label} (${items.length} items)\nTotal: ${fmt(total)}\n\n${lines.join("\n")}`,
    );
  };

  const isoDaysAgo = (n) =>
    new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

  bot.command("today", (ctx) => summary(ctx, isoDaysAgo(0), "today"));
  bot.command("week", (ctx) =>
    summary(ctx, isoDaysAgo(6), "in the last 7 days"),
  );
  bot.command("month", (ctx) =>
    summary(ctx, new Date().toISOString().slice(0, 8) + "01", "this month"),
  );

  // ---------- Receipt photo scanning ----------
  // chatId -> { receipt, selected:Set<number>, messageId, createdAt }
  const pendingReceipts = new Map();
  const RECEIPT_TTL = 30 * 60 * 1000;

  const cleanupReceipts = () => {
    const now = Date.now();
    for (const [k, v] of pendingReceipts) {
      if (now - v.createdAt > RECEIPT_TTL) pendingReceipts.delete(k);
    }
  };

  const receiptText = (session) => {
    const { receipt, selected } = session;
    const lines = [
      `🧾 ${receipt.merchant || "Receipt"}${receipt.date ? ` · ${receipt.date}` : ""}`,
      "",
      "Tap items to select; use −/＋ for quantities:",
    ];
    if (receipt.serviceFee)
      lines.push(`Service fee: ${fmt(receipt.serviceFee)}`);
    if (receipt.tax) lines.push(`Tax: ${fmt(receipt.tax)}`);
    if (receipt.discount) lines.push(`Discount: -${fmt(receipt.discount)}`);
    const selCount = selected.reduce((s, q) => s + q, 0);
    const yourTotal = splitAmount(receipt, selected);
    lines.push(
      "",
      selCount
        ? `Your share (incl. fees): ${fmt(yourTotal)}`
        : "Nothing selected yet.",
    );
    return lines.join("\n");
  };

  const receiptKeyboard = (session) => {
    const kb = new InlineKeyboard();
    session.receipt.items.forEach((it, i) => {
      const sel = session.selected[i];
      const mark = sel > 0 ? "✅" : "⬜";
      const qtyLabel = it.qty > 1 ? ` ${sel}/${it.qty}` : "";
      kb.text(
        `${mark}${qtyLabel} ${it.name} — ${fmt(it.price)}`,
        `rcpt:toggle:${i}`,
      );
      if (it.qty > 1) {
        kb.text("−", `rcpt:dec:${i}`).text("＋", `rcpt:inc:${i}`);
      }
      kb.row();
    });
    kb.text("Select all", "rcpt:all")
      .text("Clear", "rcpt:none")
      .row()
      .text("✅ Save my items", "rcpt:save")
      .text("❌ Cancel", "rcpt:cancel");
    return kb;
  };

  bot.on("message:photo", async (ctx) => {
    cleanupReceipts();
    const waitMsg = await ctx.reply("🔍 Scanning receipt…");
    try {
      const photos = ctx.message.photo;
      const fileId = photos[photos.length - 1].file_id; // largest size
      const file = await ctx.api.getFile(fileId);
      const url = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
      const imgRes = await fetch(url);
      const buffer = Buffer.from(await imgRes.arrayBuffer());
      const receipt = await scanReceipt(buffer.toString("base64"));

      const session = {
        receipt,
        selected: receipt.items.map((it) => it.qty), // default: everything selected
        createdAt: Date.now(),
      };
      pendingReceipts.set(ctx.chat.id, session);

      await ctx.api.editMessageText(
        ctx.chat.id,
        waitMsg.message_id,
        receiptText(session),
        { reply_markup: receiptKeyboard(session) },
      );
      session.messageId = waitMsg.message_id;
    } catch (err) {
      await ctx.api.editMessageText(
        ctx.chat.id,
        waitMsg.message_id,
        `⚠️ ${err.message}`,
      );
    }
  });

  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (!data.startsWith("rcpt:")) return ctx.answerCallbackQuery();

    const session = pendingReceipts.get(ctx.chat.id);
    if (!session) {
      await ctx.answerCallbackQuery({ text: "This receipt has expired — send the photo again." });
      return;
    }

    const [, action, arg] = data.split(":");
    const items = session.receipt.items;

    if (action === "toggle") {
      const i = Number(arg);
      session.selected[i] = session.selected[i] > 0 ? 0 : items[i].qty;
    } else if (action === "inc") {
      const i = Number(arg);
      session.selected[i] = Math.min(session.selected[i] + 1, items[i].qty);
    } else if (action === "dec") {
      const i = Number(arg);
      session.selected[i] = Math.max(session.selected[i] - 1, 0);
    } else if (action === "all") {
      session.selected = items.map((it) => it.qty);
    } else if (action === "none") {
      session.selected = items.map(() => 0);
    } else if (action === "cancel") {
      pendingReceipts.delete(ctx.chat.id);
      await ctx.editMessageText("❌ Receipt discarded.");
      return ctx.answerCallbackQuery();
    } else if (action === "save") {
      const selCount = session.selected.reduce((s, q) => s + q, 0);
      if (!selCount) {
        return ctx.answerCallbackQuery({ text: "Select at least one item." });
      }
      // Move to category selection step
      const { receipt, selected } = session;
      const amount = splitAmount(receipt, selected);
      const categories = await listCategories();
      const guessed = guessCategory(
        receipt.items
          .map((it, i) => (selected[i] > 0 ? it.name : ""))
          .join(" ") + ` ${receipt.merchant || ""}`,
        categories,
      );
      const kb = new InlineKeyboard();
      categories.forEach((c, i) => {
        kb.text(
          `${c.name === guessed ? "⭐ " : ""}${c.icon} ${c.name}`,
          `rcpt:cat:${i}`,
        );
        if (i % 2 === 1) kb.row();
      });
      kb.row().text("‹ Back to items", "rcpt:back").text("❌ Cancel", "rcpt:cancel");
      session.categories = categories;
      await ctx.editMessageText(
        `Your share: ${fmt(amount)}\n\nPick a category:`,
        { reply_markup: kb },
      );
      return ctx.answerCallbackQuery();
    } else if (action === "back") {
      // return from category step to item selection
      await ctx.editMessageText(receiptText(session), {
        reply_markup: receiptKeyboard(session),
      });
      return ctx.answerCallbackQuery();
    } else if (action === "cat") {
      const { receipt, selected } = session;
      const selCount = selected.reduce((s, q) => s + q, 0);
      const categories = session.categories || (await listCategories());
      const category = categories[Number(arg)]?.name;
      if (!category) {
        return ctx.answerCallbackQuery({ text: "Unknown category." });
      }
      const amount = splitAmount(receipt, selected);
      const itemNames = receipt.items
        .map((it, i) =>
          selected[i] > 0
            ? `${it.name}${it.qty > 1 ? ` ×${selected[i]}` : ""}`
            : null,
        )
        .filter(Boolean)
        .join(", ");
      const note = `${receipt.merchant ? receipt.merchant + ": " : ""}${itemNames}`.slice(0, 200);
      try {
        const expense = await addExpense({
          amount,
          category,
          note,
          date: receipt.date || undefined,
          source: "telegram",
        });
        pendingReceipts.delete(ctx.chat.id);
        const icon =
          categories.find((c) => c.name === category)?.icon || "📦";
        const totalUnits = receipt.items.reduce((s, it) => s + it.qty, 0);
        await ctx.editMessageText(
          `✅ Recorded ${fmt(expense.amount)}\n${icon} ${category} — ${note}\n📅 ${expense.date}\n(${selCount}/${totalUnits} units + proportional fees)`,
        );
      } catch (err) {
        await ctx.answerCallbackQuery({ text: `⚠️ ${err.message}` });
        return;
      }
      return ctx.answerCallbackQuery({ text: "Saved!" });
    }

    // re-render selection
    await ctx.editMessageText(receiptText(session), {
      reply_markup: receiptKeyboard(session),
    });
    return ctx.answerCallbackQuery();
  });

  // Free-form expense entry
  bot.on("message:text", async (ctx) => {
    const categories = await listCategories();
    const parsed = parseExpenseMessage(ctx.message.text, categories);
    if (!parsed) {
      return ctx.reply(
        '🤔 I couldn\'t find an amount. Try e.g. "25000 lunch" or "food 25k nasi goreng".',
      );
    }
    const category = parsed.category || guessCategory(parsed.note, categories);
    try {
      const expense = await addExpense({
        ...parsed,
        category,
        source: "telegram",
      });
      const icon = categories.find((c) => c.name === category)?.icon || "📦";
      await ctx.reply(
        `✅ Recorded ${fmt(expense.amount)}\n${icon} ${category}${expense.note ? ` — ${expense.note}` : ""}\n📅 ${expense.date}`,
      );
    } catch (err) {
      await ctx.reply(`⚠️ ${err.message}`);
    }
  });

  return bot;
}
