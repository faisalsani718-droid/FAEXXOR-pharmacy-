function showMessage() {
    alert("Welcome to FAEXXOR Pharmacy!");
}
console.log("FAEXXOR SCRIPT IS WORKING!");
console.log("JavaScript is connected!");
// ========== MENU TOGGLE ==========
(function () {
  var btn = document.getElementById("fxhBtn"), nav = document.getElementById("fxhNav");
  if (!btn || !nav) return;
  function set(open) {
    nav.classList.toggle("open", open);
    btn.classList.toggle("open", open);
    btn.setAttribute("aria-expanded", open);
    btn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  }
  btn.addEventListener("click", function (e) { e.stopPropagation(); set(!nav.classList.contains("open")); });
  nav.addEventListener("click", function (e) { if (e.target.closest("a")) set(false); });
  document.addEventListener("click", function (e) { if (!nav.contains(e.target)) set(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") set(false); });
  window.addEventListener("resize", function () { if (window.innerWidth >= 1100) set(false); });
})();
// ===== FAEXXOR header menu =====
if (!window.fxhMenuReady) {
  window.fxhMenuReady = true;
  document.addEventListener("click", function (e) {
    var btn = document.getElementById("fxhBtn");
    var nav = document.getElementById("fxhNav");
    if (!btn || !nav) return;
    var isOpen = nav.classList.contains("open");
    function set(o) {
      nav.classList.toggle("open", o);
      btn.classList.toggle("open", o);
      btn.setAttribute("aria-expanded", o);
      btn.setAttribute("aria-label", o ? "Close menu" : "Open menu");
    }
    if (e.target.closest("#fxhBtn")) set(!isOpen);
    else if (isOpen && (e.target.closest("#fxhNav a") || !e.target.closest("#fxhNav"))) set(false);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      var n = document.getElementById("fxhNav"), b = document.getElementById("fxhBtn");
      if (n) n.classList.remove("open");
      if (b) b.classList.remove("open");
    }
  });
}
// ========== CART SYSTEM ==========
let cartItems = [];
let totalPrice = 0;

function addToCart(name, price) {

    cartItems.push({
        name: name,
        price: price
    });

    const li = document.createElement("li");

    li.innerHTML = `
        ${name} - ₦${price}
        <button onclick="removeItem(this, '${name}', ${price})">
            Remove
        </button>
        `;

    document.getElementById("cart").appendChild(li);

    totalPrice += price;

    document.getElementById("totalItems").textContent = cartItems.length;
    document.getElementById("totalPrice").textContent = totalPrice; }

function removeItem(button, name, price) {
    button.parentElement.remove();

    totalPrice -= price;

    // remove only ONE matching item
    const index = cartItems.findIndex(item => item.name === name);
    if (index !== -1) cartItems.splice(index, 1);

    document.getElementById("totalPrice").textContent = totalPrice;
    document.getElementById("totalItems").textContent = cartItems.length;
}

// ========== SEARCH ==========
function searchMedicine() {
    let filter = document.getElementById("searchBox").value.toLowerCase();
    let products = document.getElementsByClassName("product");

    for (let i = 0; i < products.length; i++) {
        let name = products[i].getElementsByTagName("h3")[0].textContent.toLowerCase();

        products[i].style.display = name.includes(filter) ? "" : "none";
    }
}

// ========== CHECKOUT (WHATSAPP) ==========
function checkoutWhatsApp() {
    if (cartItems.length === 0) {
        alert("Cart is empty");
        return;
    }

    let message = "NEW PHARMACY ORDER%0A%0A";

    cartItems.forEach(item => {
        message += `${item.name} x ${item.qty} = ₦${item.total}%0A`;
    });

    message += `%0ATotal: ₦${total}`;

    const phone = "2349160556050";

    window.open(
        `https://wa.me/${phone}?text=${message}`,
        "_blank"
    );
}

// ========== ORDER FORM ==========
function sendOrder() {
    let name = document.getElementById("customerName").value;
    let phone = document.getElementById("customerPhone").value;
    let address = document.getElementById("customerAddress").value;

    if (!name || !phone || !address) {
        alert("Please fill all fields");
        return;
    }

    let message =
        "NEW ORDER%0A" +
        "Name: " + name + "%0A" +
        "Phone: " + phone + "%0A" +
        "Address: " + address;

    window.open(
        "https://wa.me/2349160556050?text=" + message,
        "_blank"
    );
}
function showSuccess(orderId) {
  document.getElementById("successOrderId").textContent = orderId;
  document.getElementById("trackOrderBtn").href =
  "orders.html?orderId=" + encodeURIComponent(orderId);
  document.getElementById("orderSuccess").classList.remove("hidden");
}

function registerUser() {
    let name = document.getElementById("regName").value;
    let email = document.getElementById("regEmail").value;

    localStorage.setItem("customerName", name);
    localStorage.setItem("customerEmail", email);

    alert("Registration Successful!");
}

function loginUser() {
    let email = document.getElementById("loginEmail").value;

    let savedEmail = localStorage.getItem("customerEmail");

    if(email === savedEmail){
        alert("Login Successful");
    } else {
        alert("Account Not Found");
    }
}
function saveAddress() {
    let address =
    document.getElementById("deliveryAddress").value;

    localStorage.setItem("deliveryAddress", address);

    alert("Address Saved");
}

function saveOrder(orderDetails) {

    let orders =
    JSON.parse(localStorage.getItem("orders")) || [];

    orders.push(orderDetails);

    localStorage.setItem(
        "orders",
        JSON.stringify(orders)
    );
}

function loadOrders() {

    let orders =
    JSON.parse(localStorage.getItem("orders")) || [];

    let list =
    document.getElementById("orderHistory");

    list.innerHTML = "";

    orders.forEach(order => {
        list.innerHTML += `<li>${order}</li>`;
    });
}

function testFirebase() {
  firebase.firestore()
    .collection("test")
    .add({
      message: "Website connected",
      time: new Date()
    })
    .then(() => {
      alert("Firebase is connected!");
    })
    .catch(error => {
      alert(error.message);
    });
}

// order.js - normal script (NOT type="module"), works with firebase.initializeApp
document.addEventListener("DOMContentLoaded", () => {
  const db = firebase.firestore();
  const placeOrderBtn = document.getElementById("placeOrder");

    placeOrderBtn?.addEventListener("click", async () => {
    const name = document.getElementById("name").value.trim();
    const phone = document.getElementById("phone").value.trim();
    const address = document.getElementById("address").value.trim();
    const paymentMethod = document.getElementById("paymentMethod").value;

    if (!name || !phone || !address || !paymentMethod) {
      alert("Please fill in all the fields.");
      return;
    }
    if (cartItems.length === 0) {
      alert("Your cart is empty.");
      return;
    }

    // ADDED: login check (before the button changes)
    const user = firebase.auth().currentUser;
    if (!user) {
      alert("Please log in before placing an order.");
      return;
    }

    placeOrderBtn.disabled = true;
    placeOrderBtn.textContent = "Sending...";

    try {
      // ADDED: unique reference and ID
      const orderRef = db.collection("orders").doc();
      const orderId = orderRef.id;

      await orderRef.set({
        orderId: orderId,          // ADDED
        customerId: user.uid,      // ADDED
        name,
        phone,
        address,
        paymentMethod,
        items: cartItems,
        totalItems: cartItems.length,
        totalPrice: totalPrice,
        status: "pending",
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      showSuccess(orderId);
    } catch (error) {
      console.error("Order failed:", error);
      alert("Order failed: " + (error.code || "") + " " + error.message);
    }

    placeOrderBtn.disabled = false;
    placeOrderBtn.textContent = "Place Order";
  });
});


function addToCart(name, price) {
    cartItems.push({ name: name, price: price });
    updateCartUI();
}

function removeItem(button, name, price) {
    const index = cartItems.findIndex(item => item.name === name);
    if (index !== -1) cartItems.splice(index, 1);
    updateCartUI();
}

function fxNaira(n) { return "₦" + Number(n).toLocaleString(); }
function fxEsc(s) { return String(s).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;"); }

function fxImage(name) {
    const p = [...document.querySelectorAll(".product")].find(el => {
        const h = el.querySelector("h3");
        return h && h.textContent.trim() === name;
    });
    const img = p && p.querySelector("img");
    return img ? img.getAttribute("src") : "";
}

function changeQty(name, delta) {
    const it = cartItems.find(i => i.name === name);
    if (!it) return;
    if (delta > 0) addToCart(it.name, it.price);
    else removeItem(null, it.name, it.price);
}

function removeAll(name) {
    const keep = cartItems.filter(i => i.name !== name);
    cartItems.splice(0, cartItems.length, ...keep);
    updateCartUI();
}

function updateCartUI() {
    totalPrice = cartItems.reduce((s, i) => s + i.price, 0);
    const n = cartItems.length;
    const groups = {};
    cartItems.forEach(i => {
        (groups[i.name] = groups[i.name] || { name: i.name, price: i.price, qty: 0 }).qty++;
    });
    const list = Object.values(groups);

    const badge = document.getElementById("fabBadge");
    if (badge) { badge.textContent = n; badge.style.display = n ? "grid" : "none"; }

    const ti = document.getElementById("totalItems"); if (ti) ti.textContent = n;
    const tp = document.getElementById("totalPrice"); if (tp) tp.textContent = totalPrice;
    const ul = document.getElementById("cart");
    if (ul) ul.innerHTML = list.map(g =>
        `<li>${fxEsc(g.name)} x${g.qty} - ${fxNaira(g.price * g.qty)} <button type="button" data-fx="del" data-name="${fxEsc(g.name)}">Remove</button></li>`
    ).join("");

    const box = document.getElementById("fxItems");
    if (!box) return;
    document.getElementById("fxCount").textContent = n;
    document.getElementById("fxTotal").textContent = fxNaira(totalPrice);
    document.getElementById("fxDf").style.display = n ? "grid" : "none";
    box.innerHTML = n ? list.map(g => {
        const src = fxImage(g.name), nm = fxEsc(g.name);
        return `<div class="fx-it">
          <div class="fx-th">${src ? `<img src="${fxEsc(src)}" alt="${nm}">` : "💊"}</div>
          <div><h4>${nm}</h4><div class="fx-u">${fxNaira(g.price)} each</div>
            <div class="fx-q"><button data-fx="minus" data-name="${nm}" aria-label="Decrease">−</button><span>${g.qty}</span><button data-fx="plus" data-name="${nm}" aria-label="Increase">+</button></div></div>
          <div class="fx-side"><button class="fx-del" data-fx="del" data-name="${nm}" aria-label="Remove ${nm}"><i class="fa-solid fa-trash"></i></button><span class="fx-sub">${fxNaira(g.price * g.qty)}</span></div>
        </div>`;
    }).join("") : `<div class="fx-empty"><div class="c"><i class="fa-solid fa-cart-shopping"></i></div><h3>Your cart is empty</h3><button class="fx-btn p" onclick="closeCart();goTo('products')">Browse Medicines</button></div>`;
}

function openCart() {
    document.getElementById("fxDrawer").classList.add("open");
    document.getElementById("fxOv").classList.add("open");
    document.getElementById("fxDrawer").setAttribute("aria-hidden", "false");
}
function closeCart() {
    document.getElementById("fxDrawer").classList.remove("open");
    document.getElementById("fxOv").classList.remove("open");
    document.getElementById("fxDrawer").setAttribute("aria-hidden", "true");
}
function goTo(id) {
    closeCart();
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
}

document.addEventListener("click", e => {
    const t = e.target.closest("[data-fx]");
    if (!t) return;
    const name = t.dataset.name;
    if (t.dataset.fx === "plus") changeQty(name, 1);
    if (t.dataset.fx === "minus") changeQty(name, -1);
    if (t.dataset.fx === "del") removeAll(name);
});
document.addEventListener("keydown", e => { if (e.key === "Escape") closeCart(); });
document.addEventListener("DOMContentLoaded", updateCartUI);

// ===== ADDED: STEP 2 ADMIN ORDERS =====
(function () {
  if (window.faxOrdersLoaded) return; // stops double listeners
  window.faxOrdersLoaded = true;

  function start() {
    var listEl = document.getElementById("pendingOrdersList");
    var detailEl = document.getElementById("orderDetailsBox");
    if (!listEl || !detailEl) return;
    var unsub = null;

    function mk(tag, text, cls) {
      var e = document.createElement(tag);
      if (text !== undefined && text !== null) e.textContent = text;
      if (cls) e.className = cls;
      return e;
    }
    function money(n) { return "₦" + Number(n || 0).toLocaleString(); }
    function when(ts) {
      try { return ts && ts.toDate ? ts.toDate().toLocaleString() : "-"; }
      catch (e) { return "-"; }
    }
    function line(box, label, val) {
      var p = mk("p");
      p.appendChild(mk("strong", label + ": "));
      p.appendChild(document.createTextNode(
        val === undefined || val === null || val === "" ? "-" : String(val)));
      box.appendChild(p);
    }
    function btn(label, fn) {
      var b = mk("button", label);
      b.type = "button";
      b.onclick = fn;
      return b;
    }

    function setStatus(id, newStatus, okMsg, failMsg) {
      if (!firebase.auth().currentUser) {
        alert("Please log in as admin.");
        return;
      }
      var ref = db.collection("orders").doc(id);
      ref.get().then(function (d) {
        if (!d.exists) { alert("Order not found."); return; }
        if (d.data().status !== "pending") {
          alert("This order is no longer pending.");
          return;
        }
        var upd = { status: newStatus };
        upd[newStatus + "At"] = firebase.firestore.FieldValue.serverTimestamp();
        return ref.update(upd).then(function () {
          detailEl.innerHTML = "";
          alert(okMsg);
        });
       }).catch(function (e) {
        console.error(e);
        alert(failMsg);
      });
    }
    function acceptOrder(id) {
      setStatus(id, "accepted", "Order accepted successfully.",
        "Unable to accept order. Please try again.");
    }
    function rejectOrder(id) {
      if (!confirm("Are you sure you want to reject this order?")) return;
      setStatus(id, "rejected", "Order rejected.",
        "Unable to reject order. Please try again.");
    }

    function viewOrder(id) {
      db.collection("orders").doc(id).get().then(function (d) {
        detailEl.innerHTML = "";
        if (!d.exists) { alert("Order not found."); return; }
        var o = d.data();
        var box = mk("div", null, "order-card");
        box.appendChild(mk("h3", "Order Details"));
        line(box, "Order ID", o.orderId || d.id);
        line(box, "Customer ID", o.customerId);
        line(box, "Customer", o.name);
        line(box, "Phone", o.phone);
        line(box, "Delivery Address", o.address || o.deliveryAddress);
        if (o.location && typeof o.location.lat === "number" && typeof o.location.lng === "number") {
          var mapLink = document.createElement("a");
          mapLink.href = "https://www.google.com/maps?q=" + o.location.lat + "," + o.location.lng;
          mapLink.target = "_blank"; mapLink.rel = "noopener";
          mapLink.textContent = "\uD83D\uDCCD Open in Google Maps";
          box.appendChild(mapLink);
        }
        line(box, "Payment Method", o.paymentMethod);
        line(box, "Payment Status", o.paymentStatus);
        line(box, "Status", String(o.status || "").toUpperCase());
        line(box, "Total Items", o.totalItems);
        line(box, "Total Price", money(o.totalPrice));
        line(box, "Created", when(o.createdAt));
        box.appendChild(mk("h4", "Items"));
        (Array.isArray(o.items) ? o.items : []).forEach(function (it) {
          var name = it.name || it.medicineName || it.title || it.productName;
          var qty = it.quantity !== undefined ? it.quantity : it.qty;
          var txt = name
            ? name + " | Price: " + money(it.price) + " | Qty: " + (qty === undefined ? "-" : qty)
            : JSON.stringify(it);
          box.appendChild(mk("p", txt));
        });
        detailEl.appendChild(box);
      }).catch(function (e) {
        console.error(e);
        alert("Unable to load order. Please try again.");
      });
    }

    function render(snap) {
      listEl.innerHTML = "";
      if (snap.empty) { listEl.appendChild(mk("p", "No pending orders.")); return; }
      var docs = snap.docs.slice().sort(function (a, b) {
        var x = a.data().createdAt, y = b.data().createdAt;
        return (y && y.toMillis ? y.toMillis() : 0) - (x && x.toMillis ? x.toMillis() : 0);
      });
      docs.forEach(function (d) {
        var o = d.data(), id = d.id;
        var c = mk("div", null, "order-card");
        c.appendChild(mk("h4", "ORDER #" + id));
        line(c, "Customer", o.name);
        line(c, "Phone", o.phone);
        line(c, "Total Items", o.totalItems);
        line(c, "Total", money(o.totalPrice));
        line(c, "Payment", o.paymentMethod);
        line(c, "Status", "PENDING");
        line(c, "Created", when(o.createdAt));
        c.appendChild(btn("VIEW ORDER", function () { viewOrder(id); }));
        c.appendChild(btn("ACCEPT", function () { acceptOrder(id); }));
        c.appendChild(btn("REJECT", function () { rejectOrder(id); }));
        listEl.appendChild(c);
      });
    }

    firebase.auth().onAuthStateChanged(function (user) {
      if (unsub) { unsub(); unsub = null; }
      listEl.innerHTML = "";
      if (!user) return;
      unsub = db.collection("orders").where("status", "==", "pending")
        .onSnapshot(render, function (err) {
          console.error(err);
          listEl.textContent = "Unable to load orders.";
        });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
// ===== END STEP 2 =====