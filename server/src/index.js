import "dotenv/config";
import express from "express";
import {
  ensureSheetsSetup,
  listExpenses,
  addExpense,
  updateExpense,
  deleteExpense,
  listCategories,
  addCategory,
  deleteCategory,
} from "./sheets.js";
import { createBot } from "./bot.js";
import { webhookCallback } from "grammy";
import { scanReceipt } from "./vision.js";

const app = express();
app.use(express.json({ limit: "15mb" }));

// --- CORS (needed for the web build of the app) ---
app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

// --- API key auth ---
app.use((req, res, next) => {
  if (req.path === "/health") return next();
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!process.env.API_KEY || token !== process.env.API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
});

const wrap = (fn) => (req, res) =>
  fn(req, res).catch((err) =>
    res.status(err.status || 500).json({ error: err.message }),
  );

app.get("/health", (_req, res) => res.json({ ok: true }));

// --- Expenses ---
app.get(
  "/expenses",
  wrap(async (req, res) => {
    const { from, to } = req.query;
    res.json(await listExpenses({ from, to }));
  }),
);

app.post(
  "/expenses",
  wrap(async (req, res) => {
    const expense = await addExpense({
      ...req.body,
      source: req.body.source || "app",
    });
    res.status(201).json(expense);
  }),
);

app.put(
  "/expenses/:id",
  wrap(async (req, res) => {
    res.json(await updateExpense(req.params.id, req.body));
  }),
);

app.delete(
  "/expenses/:id",
  wrap(async (req, res) => {
    await deleteExpense(req.params.id);
    res.status(204).end();
  }),
);

// --- Categories ---
app.get(
  "/categories",
  wrap(async (_req, res) => {
    res.json(await listCategories());
  }),
);

app.post(
  "/categories",
  wrap(async (req, res) => {
    res.status(201).json(await addCategory(req.body));
  }),
);

app.delete(
  "/categories/:name",
  wrap(async (req, res) => {
    await deleteCategory(req.params.name);
    res.status(204).end();
  }),
);

// --- Receipt scanning ---
app.post(
  "/receipts/scan",
  wrap(async (req, res) => {
    const { image, mimeType } = req.body;
    if (!image) {
      return res.status(400).json({ error: "image (base64) is required" });
    }
    res.json(await scanReceipt(image, mimeType || "image/jpeg"));
  }),
);

// --- Boot ---
const port = process.env.PORT || 3000;

async function main() {
  await ensureSheetsSetup();
  console.log("✅ Google Sheets ready");

  let bot = null;
  if (process.env.TELEGRAM_BOT_TOKEN) {
    bot = createBot();
    bot.catch((err) => {
      console.error("⚠️ Bot error:", err.message);
    });
  } else {
    console.warn("⚠️ TELEGRAM_BOT_TOKEN not set — bot disabled");
  }

  // WEBHOOK_URL (e.g. https://my-app.up.railway.app) switches the bot from
  // polling to webhooks — required on hosts that sleep when idle.
  const webhookUrl = process.env.WEBHOOK_URL;
  if (bot && webhookUrl) {
    const path = `/telegram/${process.env.TELEGRAM_BOT_TOKEN.split(":")[0]}`;
    app.post(path, webhookCallback(bot, "express"));
    await bot.api.setWebhook(`${webhookUrl.replace(/\/$/, "")}${path}`, {
      allowed_updates: ["message", "callback_query"],
    });
    console.log("✅ Telegram bot webhook registered");
  }

  app.listen(port, () =>
    console.log(`✅ API listening on http://localhost:${port}`),
  );

  if (bot && !webhookUrl) {
    // Local development: long polling
    await bot.api.deleteWebhook().catch(() => {});
    const startPolling = () => {
      bot
        .start({
          drop_pending_updates: false,
          allowed_updates: ["message", "callback_query"],
          onStart: () => console.log("✅ Telegram bot polling"),
        })
        .catch((err) => {
          console.error("⚠️ Bot polling stopped:", err.message);
          console.log("↻ Restarting polling in 5s…");
          setTimeout(startPolling, 5000);
        });
    };
    startPolling();
  }
}

main().catch((err) => {
  console.error("Fatal startup error:", err.message);
  process.exit(1);
});
