// @ts-nocheck
// FAEXXOR Pharmacy - Admin: Medicines page (add, edit, stock, remove / put back)
// Needs <div id="productsAdmin"></div> in admin-dashboard.html.
// Does not touch admin-dashboard.js (orders) or admin-prescriptions.js.
// Field names and limits match the "products" and "settings/inventory" Firestore rules.
(function () {
  "use strict";

  var host = document.getElementById("productsAdmin");
  if (!host) return;
  if (typeof firebase === "undefined" || !firebase.firestore || !firebase.auth) {
    host.textContent = "Firebase did not load. The Medicines page is unavailable.";
    return;
  }

  var fdb = firebase.firestore();
  var TS = firebase.firestore.FieldValue.serverTimestamp;
  var DEL = firebase.firestore.FieldValue.delete;

  // Same pattern as the Firestore rule (lowercase extensions only)
  var IMG_RE = /^images\/[A-Za-z0-9._ -]+\.(jpg|jpeg|png|webp)$/;
  var OPTIONAL = ["variantLabel", "manufacturer", "strength", "dosageForm", "description",
    "genericName", "packSize", "nafdacNumber", "expiryDate", "directions", "warnings", "storage"];
  var KNOWN_CATS = ["Tablets (tins)", "Tablets", "Capsules", "Syrups", "Suspensions", "Injections & Infusions",
    "Medical Supplies", "Creams", "Ointments", "Drops", "Antiseptics & Liquids", "Consumables", "ORS & Powders"];

  var products = [];
  var threshold = 5;
  var editingId = null;
  var filterKey = "all";
  var started = false;
  var unsubProducts = null, unsubSettings = null, toastTimer = null;
  var ui = {}; // screen elements
  var F = {};  // form inputs

  /* ---------- helpers ---------- */
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function naira(n) { return "\u20A6" + Number(n || 0).toLocaleString(); }
  function button(label, cls, fn) {
    var b = el("button", "fxp-btn " + (cls || ""), label);
    b.type = "button";
    b.addEventListener("click", fn);
    return b;
  }
  function input(type, placeholder) {
    var i = el("input", "fxp-in");
    i.type = type;
    if (placeholder) i.placeholder = placeholder;
    return i;
  }
  function say(text, ok) {
    if (!ui.toast) return;
    ui.toast.hidden = false;
    ui.toast.textContent = text;
    ui.toast.className = "fxp-toast " + (ok ? "ok" : "bad");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { ui.toast.hidden = true; }, ok ? 3500 : 9000);
  }
  function explain(e) {
    console.error("Product error:", e);
    if (e && e.code === "permission-denied") {
      return "Not allowed (permission-denied). Check you are logged in as admin and the products rules are published.";
    }
    return "Could not complete this. " + ((e && (e.code || e.message)) || "");
  }
  function stockState(p) {
    var q = Number(p.stockQuantity) || 0;
    if (q <= 0) return "out";
    return q <= threshold ? "low" : "in";
  }
  var STATE_LABEL = { in: "In Stock", low: "Low Stock", out: "Out of Stock" };
  function fullName(p) { return p.name + (p.variantLabel ? " (" + p.variantLabel + ")" : ""); }

  /* ---------- styles (only classes starting with fxp-) ---------- */
  function addStyles() {
    if (document.getElementById("fxpStyles")) return;
    var s = el("style");
    s.id = "fxpStyles";
    s.textContent =
      ".fxp-in{width:100%;padding:11px 12px;border:1px solid #c9d6e6;border-radius:10px;font-size:1rem;margin-top:4px;font-family:inherit;background:#fff}" +
      ".fxp-in:focus{outline:2px solid #04a0e0;border-color:#04a0e0}" +
      ".fxp-lab{display:block;margin-top:12px;font-size:.86rem;font-weight:700;color:#33475b}" +
      ".fxp-btn{border:0;border-radius:10px;padding:11px 14px;font-weight:700;cursor:pointer;background:#e6eef9;color:#0b4a9e;font-size:.92rem;font-family:inherit}" +
      ".fxp-btn.main{background:#0b4a9e;color:#fff}.fxp-btn.green{background:#1f9d55;color:#fff}.fxp-btn.red{background:#fbe6e8;color:#a12a35}.fxp-btn.amber{background:#fdf0e5;color:#b25a12}" +
      ".fxp-btn:disabled{opacity:.45;cursor:not-allowed}" +
      ".fxp-search{margin:0 0 10px;padding:13px 14px;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.06);border:0}" +
      ".fxp-chips{display:flex;gap:8px;overflow-x:auto;padding:2px 0 10px;-webkit-overflow-scrolling:touch}" +
      ".fxp-chip{flex:none;border:1px solid #cfd9e6;background:#fff;color:#33475b;border-radius:999px;padding:9px 14px;font-weight:700;font-size:.86rem;cursor:pointer;font-family:inherit}" +
      ".fxp-chip.on{background:#0b4a9e;border-color:#0b4a9e;color:#fff}.fxp-chip small{opacity:.8;margin-left:5px;font-size:.8rem}" +
      ".fxp-hint{font-size:.86rem;color:#55677a;margin:4px 0}" +
      ".fxp-empty{background:#fff;border-radius:14px;padding:24px 18px;text-align:center;color:#55677a;box-shadow:0 2px 8px rgba(0,0,0,.05)}" +
      ".fxp-grid{display:grid;grid-template-columns:1fr;gap:12px}" +
      "@media(min-width:760px){.fxp-grid{grid-template-columns:1fr 1fr}}" +
      ".fxp-card{background:#fff;border-radius:14px;padding:12px;box-shadow:0 2px 8px rgba(0,0,0,.08)}" +
      ".fxp-card.removed{background:#f4f6f9;border:1px dashed #9aa9ba}" +
      ".fxp-top{display:flex;gap:12px;align-items:flex-start}" +
      ".fxp-thumb{width:58px;height:58px;border-radius:10px;object-fit:cover;background:#eef2f7;flex:none}" +
      ".fxp-noimg{width:58px;height:58px;border-radius:10px;background:#eef2f7;color:#7a8a9c;font-size:.68rem;display:grid;place-items:center;text-align:center;flex:none}" +
      ".fxp-card h3{margin:0 0 4px;font-size:1rem;word-break:break-word}" +
      ".fxp-card p{margin:2px 0;font-size:.88rem;color:#44546a}" +
      ".fxp-badge{display:inline-block;border-radius:999px;padding:3px 10px;font-size:.76rem;font-weight:700;margin-right:6px}" +
      ".fxp-badge.in{background:#e3f6ea;color:#1b6b3d}.fxp-badge.low{background:#fdf0e5;color:#b25a12}.fxp-badge.out{background:#fbe6e8;color:#a12a35}.fxp-badge.arch{background:#e4e8ee;color:#44546a}" +
      ".fxp-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:10px}" +
      ".fxp-stepper{display:flex;align-items:center;gap:6px}" +
      ".fxp-stepper .fxp-in{width:74px;text-align:center;margin:0;padding:9px 6px}" +
      ".fxp-step{width:40px;height:40px;border-radius:10px;border:0;background:#e6eef9;color:#0b4a9e;font-size:1.35rem;font-weight:800;cursor:pointer;line-height:1}" +
      ".fxp-set{background:#fff;border-radius:12px;padding:12px 14px;margin-top:16px;box-shadow:0 2px 8px rgba(0,0,0,.06)}" +
      ".fxp-set summary{cursor:pointer;font-weight:700;color:#0b4a9e}" +
      ".fxp-fab{position:fixed;right:16px;bottom:calc(84px + env(safe-area-inset-bottom,0px));z-index:50;border:0;border-radius:999px;padding:15px 20px;background:#1f9d55;color:#fff;font-weight:800;font-size:1rem;box-shadow:0 6px 18px rgba(0,0,0,.25);cursor:pointer;font-family:inherit}" +
      "@media(min-width:760px){.fxp-fab{bottom:24px}}" +
      ".fxp-modal{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(15,30,50,.55);z-index:1000;display:flex;align-items:flex-end;justify-content:center}" +
      ".fxp-modal[hidden]{display:none}" +
      ".fxp-sheet{background:#fff;width:100%;max-width:560px;max-height:93vh;overflow-y:auto;border-radius:20px 20px 0 0;padding:16px 16px calc(22px + env(safe-area-inset-bottom,0px))}" +
      "@media(min-width:760px){.fxp-modal{align-items:center}.fxp-sheet{border-radius:20px}}" +
      ".fxp-sheethead{display:flex;justify-content:space-between;align-items:center}" +
      ".fxp-sheethead h3{margin:0;font-size:1.15rem;color:#0b4a9e}" +
      ".fxp-x{border:0;background:#eef2f7;border-radius:50%;width:38px;height:38px;font-size:1.1rem;cursor:pointer}" +
      ".fxp-two{display:grid;grid-template-columns:1fr 1fr;gap:10px}" +
      ".fxp-prev{max-width:120px;max-height:120px;border-radius:10px;margin-top:6px;display:none}" +
      ".fxp-formmsg{background:#fbe6e8;color:#a12a35;border-radius:10px;padding:10px 12px;margin:12px 0 0;font-size:.9rem;white-space:pre-line}" +
      ".fxp-toast{position:fixed;top:12px;left:50%;transform:translateX(-50%);max-width:92vw;z-index:3000;padding:12px 16px;border-radius:12px;font-weight:700;font-size:.92rem;box-shadow:0 6px 20px rgba(0,0,0,.25)}" +
      ".fxp-toast[hidden]{display:none}.fxp-toast.ok{background:#1b6b3d;color:#fff}.fxp-toast.bad{background:#a12a35;color:#fff}";
    document.head.appendChild(s);
  }

  /* ---------- screen ---------- */
  function build() {
    host.innerHTML = "";
    addStyles();

    ui.toast = el("div", "fxp-toast");
    ui.toast.hidden = true;
    ui.toast.setAttribute("role", "status");
    document.body.appendChild(ui.toast);

    ui.search = el("input", "fxp-in fxp-search");
    ui.search.type = "search";
    ui.search.placeholder = "Search medicines by name...";
    ui.search.addEventListener("input", renderList);
    host.appendChild(ui.search);

    ui.chips = el("div", "fxp-chips");
    host.appendChild(ui.chips);

    ui.list = el("div", "fxp-grid");
    host.appendChild(ui.list);

    // low-stock level
    var det = el("details", "fxp-set");
    ui.thSum = el("summary", null, "Low-stock alert level: " + threshold);
    det.appendChild(ui.thSum);
    det.appendChild(el("p", "fxp-hint", "A medicine shows as Low Stock when its quantity is this number or less. Zero is always Out of Stock."));
    var tr = el("div", "fxp-row");
    ui.th = input("number");
    ui.th.min = "0"; ui.th.step = "1"; ui.th.value = threshold;
    ui.th.style.width = "110px"; ui.th.style.margin = "0";
    tr.appendChild(ui.th);
    tr.appendChild(button("Save level", "main", saveThreshold));
    det.appendChild(tr);
    host.appendChild(det);

    ui.fab = el("button", "fxp-fab", "+ Add medicine");
    ui.fab.type = "button";
    ui.fab.addEventListener("click", function () { openForm(null); });
    host.appendChild(ui.fab);

    buildForm();

    ui.cats = el("datalist");
    ui.cats.id = "fxpCats";
    host.appendChild(ui.cats);
  }

  function field(parent, k, label, type, extra) {
    var wrap = el("div");
    wrap.appendChild(el("label", "fxp-lab", label));
    var i;
    if (type === "textarea") { i = el("textarea", "fxp-in"); i.rows = 3; }
    else { i = input(type); }
    if (extra) Object.keys(extra).forEach(function (a) { i.setAttribute(a, extra[a]); });
    F[k] = i;
    wrap.appendChild(i);
    parent.appendChild(wrap);
    return i;
  }

  function buildForm() {
    ui.modal = el("div", "fxp-modal");
    ui.modal.hidden = true;
    var sheet = el("div", "fxp-sheet");
    ui.modal.appendChild(sheet);

    var head = el("div", "fxp-sheethead");
    ui.formTitle = el("h3", null, "Add medicine");
    head.appendChild(ui.formTitle);
    var x = el("button", "fxp-x", "\u2715");
    x.type = "button";
    x.setAttribute("aria-label", "Close");
    x.addEventListener("click", closeForm);
    head.appendChild(x);
    sheet.appendChild(head);

    field(sheet, "name", "Medicine name *", "text", { maxlength: 120 });
    field(sheet, "variantLabel", "Size / option (optional, e.g. Big or Small)", "text", { maxlength: 60 });
    field(sheet, "category", "Category *", "text", { maxlength: 60, list: "fxpCats" });

    var two = el("div", "fxp-two");
    field(two, "price", "Selling price (\u20A6) *", "number", { min: "0", step: "any", inputmode: "decimal" });
    field(two, "stockQuantity", "Stock quantity *", "number", { min: "0", step: "1", inputmode: "numeric" });
    sheet.appendChild(two);
    var two3 = el("div", "fxp-two");
field(two3, "wholesalePrice", "Supplier price per piece (\u20A6)", "number", { min: "0", step: "any", inputmode: "decimal" });
field(two3, "wholesaleMinQty", "Supplier minimum qty", "number", { min: "2", step: "1", inputmode: "numeric" });
sheet.appendChild(two3);

    field(sheet, "image", "Image path * (example: images/paracetamol.jpg)", "text", { maxlength: 150, autocapitalize: "none" });
    ui.imgNote = el("p", "fxp-hint");
    sheet.appendChild(ui.imgNote);
    ui.prev = el("img", "fxp-prev");
    ui.prev.alt = "Image preview";
    sheet.appendChild(ui.prev);
    F.image.addEventListener("change", checkImage);

    field(sheet, "manufacturer", "Manufacturer", "text", { maxlength: 100 });
    var two2 = el("div", "fxp-two");
    field(two2, "strength", "Strength (e.g. 500 mg)", "text", { maxlength: 60 });
    field(two2, "dosageForm", "Form (e.g. Tablet)", "text", { maxlength: 60 });
    sheet.appendChild(two2);
    field(sheet, "description", "Description (what it is used for)", "textarea", { maxlength: 1000 });
    field(sheet, "genericName", "Generic name (e.g. Paracetamol)", "text", { maxlength: 120 });
    var two4 = el("div", "fxp-two");
    field(two4, "packSize", "Pack size (e.g. 10x10)", "text", { maxlength: 60 });
    field(two4, "nafdacNumber", "NAFDAC number", "text", { maxlength: 40 });
    sheet.appendChild(two4);
    field(sheet, "expiryDate", "Expiry date", "date");
    sheet.appendChild(el("label", "fxp-lab", "Prescription required?"));
    F.prescriptionRequired = el("select", "fxp-in");
    [["", "Not set"], ["true", "Yes - prescription only"], ["false", "No - over the counter"]].forEach(function (o) {
      var op = el("option", null, o[1]); op.value = o[0]; F.prescriptionRequired.appendChild(op);
    });
    sheet.appendChild(F.prescriptionRequired);
    field(sheet, "directions", "Directions (follow the leaflet)", "textarea", { maxlength: 1000 });
    field(sheet, "warnings", "Warnings and side effects", "textarea", { maxlength: 1000 });
    field(sheet, "storage", "Storage (e.g. Store below 30\u00B0C)", "text", { maxlength: 300 });

    sheet.appendChild(el("label", "fxp-lab", "Show on the website?"));
    F.active = el("select", "fxp-in");
    [["true", "Yes - available to customers"], ["false", "No - removed (hidden from customers)"]].forEach(function (o) {
      var op = el("option", null, o[1]);
      op.value = o[0];
      F.active.appendChild(op);
    });
    sheet.appendChild(F.active);

    ui.formMsg = el("p", "fxp-formmsg");
    ui.formMsg.hidden = true;
    sheet.appendChild(ui.formMsg);

    var r = el("div", "fxp-row");
    ui.saveBtn = button("Save medicine", "main", saveProduct);
    ui.saveBtn.style.flex = "1";
    r.appendChild(ui.saveBtn);
    r.appendChild(button("Cancel", "", closeForm));
    sheet.appendChild(r);

    host.appendChild(ui.modal);
  }

  function checkImage() {
    var path = F.image.value.trim();
    ui.prev.style.display = "none";
    if (!path) { ui.imgNote.textContent = ""; return; }
    if (!IMG_RE.test(path)) {
      ui.imgNote.textContent = "Path format is not valid. Example: images/paracetamol.jpg (lowercase extension).";
      return;
    }
    ui.imgNote.textContent = "Checking image...";
    var probe = new Image();
    probe.onload = function () {
      ui.imgNote.textContent = "Image found on the website.";
      ui.prev.src = path;
      ui.prev.style.display = "block";
    };
    probe.onerror = function () {
      ui.imgNote.textContent = "Image not found on the live website yet. Add the file to the images folder and deploy it before customers will see it.";
    };
    probe.src = path;
  }

  function openForm(p) {
    editingId = p ? p.id : null;
    ui.formTitle.textContent = p ? "Edit medicine" : "Add medicine";
    ui.formMsg.hidden = true;
    ["name", "variantLabel", "manufacturer", "strength", "dosageForm", "category", "price", "stockQuantity", "wholesalePrice", "wholesaleMinQty", "image", "description",
      "genericName", "packSize", "nafdacNumber", "expiryDate", "directions", "warnings", "storage"]
      .forEach(function (k) { F[k].value = p && typeof p[k] === "string" ? p[k] : (p && typeof p[k] === "number" ? p[k] : ""); });
    F.prescriptionRequired.value = p && typeof p.prescriptionRequired === "boolean" ? String(p.prescriptionRequired) : "";
    F.active.value = p && p.active === false ? "false" : "true";
    ui.modal.hidden = false;
    document.body.style.overflow = "hidden";
    ui.modal.firstChild.scrollTop = 0;
    checkImage();
  }
  function closeForm() {
    editingId = null;
    if (ui.modal) ui.modal.hidden = true;
    document.body.style.overflow = "";
  }
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && ui.modal && !ui.modal.hidden) closeForm();
  });

  /* ---------- validation + save ---------- */
  function readForm() {
    var errs = [], d = {};
    function t(k) { return F[k].value.trim(); }

    d.name = t("name");
    if (!d.name) errs.push("Medicine name is required.");
    else if (d.name.length > 120) errs.push("Medicine name is too long (maximum 120 characters).");

    d.category = t("category");
    if (!d.category) errs.push("Category is required.");
    else if (d.category.length > 60) errs.push("Category is too long (maximum 60 characters).");

    var ps = t("price"), price = Number(ps);
    if (ps === "" || !isFinite(price) || price < 0 || price > 100000000) {
      errs.push("Price must be a number from 0 to 100,000,000.");
    }
    d.price = price;

    var qs = t("stockQuantity"), q = Number(qs);
    if (qs === "" || !Number.isInteger(q) || q < 0 || q > 1000000) {
      errs.push("Stock quantity must be a whole number from 0 to 1,000,000.");
    }
    d.stockQuantity = q;
    var wps = t("wholesalePrice"), wqs = t("wholesaleMinQty");
if (wps !== "" || wqs !== "") {
  var wp = Number(wps), wq = Number(wqs);
  if (wps === "" || !isFinite(wp) || wp < 0 || wp > price) errs.push("Supplier price must be a number not higher than the selling price.");
  if (wqs === "" || !Number.isInteger(wq) || wq < 2 || wq > 10000) errs.push("Supplier minimum qty must be a whole number from 2 to 10,000.");
  d.wholesalePrice = wp;
  d.wholesaleMinQty = wq;
}

    d.image = t("image");
    if (!IMG_RE.test(d.image)) {
      errs.push("Image path must look like images/name.jpg (extension in lowercase: jpg, jpeg, png or webp; no other folders).");
    }

    var caps = { variantLabel: 60, manufacturer: 100, strength: 60, dosageForm: 60, description: 1000,
      genericName: 120, packSize: 60, nafdacNumber: 40, expiryDate: 20, directions: 1000, warnings: 1000, storage: 300 };
    OPTIONAL.forEach(function (k) {
      d[k] = t(k);
      if (d[k].length > caps[k]) errs.push(k + " is too long (maximum " + caps[k] + " characters).");
    });
    
    d.active = F.active.value === "true";
    d.prescriptionRequired = F.prescriptionRequired.value === "" ? undefined : F.prescriptionRequired.value === "true";

    if (d.name) {
      var key = d.name.toLowerCase() + "|" + d.variantLabel.toLowerCase();
      var dup = products.some(function (p) {
        return p.id !== editingId && String(p.name || "").toLowerCase() + "|" + String(p.variantLabel || "").toLowerCase() === key;
      });
      if (dup) errs.push("A medicine with this name and option already exists (it may be in the Removed list). Edit that one instead.");
    }
    return { errors: errs, data: d };
  }

  async function saveProduct() {
    var r = readForm();
    if (r.errors.length) {
      ui.formMsg.hidden = false;
      ui.formMsg.textContent = r.errors.join("\n");
      return;
    }
    ui.formMsg.hidden = true;
    var d = r.data;
    ui.saveBtn.disabled = true;
    try {
      if (editingId) {
        var upd = {
          name: d.name, category: d.category, price: d.price,
          stockQuantity: d.stockQuantity, image: d.image, active: d.active,
          updatedAt: TS()
        };
        OPTIONAL.forEach(function (k) { upd[k] = d[k] ? d[k] : DEL(); });
        upd.wholesalePrice = d.wholesalePrice !== undefined ? d.wholesalePrice : DEL();
upd.wholesaleMinQty = d.wholesaleMinQty !== undefined ? d.wholesaleMinQty : DEL();
        upd.prescriptionRequired = d.prescriptionRequired !== undefined ? d.prescriptionRequired : DEL();
        await fdb.collection("products").doc(editingId).update(upd);
        say(d.name + " updated.", true);
      } else {
        var doc = {
          name: d.name, category: d.category, price: d.price,
          stockQuantity: d.stockQuantity, image: d.image, active: d.active,
          createdAt: TS(), updatedAt: TS()
        };
        OPTIONAL.forEach(function (k) { if (d[k]) doc[k] = d[k]; });
        if (d.wholesalePrice !== undefined) { doc.wholesalePrice = d.wholesalePrice; doc.wholesaleMinQty = d.wholesaleMinQty; }
        if (d.prescriptionRequired !== undefined) doc.prescriptionRequired = d.prescriptionRequired;
        await fdb.collection("products").add(doc);
        say(d.name + " added.", true);
      }
      closeForm();
    } catch (e) {
      ui.formMsg.hidden = false;
      ui.formMsg.textContent = explain(e);
    }
    ui.saveBtn.disabled = false;
  }

  /* ---------- quick actions ---------- */
  async function quick(btn, ref, changes, okText) {
    btn.disabled = true;
    try {
      changes.updatedAt = TS();
      await ref.update(changes);
      say(okText, true);
    } catch (e) {
      say(explain(e), false);
      btn.disabled = false;
    }
  }

  async function saveThreshold() {
    var v = ui.th.value.trim(), n = Number(v);
    if (v === "" || !Number.isInteger(n) || n < 0 || n > 1000) {
      say("The alert level must be a whole number from 0 to 1000.", false);
      return;
    }
    try {
      await fdb.collection("settings").doc("inventory").set({ lowStockThreshold: n });
      say("Low-stock alert level saved.", true);
    } catch (e) {
      say(explain(e), false);
    }
  }

  /* ---------- list ---------- */
  function buildCard(p) {
    var removed = p.active === false;
    var ref = fdb.collection("products").doc(p.id);
    var cur = Number(p.stockQuantity) || 0;
    var card = el("div", "fxp-card" + (removed ? " removed" : ""));
    var top = el("div", "fxp-top");

    if (p.image) {
      var im = el("img", "fxp-thumb");
      im.alt = "";
      im.addEventListener("error", function () { im.replaceWith(el("div", "fxp-noimg", "No image")); });
      im.src = p.image;
      top.appendChild(im);
    } else {
      top.appendChild(el("div", "fxp-noimg", "No image"));
    }

    var info = el("div");
    info.appendChild(el("h3", null, fullName(p)));
    var st = stockState(p);
    var badges = el("p");
    badges.appendChild(el("span", "fxp-badge " + st, STATE_LABEL[st]));
    if (removed) badges.appendChild(el("span", "fxp-badge arch", "Removed"));
    if (p.prescriptionRequired === true) badges.appendChild(el("span", "fxp-badge out", "Rx"));
    info.appendChild(badges);
    info.appendChild(el("p", null, naira(p.price) + "  \u2022  " + (p.category || "-")));
    if (!p.genericName && !p.description) info.appendChild(el("p", "fxp-hint", "No details yet"));
    if (p.wholesalePrice != null) info.appendChild(el("p", null, "Supplier: " + naira(p.wholesalePrice) + " from " + p.wholesaleMinQty + " pcs"));
    top.appendChild(info);
    card.appendChild(top);

    if (!removed) {
      // stock stepper
      var row = el("div", "fxp-row");
      var stepper = el("div", "fxp-stepper");
      var minus = el("button", "fxp-step", "\u2212"); minus.type = "button"; minus.setAttribute("aria-label", "Decrease stock");
      var plus = el("button", "fxp-step", "+"); plus.type = "button"; plus.setAttribute("aria-label", "Increase stock");
      var qty = input("number");
      qty.min = "0"; qty.step = "1"; qty.value = cur;
      qty.setAttribute("inputmode", "numeric");
      var saveStock = button("Save stock", "main", function () {
        var n = Number(qty.value.trim());
        if (qty.value.trim() === "" || !Number.isInteger(n) || n < 0 || n > 1000000) {
          say("Stock must be a whole number from 0 to 1,000,000.", false);
          return;
        }
        quick(saveStock, ref, { stockQuantity: n }, "Stock for " + fullName(p) + " is now " + n + ".");
      });
      function sync() { saveStock.disabled = qty.value.trim() === String(cur); }
      minus.addEventListener("click", function () { qty.value = Math.max(0, (parseInt(qty.value, 10) || 0) - 1); sync(); });
      plus.addEventListener("click", function () { qty.value = Math.min(1000000, (parseInt(qty.value, 10) || 0) + 1); sync(); });
      qty.addEventListener("input", sync);
      stepper.appendChild(minus); stepper.appendChild(qty); stepper.appendChild(plus);
      row.appendChild(stepper);
      row.appendChild(saveStock);
      sync();
      card.appendChild(row);
    }

    var acts = el("div", "fxp-row");
    acts.appendChild(button("Edit", "main", function () { openForm(p); }));
    if (removed) {
      var back = button("Put back on website", "green", function () {
        quick(back, ref, { active: true }, fullName(p) + " is back on the website.");
      });
      acts.appendChild(back);
    } else {
      var out = button("Out of stock", "amber", function () {
        if (!confirm("Set " + fullName(p) + " to quantity 0 (Out of Stock)?")) return;
        quick(out, ref, { stockQuantity: 0 }, fullName(p) + " is now Out of Stock.");
      });
      if (cur === 0) out.disabled = true;
      acts.appendChild(out);
      var rm = button("Remove", "red", function () {
        if (!confirm("Remove " + fullName(p) + " from the website?\n\nCustomers will not see it. Old orders are not affected. You can put it back later from the Removed tab.")) return;
        quick(rm, ref, { active: false }, fullName(p) + " removed. Find it under the Removed tab.");
      });
      acts.appendChild(rm);
    }
    card.appendChild(acts);
    return card;
  }

  function renderList() {
    if (!ui.list) return;
    var live = products.filter(function (p) { return p.active !== false; });
    var gone = products.filter(function (p) { return p.active === false; });
    var counts = {
      all: live.length,
      in: live.filter(function (p) { return stockState(p) === "in"; }).length,
      low: live.filter(function (p) { return stockState(p) === "low"; }).length,
      out: live.filter(function (p) { return stockState(p) === "out"; }).length,
      removed: gone.length
    };

    ui.chips.innerHTML = "";
    [["all", "All"], ["in", "In Stock"], ["low", "Low"], ["out", "Out"], ["removed", "Removed"]].forEach(function (c) {
      var b = el("button", "fxp-chip" + (filterKey === c[0] ? " on" : ""), c[1]);
      b.type = "button";
      b.appendChild(el("small", null, String(counts[c[0]])));
      b.addEventListener("click", function () { filterKey = c[0]; renderList(); });
      ui.chips.appendChild(b);
    });

    var term = ui.search.value.trim().toLowerCase();
    var pool = filterKey === "removed" ? gone : live.filter(function (p) { return filterKey === "all" || stockState(p) === filterKey; });
    var shown = pool.filter(function (p) { return !term || String(p.name || "").toLowerCase().indexOf(term) !== -1; });

    ui.list.innerHTML = "";
    if (!products.length) {
      ui.list.appendChild(el("div", "fxp-empty", "No medicines yet. Tap + Add medicine to create the first one."));
    } else if (!shown.length) {
      var msg = filterKey === "removed"
        ? "Nothing removed. When you remove a medicine it appears here, and you can put it back on the website."
        : "No medicines match your search or filter.";
      ui.list.appendChild(el("div", "fxp-empty", msg));
    } else {
      shown.forEach(function (p) { ui.list.appendChild(buildCard(p)); });
    }

    var seen = {};
    KNOWN_CATS.concat(products.map(function (p) { return p.category; })).forEach(function (c) { if (c) seen[c] = 1; });
    ui.cats.innerHTML = "";
    Object.keys(seen).sort().forEach(function (c) {
      var o = el("option");
      o.value = c;
      ui.cats.appendChild(o);
    });
  }

  /* ---------- start / stop (admins only) ---------- */
  function start() {
    if (started) return;
    started = true;
    build();
    ui.list.appendChild(el("div", "fxp-empty", "Loading medicines..."));

    unsubSettings = fdb.collection("settings").doc("inventory").onSnapshot(function (s) {
      var n = s.exists ? Number(s.data().lowStockThreshold) : 5;
      threshold = Number.isInteger(n) && n >= 0 ? n : 5;
      ui.th.value = threshold;
      ui.thSum.textContent = "Low-stock alert level: " + threshold;
      renderList();
    }, function (e) { say("Could not load the alert level: " + explain(e), false); });

    unsubProducts = fdb.collection("products").onSnapshot(function (snap) {
      products = snap.docs.map(function (d) {
        var o = d.data();
        o.id = d.id;
        return o;
      }).sort(function (a, b) {
        return String(a.name || "").localeCompare(String(b.name || ""));
      });
      renderList();
    }, function (e) {
      ui.list.innerHTML = "";
      ui.list.appendChild(el("div", "fxp-empty", "Could not load medicines."));
      say("Could not load medicines: " + explain(e), false);
    });
  }

  function stop() {
    if (unsubProducts) { unsubProducts(); unsubProducts = null; }
    if (unsubSettings) { unsubSettings(); unsubSettings = null; }
    if (ui.toast) { ui.toast.remove(); ui.toast = null; }
    document.body.style.overflow = "";
    started = false;
    host.innerHTML = "";
  }

  firebase.auth().onAuthStateChanged(async function (user) {
    if (!user) { stop(); return; }
    try {
      var s = await fdb.collection("users").doc(user.uid).get();
      if (s.exists && s.data().role === "admin") start();
      else stop();
    } catch (e) {
      console.error("Admin check failed:", e);
      stop();
    }
  });
})();
