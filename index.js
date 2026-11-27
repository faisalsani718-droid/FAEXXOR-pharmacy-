"use strict";
/**
 * FX PHARMARKET: OPay payments (Firebase Cloud Functions, 2nd gen, Node 20)
 *
 * Functions:
 *   startOpayPayment   (callable)  creates the OPay checkout and returns its URL
 *   verifyOpayPayment  (callable)  customer returns to the site; we ask OPay directly
 *   opayCallback       (HTTPS)     OPay's server-to-server notification
 *
 * Security rules this file follows:
 *   - OPay secret keys live in Firebase Secret Manager, never in the website.
 *   - An order becomes "paid" ONLY after OPay's own status API says SUCCESS and the
 *     reference, amount and currency (NGN) all match what WE stored. The callback
 *     body is never trusted: it only tells us which reference to re-check.
 *   - The amount is calculated here from your products collection, not taken from
 *     the browser.
 */
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret, defineString } = require("firebase-functions/params");
const admin = require("firebase-admin");
const crypto = require("crypto");

admin.initializeApp();
const db = admin.firestore();
const FV = admin.firestore.FieldValue;

/* ===================== MATCHES YOUR CURRENT SITE ===================== */
const CFG = {
  REGION: "us-central1",
  PRODUCTS: "products",              // your medicines collection
  OWNER_FIELD: "customerId",         // order field holding the customer's Firebase UID
  TOTAL_FIELD: "totalPrice",         // order total in NAIRA (delivery fee is added later by your team)
  OPAY_LABEL: "OPay",                // value saved in order.paymentMethod for OPay orders
  // true = refuse to start a payment if the order total does not match your product prices
  STRICT_PRICE_CHECK: true,
};
/* ====================================================================== */

const OPAY_MERCHANT_ID = defineSecret("OPAY_MERCHANT_ID");
const OPAY_PUBLIC_KEY = defineSecret("OPAY_PUBLIC_KEY");
const OPAY_SECRET_KEY = defineSecret("OPAY_SECRET_KEY");
const OPAY_MODE = defineString("OPAY_MODE", { default: "sandbox" });
const SITE_URL = defineString("SITE_URL", { default: "https://www.fxpharmarket.com.ng" });
const OPAY_CALLBACK_URL = defineString("OPAY_CALLBACK_URL", { default: "" });

const SECRETS = [OPAY_MERCHANT_ID, OPAY_PUBLIC_KEY, OPAY_SECRET_KEY];
const BASE = {
  live: "https://liveapi.opaycheckout.com/api/v1/international",
  sandbox: "https://testapi.opaycheckout.com/api/v1/international",
};

/* ----------------------------- helpers ----------------------------- */

/** Same price rule as checkout.html: supplier (wholesale) price applies from the minimum quantity. */
function unitKobo(p, qty) {
  const price = Number(p.price) || 0;
  const wp = Number(p.wholesalePrice) || 0;
  const minQty = Number.isInteger(p.wholesaleMinQty) ? p.wholesaleMinQty : 0;
  const tier = wp > 0 && wp <= price && minQty >= 2;
  return Math.round((tier && qty >= minQty ? wp : price) * 100);
}

/** Amount in kobo calculated from Firestore product prices. Order items are saved one entry per unit. */
async function expectedKobo(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  if (!items.length) throw new HttpsError("failed-precondition", "This order has no items.");
  if (items.length > 3000) throw new HttpsError("failed-precondition", "Too many items.");

  const counts = {};
  for (const it of items) {
    if (!it || typeof it.productId !== "string" || !it.productId) {
      throw new HttpsError("failed-precondition", "An order item has no product id.");
    }
    counts[it.productId] = (counts[it.productId] || 0) + 1;
  }
  const ids = Object.keys(counts);
  const snaps = await db.getAll(...ids.map((id) => db.collection(CFG.PRODUCTS).doc(id)));

  let kobo = 0;
  snaps.forEach((snap, i) => {
    const qty = counts[ids[i]];
    if (!snap.exists || snap.data().active !== true) {
      throw new HttpsError("failed-precondition", "A product in this order is no longer available.");
    }
    const unit = unitKobo(snap.data(), qty);
    if (!(unit > 0)) throw new HttpsError("failed-precondition", "Invalid product price.");
    kobo += unit * qty;
  });
  return kobo;
}

async function amountForOrder(order) {
  const claimed = Math.round(Number(order[CFG.TOTAL_FIELD]) * 100);
  if (!(claimed > 0)) throw new HttpsError("failed-precondition", "Invalid order total.");
  if (!CFG.STRICT_PRICE_CHECK) return claimed;
  const real = await expectedKobo(order);
  if (real !== claimed) {
    console.warn("PRICE_MISMATCH", { claimed, real });
    throw new HttpsError("failed-precondition", "Order total does not match current prices. Please place the order again.");
  }
  return real;
}

