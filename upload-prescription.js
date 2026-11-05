// @ts-nocheck
// FAEXXOR Pharmacy - customer prescription upload (Firestore only, no Firebase Storage).
// Needs: firebase.js (db, config), prescription-guard.js (login gate).
// Writes: prescriptions/{id}, prescriptions/{id}/files/main, prescriptions/{id}/history/submitted
(function () {
  "use strict";

  var MAX_BYTES = 15 * 1024 * 1024;   // largest photo the customer may pick
  var FS_MAX_BYTES = 640000;          // size after shrinking (fits a Firestore document)
  var TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  var EXTS = ["jpg", "jpeg", "png", "webp"];
  var SAVE_TIMEOUT_MS = 25000;

  var fdb = firebase.firestore();

  var $ = function (id) { return document.getElementById(id); };
  var chosen = null;   // { blob, type }
  var busy = false;
  var started = false;

  /* ---------- helpers ---------- */
  function showMsg(text, type) {
    var b = $("rxMsg");
    b.textContent = text;
    b.className = "rx-msg " + type;
    b.hidden = false;
    b.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  function clearMsg() { $("rxMsg").hidden = true; $("rxMsg").textContent = ""; }
  function fieldErr(inputId, errId, text) {
    $(errId).textContent = text || "";
    var el = $(inputId);
    if (text) el.classList.add("bad"); else el.classList.remove("bad");
  }
  function clearErrs() {
    fieldErr("rxFile", "rxFileErr", "");
    fieldErr("rxPhone", "rxPhoneErr", "");
    fieldErr("rxAddress", "rxAddressErr", "");
    fieldErr("rxNotes", "rxNotesErr", "");
  }
  function mb(n) { return (n / 1048576).toFixed(2) + " MB"; }
  function validPhone(p) {
    var d = p.replace(/\D/g, "");
    return /^[+\d\s()-]+$/.test(p) && d.length >= 7 && d.length <= 15 && p.length <= 20;
  }
  function extOf(name) {
    var m = /\.([A-Za-z0-9]+)$/.exec(name || "");
    return m ? m[1].toLowerCase() : "";
  }

  /* ---------- file handling ---------- */
  function fileProblem(file) {
    if (!TYPES[file.type] || EXTS.indexOf(extOf(file.name)) === -1) {
      return "Only JPG, PNG or WEBP photos are allowed.";
    }
    return null;
  }

  function loadImage(url) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error("image")); };
      img.src = url;
    });
  }
  function encodeJpeg(img, maxDim, quality) {
    return new Promise(function (resolve) {
      var w = img.naturalWidth, h = img.naturalHeight;
      var scale = Math.min(1, maxDim / Math.max(w, h));
      var c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(w * scale));
      c.height = Math.max(1, Math.round(h * scale));
      var ctx = c.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(function (b) { resolve(b); }, "image/jpeg", quality);
    });
  }
  // Shrink the photo until it fits inside a Firestore document.
  async function shrinkToFit(file) {
    var url = URL.createObjectURL(file);
    try {
      var img = await loadImage(url);
      var tries = [[1600, 0.8], [1600, 0.65], [1400, 0.6], [1200, 0.55], [1000, 0.5]];
      for (var i = 0; i < tries.length; i++) {
        var b = await encodeJpeg(img, tries[i][0], tries[i][1]);
        if (b && b.size <= FS_MAX_BYTES) return b;
      }
      return null;
    } catch (e) {
      return null;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  // Raw base64 only (no "data:image/jpeg;base64," prefix).
  function toBase64(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { var s = String(r.result); resolve(s.slice(s.indexOf(",") + 1)); };
      r.onerror = function () { reject(new Error("read")); };
      r.readAsDataURL(blob);
    });
  }

  async function onFileChange() {
    clearMsg();
    fieldErr("rxFile", "rxFileErr", "");
    chosen = null;
    $("rxPreview").style.display = "none";
    $("rxFileInfo").textContent = "";

    var file = $("rxFile").files && $("rxFile").files[0];
    if (!file) return;

    var problem = fileProblem(file);
    if (problem) { fieldErr("rxFile", "rxFileErr", problem); $("rxFile").value = ""; return; }

    if (file.size > MAX_BYTES) {
      fieldErr("rxFile", "rxFileErr", "File is too large (" + mb(file.size) + "). Maximum is " + mb(MAX_BYTES) + ".");
      $("rxFile").value = "";
      return;
    }

    $("rxFileInfo").textContent = "Preparing image...";
    var blob = await shrinkToFit(file);
    if (!blob) {
      fieldErr("rxFile", "rxFileErr", "Could not prepare this photo. Please try another photo.");
      $("rxFileInfo").textContent = "";
      $("rxFile").value = "";
      return;
    }

    chosen = { blob: blob, type: "image/jpeg" };
    $("rxFileInfo").textContent = "Image selected (" + mb(blob.size) + ")";
    var p = $("rxPreview");
    if (p.dataset.url) URL.revokeObjectURL(p.dataset.url);
    p.dataset.url = URL.createObjectURL(blob);
    p.src = p.dataset.url;
    p.style.display = "block";
  }

  /* ---------- step 1 -> review ---------- */
  function onReview(e) {
    e.preventDefault();
    clearMsg();
    clearErrs();
    var phone = $("rxPhone").value.trim();
    var address = $("rxAddress").value.trim();
    var notes = $("rxNotes").value.trim();
    var ok = true;

    if (!chosen) { fieldErr("rxFile", "rxFileErr", "Please choose your prescription photo."); ok = false; }
    if (!phone) { fieldErr("rxPhone", "rxPhoneErr", "Phone number is required."); ok = false; }
    else if (!validPhone(phone)) { fieldErr("rxPhone", "rxPhoneErr", "Enter a valid phone number (max 20 characters)."); ok = false; }
    if (address.length < 5) { fieldErr("rxAddress", "rxAddressErr", "Enter your full delivery address."); ok = false; }
    else if (address.length > 300) { fieldErr("rxAddress", "rxAddressErr", "Address is too long (max 300)."); ok = false; }
    if (notes.length > 500) { fieldErr("rxNotes", "rxNotesErr", "Notes are too long (max 500)."); ok = false; }
    if (!ok) { showMsg("Please correct the highlighted fields.", "error"); return; }

    var box = $("rxSummary");
    box.innerHTML = "";
    [["File", "Image (" + mb(chosen.blob.size) + ")"],
     ["Phone", phone], ["Delivery address", address], ["Notes", notes || "-"]
    ].forEach(function (r) {
      var p = document.createElement("p");
      var s = document.createElement("strong");
      s.textContent = r[0] + ": ";
      p.appendChild(s);
      p.appendChild(document.createTextNode(r[1]));
      box.appendChild(p);
    });
    $("rxForm").hidden = true;
    $("rxReview").hidden = false;
    window.scrollTo(0, 0);
  }

  function onEdit() {
    if (busy) return;
    clearMsg();
    $("rxReview").hidden = true;
    $("rxForm").hidden = false;
  }

  /* ---------- submit ---------- */
  function friendly(err) {
    var c = (err && err.code) || "";
    if (c === "fax/timeout") return "The connection is slow. Your prescription may have been sent. Please check My Prescriptions before trying again.";
    if (c === "permission-denied") return "You are not allowed to do this. Please log in again and retry.";
    if (c === "unavailable") return "Network problem. Please check your internet and try again.";
    return "Upload failed. Please try again.";
  }

  function withTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { var e = new Error("timeout"); e.code = "fax/timeout"; reject(e); }, ms);
      promise.then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
    });
  }

  function setBusy(v) {
    busy = v;
    $("rxSubmit").disabled = v;
    $("rxEdit").disabled = v;
    $("rxBarWrap").hidden = !v;
    if (!v) $("rxBar").style.width = "0";
    $("rxSubmit").textContent = v ? "Uploading..." : "Confirm & Submit";
  }

  async function onSubmit() {
    if (busy) return; // blocks double clicks
    var user = firebase.auth().currentUser;
    if (!user || user.isAnonymous) { location.reload(); return; } // the guard sends them to login
    if (!chosen) return;

    clearMsg();
    setBusy(true);

    var phone = $("rxPhone").value.trim();
    var address = $("rxAddress").value.trim();
    var notes = $("rxNotes").value.trim();

    var ref = fdb.collection("prescriptions").doc();   // unique ID made by Firestore
    var id = ref.id;

    try {
      $("rxBar").style.width = "40%";
      var b64 = await toBase64(chosen.blob);
      $("rxBar").style.width = "70%";

      var ts = firebase.firestore.FieldValue.serverTimestamp();
      var batch = fdb.batch();

      // 1) prescription record (field list must match firestore.rules exactly)
      batch.set(ref, {
        prescriptionId: id,
        customerId: user.uid,
        customerDisplayName: (user.displayName || "").slice(0, 100),
        phone: phone,
        deliveryAddress: address,
        customerNotes: notes,
        fileType: chosen.type,
        status: "submitted",
        createdAt: ts,
        updatedAt: ts
      });

      // 2) the photo, stored privately in Firestore (id must be "main")
      batch.set(ref.collection("files").doc("main"), {
        data: b64,
        fileType: chosen.type,
        createdAt: ts
      });

      // 3) first tracking event (id must be "submitted")
      batch.set(ref.collection("history").doc("submitted"), {
        status: "submitted",
        at: ts,
        by: "customer",
        note: "Prescription submitted by customer."
      });

      await withTimeout(batch.commit(), SAVE_TIMEOUT_MS);
      $("rxBar").style.width = "100%";

      $("rxReview").hidden = true;
      $("rxDoneId").textContent = "RX-" + id.slice(-6).toUpperCase();
      $("rxDone").hidden = false;
      window.scrollTo(0, 0);
      busy = false;
    } catch (err) {
      console.error("Prescription submit failed:", err);
      showMsg(friendly(err), "error");
      setBusy(false);
    }
  }

  /* ---------- start (after the guard confirms a real customer) ---------- */
  async function start() {
    if (started) return;
    started = true;
    $("rxFile").addEventListener("change", onFileChange);
    $("rxForm").addEventListener("submit", onReview);
    $("rxEdit").addEventListener("click", onEdit);
    $("rxSubmit").addEventListener("click", onSubmit);
    try {
      var snap = await fdb.collection("users").doc(window.faxCustomer.uid).get();
      if (snap.exists && snap.data().phone && !$("rxPhone").value) $("rxPhone").value = snap.data().phone;
    } catch (e) { /* phone prefill is optional */ }
  }

  if (window.faxCustomer) start();
  else document.addEventListener("fax-customer-ready", start);
})();
