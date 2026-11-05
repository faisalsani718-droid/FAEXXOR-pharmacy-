// FAEXXOR Pharmacy admin: Users list (read-only). Shows in the "Users" tab of admin-dashboard.html
(function () {
  var box = document.getElementById("usersAdmin");
  var tab = document.querySelector('.tab[data-tab="users"]');
  if (!box || !tab) return;
  var all = [], loaded = false;

  function pick(d, keys) {
    for (var i = 0; i < keys.length; i++) if (d[keys[i]]) return String(d[keys[i]]);
    return "";
  }
  function when(d) {
    var t = d.createdAt;
    return t && t.toDate ? t.toDate() : null;
  }
  function el(tag, css, text) {
    var e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (text != null) e.textContent = text;
    return e;
  }

  function draw() {
    var q = (document.getElementById("usersSearch").value || "").toLowerCase();
    var list = document.getElementById("usersList");
    list.innerHTML = "";
    var shown = all.filter(function (u) { return !q || u.text.indexOf(q) !== -1; });
    document.getElementById("usersCount").textContent = shown.length + " of " + all.length + " users";
    if (!shown.length) { list.appendChild(el("p", "color:#5b6b7d", "No users found.")); return; }
    shown.forEach(function (u) {
      var c = el("div", "background:#fff;border-radius:12px;padding:12px 14px;margin:8px 0;box-shadow:0 1px 6px rgba(0,0,0,.07)");
      var top = el("div", "display:flex;justify-content:space-between;gap:8px;align-items:center");
      top.appendChild(el("strong", "word-break:break-word", u.name || "(no name)"));
      var admin = u.role === "admin";
      top.appendChild(el("span", "font-size:.75rem;font-weight:700;padding:3px 10px;border-radius:999px;background:" + (admin ? "#fde68a" : "#dbeafe") + ";color:#1b2733", u.role || "no role"));
      c.appendChild(top);
      if (u.email) c.appendChild(el("div", "font-size:.88rem;color:#5b6b7d;word-break:break-all", u.email));
      if (u.phone) c.appendChild(el("div", "font-size:.88rem;color:#5b6b7d", u.phone));
      if (u.date) c.appendChild(el("div", "font-size:.8rem;color:#8896a6", "Joined " + u.date.toLocaleDateString()));
      c.appendChild(el("div", "font-size:.7rem;color:#9aa6b2;word-break:break-all", "ID: " + u.id));
      list.appendChild(c);
    });
  }

  function load() {
    var list = document.getElementById("usersList");
    list.innerHTML = "<p>Loading users...</p>";
    firebase.firestore().collection("users").limit(500).get().then(function (snap) {
      all = snap.docs.map(function (doc) {
        var d = doc.data();
        var u = { id: doc.id, name: pick(d, ["name", "fullName", "displayName", "customerName"]),
          email: pick(d, ["email"]), phone: pick(d, ["phone", "phoneNumber"]), role: pick(d, ["role"]), date: when(d) };
        u.text = (u.name + " " + u.email + " " + u.phone + " " + u.role).toLowerCase();
        return u;
      });
      all.sort(function (a, b) { return (b.date ? b.date.getTime() : 0) - (a.date ? a.date.getTime() : 0); });
      loaded = true;
      draw();
    }).catch(function (e) {
      list.innerHTML = "";
      list.appendChild(el("p", "color:#dc2626", "Could not load users: " + (e.code || e.message)));
    });
  }

  box.innerHTML = '<input id="usersSearch" type="search" placeholder="Search name, email, phone or role" ' +
    'style="width:100%;padding:12px;border:1px solid #cbd5e1;border-radius:10px;font-size:1rem">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin:8px 0">' +
    '<span id="usersCount" style="font-size:.85rem;color:#5b6b7d"></span>' +
    '<button id="usersRefresh" type="button" style="border:0;background:#0b4a9e;color:#fff;border-radius:8px;padding:8px 14px;font-weight:700">Refresh</button></div>' +
    '<div id="usersList"></div>';
  document.getElementById("usersSearch").addEventListener("input", draw);
  document.getElementById("usersRefresh").addEventListener("click", load);
  tab.addEventListener("click", function () { if (!loaded) load(); });
  if ((location.hash || "") === "#users") load();
})();
