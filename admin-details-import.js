// @ts-nocheck
// FAEXXOR Pharmacy - import medicine DETAILS from the reviewed CSV into existing products.
// Add this script to admin-dashboard.html, import once, then REMOVE the script tag.
// Only fills the detail fields. Never changes price, stock, image or category.
(function () {
  "use strict";
  var section = document.getElementById("productsSection");
  if (!section || typeof firebase === "undefined" || !firebase.firestore) return;
  var fdb = firebase.firestore(), TS = firebase.firestore.FieldValue.serverTimestamp;
  var box = null, started = false, queue = [];
  var CAPS = { genericName: 120, description: 1000, warnings: 1000, storage: 300, strength: 60, packSize: 60,
    manufacturer: 100, nafdacNumber: 40, expiryDate: 20, directions: 1000 };

  /*PARSE_START*/
  function parseCSV(text) {
    text = String(text || "").replace(/^\uFEFF/, "");
    var rows = [], row = [], cur = "", q = false, i, c;
    for (i = 0; i < text.length; i++) {
      c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(cur); cur = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cur); cur = ""; rows.push(row); row = [];
      } else cur += c;
    }
    if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (x) { return String(x).trim() !== ""; }); });
  }
  /*PARSE_END*/

  function el(tag, text, css) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (css) e.style.cssText = css; return e; }
  function key(n, v) { return String(n || "").trim().toLowerCase() + "|" + String(v || "").trim().toLowerCase(); }

  function build() {
    box = el("div", null, "background:#fff;border:2px dashed #0b4a9e;border-radius:12px;padding:14px 16px;margin-bottom:14px");
    box.appendChild(el("h3", "Import medicine details (one time)", "margin:0 0 6px;font-size:1rem"));
    box.appendChild(el("p", "Choose the reviewed CSV file. Only details are filled in. Price, stock, image and category are never changed.", "font-size:.9rem;margin:4px 0"));
    var file = el("input"); file.type = "file"; file.accept = ".csv,text/csv"; file.style.cssText = "margin:8px 0;max-width:100%";
    var cl = el("label", null, "display:block;font-size:.9rem;margin:6px 0");
    var over = el("input"); over.type = "checkbox"; cl.appendChild(over);
    cl.appendChild(document.createTextNode(" Replace details that are already saved"));
    var out = el("p", "", "white-space:pre-line;font-size:.9rem;margin:10px 0 0");
    var btn = el("button", "Import details", "margin-top:8px;border:0;border-radius:8px;padding:12px 16px;font-weight:700;background:#0b4a9e;color:#fff;cursor:pointer;font-size:1rem");
    btn.type = "button"; btn.disabled = true;

    async function prepare() {
      queue = []; btn.disabled = true;
      var f = file.files && file.files[0];
      if (!f) return;
      try {
        out.textContent = "Reading file...";
        var rows = parseCSV(await f.text());
        if (rows.length < 2) { out.textContent = "The file has no data rows."; return; }
        var head = rows[0].map(function (h) { return String(h).trim(); });
        if (head.indexOf("name") < 0) { out.textContent = "Column 'name' not found. Use the CSV made from the draft sheet."; return; }
        var snap = await fdb.collection("products").get(), map = {};
        snap.forEach(function (d) { var o = d.data(); o.id = d.id; map[key(o.name, o.variantLabel)] = o; });
        var nomatch = [], empty = 0, tooLong = [];
        rows.slice(1).forEach(function (r) {
          var row = {}; head.forEach(function (h, i) { row[h] = r[i] == null ? "" : String(r[i]).trim(); });
          var p = map[key(row.name, row.variantLabel)];
          if (!p) { nomatch.push(row.name + (row.variantLabel ? " (" + row.variantLabel + ")" : "")); return; }
          var patch = {};
          Object.keys(CAPS).forEach(function (k) {
            var v = row[k]; if (!v) return;
            if (v.length > CAPS[k]) { tooLong.push(row.name + ": " + k); return; }
            if (!over.checked && typeof p[k] === "string" && p[k].trim()) return;
            patch[k] = v;
          });
          var rx = String(row.prescriptionRequired || "").toUpperCase();
          if ((rx === "TRUE" || rx === "FALSE") && (over.checked || typeof p.prescriptionRequired !== "boolean")) patch.prescriptionRequired = rx === "TRUE";
          if (!Object.keys(patch).length) { empty++; return; }
          queue.push({ id: p.id, name: row.name, patch: patch });
        });
        out.textContent = "Ready: " + queue.length + " products will be updated.\nNothing new to add: " + empty +
          "\nNot found in your shop: " + nomatch.length + (nomatch.length ? " (e.g. " + nomatch.slice(0, 5).join(", ") + ")" : "") +
          (tooLong.length ? "\nToo long, skipped: " + tooLong.slice(0, 5).join(", ") : "");
        btn.disabled = !queue.length;
      } catch (e) { console.error(e); out.textContent = "Could not read the file: " + (e.code || e.message); }
    }
    file.addEventListener("change", prepare);
    over.addEventListener("change", prepare);

    btn.addEventListener("click", async function () {
      if (!queue.length || !confirm("Save details for " + queue.length + " products now?")) return;
      btn.disabled = true;
      var done = 0, failed = 0, firstErr = "";
      for (var i = 0; i < queue.length; i++) {
        out.textContent = "Saving " + (i + 1) + " of " + queue.length + "...\nSaved " + done + ", failed " + failed;
        try {
          var patch = Object.assign({}, queue[i].patch, { updatedAt: TS() });
          await fdb.collection("products").doc(queue[i].id).update(patch);
          done++;
        } catch (e) {
          failed++; console.error("Details failed for", queue[i].name, e);
          if (!firstErr) firstErr = (e.code || e.message || "error") + " on " + queue[i].name;
        }
      }
      out.textContent = "Finished. Saved " + done + ", failed " + failed + "." +
        (firstErr ? "\nFirst error: " + firstErr + (/permission/.test(firstErr) ? "\nYour products rule must allow the new detail fields. Update the rule, then import again." : "") :
          "\nNow remove the admin-details-import.js script line from admin-dashboard.html.");
      queue = [];
    });
    box.appendChild(file); box.appendChild(cl); box.appendChild(btn); box.appendChild(out);
    section.insertBefore(box, document.getElementById("productsAdmin"));
  }

  firebase.auth().onAuthStateChanged(async function (user) {
    if (!user) { if (box) { box.remove(); box = null; } started = false; return; }
    try {
      var s = await fdb.collection("users").doc(user.uid).get();
      if (s.exists && s.data().role === "admin" && !started) { started = true; build(); }
    } catch (e) { console.error("Details import: admin check failed", e); }
  });
})();