/** POST to OPay. signed=true uses HMAC-SHA512(body, secretKey) as the bearer token. */
async function opayPost(path, body, signed) {
  const raw = JSON.stringify(body);
  const bearer = signed
    ? crypto.createHmac("sha512", OPAY_SECRET_KEY.value()).update(raw).digest("hex")
    : OPAY_PUBLIC_KEY.value();
  const base = OPAY_MODE.value() === "live" ? BASE.live : BASE.sandbox;
  const res = await fetch(base + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + bearer,
      MerchantId: OPAY_MERCHANT_ID.value(),
    },
    body: raw,
  });
  return res.json().catch(() => ({}));
}

function newReference() {
  return "FXP" + Date.now().toString(36).toUpperCase() + crypto.randomBytes(4).toString("hex").toUpperCase();
}

async function loadOwnedOrder(req, orderId) {
  if (!req.auth) throw new HttpsError("unauthenticated", "Please log in.");
  if (typeof orderId !== "string" || !orderId || orderId.length > 100) {
    throw new HttpsError("invalid-argument", "Missing order id.");
  }
  const ref = db.collection("orders").doc(orderId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Order not found.");
  const order = snap.data();
  if (order[CFG.OWNER_FIELD] !== req.auth.uid) throw new HttpsError("permission-denied", "This is not your order.");
  return { ref, order };
}

/* ------------------------ start the payment ------------------------ */

exports.startOpayPayment = onCall({ region: CFG.REGION, secrets: SECRETS }, async (req) => {
  const { ref: orderRef, order } = await loadOwnedOrder(req, req.data && req.data.orderId);
  const orderId = orderRef.id;

  if (order.paymentMethod !== CFG.OPAY_LABEL) throw new HttpsError("failed-precondition", "This order is not an OPay order.");
  if (order.paymentStatus === "paid") throw new HttpsError("already-exists", "This order is already paid.");

  const callbackUrl = OPAY_CALLBACK_URL.value();
  if (!callbackUrl) throw new HttpsError("failed-precondition", "Payment is not fully configured yet.");

  const amountKobo = await amountForOrder(order);
  const reference = newReference();
  const site = SITE_URL.value().replace(/\/$/, "");

  // Save our record BEFORE talking to OPay, so a fast callback always finds it.
  const payRef = db.collection("payments").doc(reference);
  await payRef.set({
    reference, orderId, customerId: req.auth.uid, provider: "opay",
    amountKobo, currency: "NGN", status: "INITIATED",
    mode: OPAY_MODE.value(), createdAt: FV.serverTimestamp(),
  });
  await orderRef.update({
    paymentStatus: "pending",
    paymentVerified: false,
    "opay.reference": reference,
    "opay.status": "INITIATED",
    "opay.amountKobo": amountKobo,
    "opay.initiatedAt": FV.serverTimestamp(),
  });

  const body = {
    country: "NG",
    reference,
    amount: { total: amountKobo, currency: "NGN" },
    returnUrl: `${site}/payment-result.html?orderId=${encodeURIComponent(orderId)}`,
    cancelUrl: `${site}/payment-result.html?orderId=${encodeURIComponent(orderId)}&cancelled=1`,
    callbackUrl,
    expireAt: 30,
    userInfo: {
      userId: req.auth.uid,
      userName: String(order.customerName || order.name || "Customer").slice(0, 60),
      userMobile: String(order.phone || ""),
      userEmail: String(order.email || (req.auth.token && req.auth.token.email) || ""),
    },
    product: { name: "FX PHARMARKET order", description: "Order " + orderId },
  };

  let resp;
  try {
    resp = await opayPost("/cashier/create", body, false);
  } catch (e) {
    console.error("OPay create network error", e);
    await payRef.update({ status: "INIT_FAILED", note: "network error" });
    throw new HttpsError("unavailable", "Could not reach OPay. Please try again.");
  }
  if (resp.code !== "00000" || !resp.data || !resp.data.cashierUrl) {
    console.error("OPay create rejected", resp && resp.code, resp && resp.message);
    await payRef.update({ status: "INIT_FAILED", note: String((resp && resp.message) || "rejected").slice(0, 200) });
    throw new HttpsError("unavailable", "OPay could not start this payment. Please try again.");
  }

  await payRef.update({ status: "PENDING", opayOrderNo: resp.data.orderNo || null });
  return { cashierUrl: resp.data.cashierUrl, reference };
});

/* ------------------- verify (the ONLY place that marks paid) ------------------- */

async function verifyAndApply(reference) {
  const payRef = db.collection("payments").doc(reference);
  const paySnap = await payRef.get();
  if (!paySnap.exists) throw new HttpsError("not-found", "Unknown payment reference.");
  const pay = paySnap.data();

  // Ask OPay directly. This is an authenticated server-to-server call.
  const resp = await opayPost("/cashier/status", { reference, country: "NG" }, true);
  const d = (resp && resp.data) || {};
  const providerStatus = String(d.status || "").toUpperCase();
  const total = Number(d.amount && d.amount.total !== undefined ? d.amount.total : d.amount);
  const currency = (d.amount && d.amount.currency) || d.currency;

  const apiOk = resp && resp.code === "00000";
  const success = apiOk && providerStatus === "SUCCESS";
  const exact = success
    && String(d.reference) === reference
    && total === pay.amountKobo
    && currency === "NGN";

  const orderRef = db.collection("orders").doc(pay.orderId);
  const logRef = db.collection("paymentLogs").doc();

  return db.runTransaction(async (tx) => {
    const [oSnap, pSnap] = await Promise.all([tx.get(orderRef), tx.get(payRef)]);
    if (!oSnap.exists) throw new HttpsError("not-found", "Order not found.");
    const order = oSnap.data();
    const p = pSnap.data();
    const log = (event, extra) =>
      tx.set(logRef, Object.assign({ reference, orderId: pay.orderId, event, at: FV.serverTimestamp() }, extra || {}));

    // Already finished: never confirm twice.
    if (p.status === "SUCCESS") return { paymentStatus: "paid", already: true };

    if (exact) {
      if (order.paymentStatus === "paid") {
        // The order was already paid by another attempt: flag for a refund.
        tx.update(payRef, { status: "DUPLICATE_SUCCESS", needsRefund: true, verifiedAt: FV.serverTimestamp() });
        log("duplicate_success_needs_refund");
        return { paymentStatus: "paid", already: true };
      }
      tx.update(orderRef, {
        paymentStatus: "paid",
        paymentVerified: true,
        paidAt: FV.serverTimestamp(),
        "opay.status": "SUCCESS",
        "opay.reference": reference,
        "opay.orderNo": d.orderNo || null,
      });
      tx.update(payRef, { status: "SUCCESS", verifiedAt: FV.serverTimestamp() });
      log("paid_verified");
      return { paymentStatus: "paid" };
    }

    if (success && !exact) {
      // OPay says success but amount/currency/reference differ from ours: do NOT mark paid.
      tx.update(payRef, { status: "MISMATCH", needsReview: true, verifiedAt: FV.serverTimestamp() });
      log("mismatch_needs_review", { providerAmount: total, expected: pay.amountKobo });
      return { paymentStatus: "review" };
    }

    if (apiOk && (providerStatus === "FAIL" || providerStatus === "CLOSE")) {
      const next = providerStatus === "FAIL" ? "failed" : "cancelled";
      tx.update(payRef, { status: providerStatus, verifiedAt: FV.serverTimestamp() });
      if (order.paymentStatus !== "paid" && order.opay && order.opay.reference === reference) {
        tx.update(orderRef, { paymentStatus: next, paymentVerified: false, "opay.status": providerStatus });
      }
      log("payment_" + next);
      return { paymentStatus: next };
    }

    // Still pending (or OPay unreachable): change nothing.
    tx.update(payRef, { lastCheckedAt: FV.serverTimestamp() });
    return { paymentStatus: "pending" };
  });
}

exports.verifyOpayPayment = onCall({ region: CFG.REGION, secrets: SECRETS }, async (req) => {
  const { order } = await loadOwnedOrder(req, req.data && req.data.orderId);
  if (order.paymentStatus === "paid") return { paymentStatus: "paid" };
  const reference = order.opay && order.opay.reference;
  if (!reference) return { paymentStatus: "not_started" };
  return verifyAndApply(reference);
});

/* ----------------------- OPay server notification ----------------------- */

exports.opayCallback = onRequest({ region: CFG.REGION, secrets: SECRETS }, async (req, res) => {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");
  // We do not trust the body. We only read the reference, then ask OPay ourselves.
  const body = req.body || {};
  const reference = (body.payload && body.payload.reference) || body.reference;
  if (typeof reference !== "string" || !/^[A-Z0-9]{8,64}$/.test(reference)) {
    return res.status(400).json({ code: "40000", message: "bad reference" });
  }
  try {
    await verifyAndApply(reference);
    return res.status(200).json({ code: "00000", message: "SUCCESSFUL" });
  } catch (e) {
    if (e instanceof HttpsError && e.code === "not-found") return res.status(404).json({ message: "unknown" });
    console.error("callback error", e);
    return res.status(500).json({ message: "retry later" }); // OPay will retry
  }
});
