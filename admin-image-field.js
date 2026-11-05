// FAEXXOR Pharmacy admin: adds "Upload photo" to the medicine form's Image path box (Cloudinary).
// Add after admin-products.js. Needs netlify/functions/cloudinary-sign.js
(function () {
  var API = "/.netlify/functions/cloudinary-sign", MAX = 1000, OK = ["image/jpeg", "image/png", "image/webp"];

  function el(t, css, x) { var e = document.createElement(t); if (css) e.style.cssText = css; if (x != null) e.textContent = x; return e; }
  function call(body) {
    var u = firebase.auth().currentUser;
    if (!u) return Promise.reject(new Error("Please log in again"));
    return u.getIdToken().then(function (tk) {
      return fetch(API, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + tk }, body: JSON.stringify(body) });
    }).then(function (r) { return r.json(); });
  }
  function shrink(file) {
    return new Promise(function (res, rej) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var s = Math.min(1, MAX / Math.max(img.width, img.height)), c = document.createElement("canvas");
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        c.toBlob(function (b) { b ? res(b) : rej(new Error("Could not read image")); }, file.type, 0.85);
      };
      img.onerror = function () { rej(new Error("Could not read image")); }; img.src = url;
    });
  }

  function enhance(label) {
    var input = label.htmlFor && document.getElementById(label.htmlFor);
    if (!input) {
      var n = label.nextElementSibling;
      input = (n && n.tagName === "INPUT") ? n : label.parentElement && label.parentElement.querySelector("input");
    }
    if (!input || input.getAttribute("data-fxup")) return;
    input.setAttribute("data-fxup", "1");
    label.textContent = "Product image * (tap Upload photo, or type a path)";

    var wrap = el("div", "margin:6px 0");
    var pick = document.createElement("input");
    pick.type = "file"; pick.accept = "image/jpeg,image/png,image/webp"; pick.style.display = "none";
    var btn = el("button", "width:100%;border:0;background:#0b4a9e;color:#fff;border-radius:10px;padding:12px;font-size:1rem;font-weight:700", "Upload photo from gallery");
    btn.type = "button";
    var st = el("div", "font-size:.85rem;margin-top:6px");
    var pv = el("img", "display:none;width:100px;height:100px;object-fit:cover;border-radius:10px;margin-top:8px");
    wrap.appendChild(btn); wrap.appendChild(pick); wrap.appendChild(st); wrap.appendChild(pv);
    input.parentNode.insertBefore(wrap, input);

    function preview() {
      var v = input.value.trim();
      if (v) { pv.src = v; pv.style.display = "block"; } else pv.style.display = "none";
    }
    input.addEventListener("input", preview); preview();

    btn.onclick = function () { pick.click(); };
    pick.onchange = async function () {
      var f = pick.files[0]; pick.value = ""; if (!f) return;
      if (OK.indexOf(f.type) < 0) { st.style.color = "#dc2626"; st.textContent = "Only JPG, PNG or WEBP."; return; }
      if (f.size > 15 * 1024 * 1024) { st.style.color = "#dc2626"; st.textContent = "Photo too big (max 15 MB)."; return; }
      btn.disabled = true; st.style.color = "#5b6b7d"; st.textContent = "Uploading... please wait before saving.";
      try {
        var s = await call({ action: "sign", fileName: f.name });
        if (!s.signature) throw new Error(s.error || "Not allowed");
        var fd = new FormData();
        fd.append("file", await shrink(f), f.name);
        ["allowed_formats", "folder", "public_id", "timestamp", "signature"].forEach(function (k) { fd.append(k, s[k]); });
        fd.append("api_key", s.apiKey);
        var r = await (await fetch("https://api.cloudinary.com/v1_1/" + s.cloudName + "/image/upload", { method: "POST", body: fd })).json();
        if (!r.secure_url) throw new Error((r.error && r.error.message) || "Upload failed");
        input.value = r.secure_url;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        st.style.color = "#16a34a"; st.textContent = "Uploaded. Now tap Save.";
      } catch (e) { st.style.color = "#dc2626"; st.textContent = "Error: " + e.message; }
      btn.disabled = false;
    };
  }

  function scan() {
    document.querySelectorAll("label").forEach(function (l) {
      if (/^\s*image path/i.test(l.textContent)) enhance(l);
    });
  }
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
  scan();
})();
