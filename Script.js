function showMessage() {
    alert("Welcome to FAEXXOR Pharmacy!");
}
console.log("JavaScript is connected!");
// ========== MENU TOGGLE ==========
function toggleMenu() {
    const menu = document.getElementById("menu");
    menu.style.display = (menu.style.display === "block") ? "none" : "block";
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
    document.getElementById("totalPrice").textContent = totalPrice;
}

function removeItem(button, name, price) {

    button.parentElement.remove();

    totalPrice -= price;

    const index = cartItems.findIndex(item => item.name === name);

    if (index !== -1) {
        cartItems.splice(index, 1);
    }

    document.getElementById("totalItems").textContent = cartItems.length;
    document.getElementById("totalPrice").textContent = totalPrice;
}

function removeItem(button, amount, name) {
    button.parentElement.remove();

    total -= amount;
    document.getElementById("total").textContent = total;

    cartItems = cartItems.filter(item => item.name !== name);
}

function removeItem(button, itemTotal, name) {
    button.parentElement.remove();

    total -= itemTotal;
    document.getElementById("total").textContent = total;

    cartItems = cartItems.filter(item => item.name !== name);
}

function removeItem(button, amount, name) {
    button.parentElement.remove();

    total -= amount;
    document.getElementById("total").textContent = total;

    cartItems = cartItems.filter(item => item.name !== name);
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
saveOrderHistory(
    "Medicines Ordered on " + new Date().toLocaleString()
);

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
function showSuccess() {
    document.getElementById("orderSuccess").classList.remove("hidden");
}

function closeSuccess() {
    document.getElementById("orderSuccess").classList.add("hidden");
}
function trackOrder() {
    let id = document.getElementById("orderId").value;

    if (!id) {
        alert("Enter Order ID");
        return;
    }

    // Demo tracking system
    let status = "Processing";

    if (id === "123") status = "Shipped 🚚";
    if (id === "999") status = "Delivered 🎉";

    document.getElementById("trackingResult").innerText =
        "Order Status: " + status;
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

window.onload = loadOrders;
function saveOrderHistory(orderDetails) {
    let history = JSON.parse(localStorage.getItem("orderHistory")) || [];

    history.push(orderDetails);

    localStorage.setItem("orderHistory", JSON.stringify(history));

    loadHistory();
}
function loadHistory() {
    let history = JSON.parse(localStorage.getItem("orderHistory")) || [];

    let historyList = document.getElementById("historyList");

    history.forEach(function(order, index) {
        let li = document.createElement("li");
        li.innerHTML = `Order ${index + 1}: ${order}`;
    });
}

window.onload = loadHistory;
function searchMedicine() {
    let input = document.getElementById("searchBox").value.toLowerCase();

    let products = document.querySelectorAll(".product");

    products.forEach(product => {
        let name = product.querySelector("h3").textContent.toLowerCase();

        if (name.includes(input)) {
            product.style.display = "block";
        } else {
            product.style.display = "none";
        }
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
const orderForm = document.getElementById("orderForm");

if (orderForm) {
    orderForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const name = document.getElementById("customerName").value;
        const phone = document.getElementById("customerPhone").value;
        const order = document.getElementById("customerOrder").value;

        try {
            await addDoc(collection(db, "orders"), {
                name,
                phone,
                order,
                createdAt: new Date()
            });

            alert("Order submitted successfully!");
            orderForm.reset();
        } catch (error) {
            console.error(error);
            alert("Failed to submit order.");
        }
    });
}
