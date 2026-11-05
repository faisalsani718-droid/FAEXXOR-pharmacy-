// @ts-nocheck
// FAEXXOR Pharmacy - login gate for the prescription pages.
// Load after firebase.js. Sends visitors to login, then back to this page.
(function () {
  "use strict";
  var auth = firebase.auth();

  function toLogin() {
    var page = location.pathname.split("/").pop() || "index.html";
    location.replace("login.html?next=" + encodeURIComponent(page + location.search));
  }

  auth.onAuthStateChanged(function (user) {
    if (!user) { toLogin(); return; }
    if (user.isAnonymous) { auth.signOut().then(toLogin); return; } // avoids a login loop
    window.faxCustomer = user; // identity comes from Firebase, never from the page
    document.documentElement.style.visibility = "visible";
    document.dispatchEvent(new CustomEvent("fax-customer-ready"));
  });
})();
