# Catatan Keuangan — Expense Tracker

Personal expense tracker with:

- 📱 **Mobile app** (Expo / React Native) — interactive dashboard, expense list, custom categories
- 🤖 **Telegram bot** — record expenses by chatting (e.g. `25000 lunch`)
- 📊 **Google Sheets** as storage — your data lives in a spreadsheet you own

```
app/      Expo mobile app
server/   Node.js API + Telegram bot (Google Sheets backend)
```

## Overview

**Catatan Keuangan** is a personal finance app for tracking daily expenses without
the friction of spreadsheets or heavyweight finance apps. It is built around three
parts that share one Google Sheet as the single source of truth, so you always own
your data.

**What it does**

- **Log expenses anywhere** — add them in the mobile app, or just message the
  Telegram bot (e.g. `25000 lunch`, `food 25k nasi goreng`) without opening the app.
- **Scan receipts** — snap or upload a photo of a bill and an AI vision model
  (Google Gemini) extracts each item, price, service fee, and tax. You can then
  split the bill and pick only the items you paid for, in the app or via Telegram.
- **Interactive dashboard** — donut and bar charts with a range switcher
  (7 days / 30 days / this month); tap a slice or bar to drill into a category or day.
- **Custom categories** — create your own categories with icons and colors.
- **Fast, paginated history** — the expense list loads in pages with infinite scroll
  and a smooth loading animation, so thousands of transactions stay snappy.
- **Over-the-air updates** — JS/TS changes ship instantly to installed apps via
  EAS Update, with no Play Store or reinstall needed.

**How it fits together**

- **Mobile app** (Expo / React Native, TypeScript) — the main UI: dashboard,
  expense list, categories, settings, and the receipt scanner.
- **Backend** (Node.js + Express) — a small API secured with an API key, plus the
  Telegram bot (grammY) and the Gemini receipt parser, all reading/writing the sheet.
- **Storage** (Google Sheets) — two tabs, `Expenses` and `Categories`, that you own
  and can open or edit by hand at any time.

**Tech stack:** Expo / React Native, Node.js, Express, grammY (Telegram),
Google Sheets API, Google Gemini, EAS Build & EAS Update.

## 1. Google Sheets setup

1. Create a new Google Spreadsheet and copy its ID from the URL:
   `https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit`
2. Go to [Google Cloud Console](https://console.cloud.google.com/) → create a project (free, no billing needed).
3. Enable the **Google Sheets API** (APIs & Services → Library).
4. Create a **Service Account** (APIs & Services → Credentials → Create Credentials → Service account).
5. Open the service account → Keys → Add key → **JSON**. Save the downloaded file as `server/service-account.json`.
6. **Share the spreadsheet** with the service account's email (`xxx@yyy.iam.gserviceaccount.com`) as **Editor**.

The server creates the `Expenses` and `Categories` tabs (with default categories) automatically on first start.

## 2. Telegram bot setup

1. Chat with [@BotFather](https://t.me/BotFather) → `/newbot` → follow prompts → copy the **bot token**.
2. Chat with [@userinfobot](https://t.me/userinfobot) to get your **Telegram user ID** (so only you can use the bot).

## 3. Run the server

```powershell
cd server
copy .env.example .env
# Edit .env: fill SPREADSHEET_ID, TELEGRAM_BOT_TOKEN, ALLOWED_TELEGRAM_IDS, API_KEY
npm install
npm start
```

You should see:

```
✅ Google Sheets ready
✅ API listening on http://localhost:3000
✅ Telegram bot polling
```

> To use the app outside your home network, deploy the server to a free host
> (Railway, Render, Fly.io) or expose it with a tunnel (e.g. `cloudflared`, `ngrok`).

## 4. Run the mobile app

```powershell
cd app
npm install
npm start
```

Scan the QR code with the **Expo Go** app on your phone.

Then in the app: **Settings tab** → enter the Server URL (your PC's LAN IP, e.g. `http://192.168.1.10:3000`) and the same `API_KEY` from the server `.env` → **Test connection** → **Save**.

## 5. Build & update the Android app

Run everything from the `app/` folder.

```powershell
cd app
npx eas-cli login        # one-time, sign in to your Expo account
```

### Build an installable APK

```powershell
npx eas-cli build --platform android --profile preview
```

- The `preview` profile produces a `.apk` (configured in `app/eas.json`).
- When it finishes, the terminal prints an install link + QR code — open it on the phone to install.
- Check status / get the link later:

```powershell
npx eas-cli build:list --platform android --limit 5
```

### Push an over-the-air (OTA) update — no rebuild needed

```powershell
npx eas-cli update --branch preview --message "what changed"
```

- Installed apps pull the update automatically on next launch (`expo-updates` is enabled).
- Use this whenever you only changed **JS/TS code**.

### When to rebuild the APK vs. OTA update

| Change                                 | Command                                                  |
| -------------------------------------- | -------------------------------------------------------- |
| JS/TS code (screens, logic, styles)    | `npx eas-cli update --branch preview -m "..."`           |
| Icon, splash, native library, SDK bump | `npx eas-cli build --platform android --profile preview` |

## Using the Telegram bot

| Message                   | Result                                                       |
| ------------------------- | ------------------------------------------------------------ |
| `25000 lunch`             | Rp 25.000, category auto-guessed (Food)                      |
| `food 25k nasi goreng`    | Explicit category, `k`/`rb` = thousands, `m`/`jt` = millions |
| `/today` `/week` `/month` | Spending summaries                                           |
| `/categories`             | List categories                                              |
| `/addcategory Travel ✈️`  | Add a custom category                                        |

## Dashboard features

- Range switcher: 7 days / 30 days / this month
- **Tap a donut slice** to filter the whole dashboard by that category
- **Tap a bar** to see the exact daily total
- Pull to refresh — bot entries appear automatically (marked 🤖)
- Long-press an expense or category to delete it
