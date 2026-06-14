/**
 * Receipt scanning via the Gemini API.
 * Takes an image (base64) and returns structured receipt data:
 * { merchant, date, items: [{ name, qty, price }], serviceFee, tax, discount, total }
 * Handles Indonesian and English receipts.
 */

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const PROMPT = `You are a receipt parser. Extract data from this receipt photo (it may be in Indonesian or English).

Return ONLY valid JSON with this exact shape:
{
  "merchant": "store name or null",
  "date": "YYYY-MM-DD or null (receipt date; Indonesian receipts often use DD/MM/YYYY)",
  "items": [{ "name": "item name", "qty": 1, "price": 8000 }],
  "serviceFee": 0,
  "tax": 0,
  "discount": 0,
  "total": 8000
}

Rules:
- "price" is the TOTAL price for that line (qty already multiplied), as a plain number in the receipt's currency (usually IDR).
- Do not include subtotal/total/payment/change lines as items.
- "tax" = PPN / PB1 / VAT / tax amount ONLY if it is ADDED ON TOP of the item prices (i.e. items subtotal + tax = total). If the receipt says prices already include tax (e.g. "Harga sudah termasuk pajak", "termasuk PPN", "prices include tax/VAT") or the tax shown is merely informational (items already sum to the total), set tax to 0. If no tax line is printed at all, tax is 0 — never estimate or compute it yourself.
- "serviceFee" = service charge / biaya layanan / delivery fee ONLY if printed on the receipt and added on top, else 0.
- "discount" = total discounts/promo as a POSITIVE number, else 0.
- "total" = the final amount paid.
- Sanity check: items subtotal + serviceFee + tax - discount should equal total. If it doesn't because tax/fee is already inside the prices, set that field to 0.
- If a value is unreadable, use null (strings) or 0 (numbers).`;

export async function scanReceipt(imageBase64, mimeType = "image/jpeg") {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw Object.assign(new Error("GEMINI_API_KEY not set on the server"), {
      status: 503,
    });
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: PROMPT },
              { inline_data: { mime_type: mimeType, data: imageBase64 } },
            ],
          },
        ],
        generationConfig: {
          response_mime_type: "application/json",
          temperature: 0,
          // 2.5 models "think" by default which adds 5-15s — not needed for OCR
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    console.error("Gemini error:", res.status, body.slice(0, 500));
    throw Object.assign(
      new Error(`Receipt scan failed (Gemini ${res.status})`),
      { status: 502 },
    );
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw Object.assign(new Error("Gemini returned no result"), {
      status: 502,
    });
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw Object.assign(new Error("Could not parse receipt data"), {
      status: 502,
    });
  }

  // Normalize
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const items = (Array.isArray(parsed.items) ? parsed.items : [])
    .map((it) => ({
      name: String(it.name || "Item").slice(0, 80),
      qty: num(it.qty) || 1,
      price: num(it.price),
    }))
    .filter((it) => it.price > 0);

  if (!items.length) {
    throw Object.assign(
      new Error("No items detected on the receipt — try a clearer photo"),
      { status: 422 },
    );
  }

  const result = {
    merchant: parsed.merchant || null,
    date: /^\d{4}-\d{2}-\d{2}$/.test(parsed.date || "") ? parsed.date : null,
    items,
    serviceFee: num(parsed.serviceFee),
    tax: num(parsed.tax),
    discount: num(parsed.discount),
    total: num(parsed.total),
  };

  // Guard against double-counting: if the items alone already add up to the
  // total paid, any tax/fee shown was informational (already included).
  const itemsSubtotal = items.reduce((s, it) => s + it.price, 0);
  if (
    result.total > 0 &&
    Math.abs(itemsSubtotal - result.discount - result.total) <= 1
  ) {
    result.serviceFee = 0;
    result.tax = 0;
  }

  return result;
}

/**
 * Compute the amount owed for a selection of items, sharing fees/tax/discount
 * proportionally to the selected subtotal.
 * `selectedQty` is an array aligned with receipt.items: how many units of each
 * line belong to the user (0..qty).
 */
export function splitAmount(receipt, selectedQty) {
  const itemsSubtotal = receipt.items.reduce((s, it) => s + it.price, 0) || 1;
  const selectedSubtotal = receipt.items.reduce((s, it, i) => {
    const sel = Math.min(selectedQty[i] || 0, it.qty);
    return s + (it.price / it.qty) * sel;
  }, 0);
  const share = selectedSubtotal / itemsSubtotal;
  const fees = receipt.serviceFee + receipt.tax - receipt.discount;
  return Math.round(selectedSubtotal + share * fees);
}
