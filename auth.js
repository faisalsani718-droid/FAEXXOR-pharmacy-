// @ts-nocheck
(function () {
  "use strict";

  // `db` already exists from firebase.js. Only `auth` is created here.
  const auth = firebase.auth();
  const usersRef = db.collection("users");

  const CUSTOMER_PAGE = "index.html";
  const ADMIN_PAGE = "admin-dashboard.html";

  let busy = false; // blocks double submissions

  // Pages a customer may be sent back to after login (stops redirects to other sites)
  const ALLOWED_NEXT = ["upload-prescription.html", "my-prescriptions.html", "prescription-tracking.html"];
  function nextPage() {
    const n = new URLSearchParams(window.location.search).get("next") || "";
    return ALLOWED_NEXT.indexOf(n.split("?")[0]) !== -1 ? n : CUSTOMER_PAGE;
  }

  const $ = (id) => document.getElementById(id);

  /* ---------- UI helpers ---------- */
  function showMessage(text, type) {
    const box = $("message");
    box.textContent = text;
    box.className = "message " + type;
    box.hidden = false;
  }

  function clearMessage() {
    const box = $("message");
    box.hidden = true;
    box.textContent = "";
  }

  function setFieldError(inputId, errorId, text) {
    $(inputId).classList.add("invalid");
    $(inputId).setAttribute("aria-invalid", "true");
    $(errorId).textContent = text;
  }

  function clearFieldErrors() {
    document.querySelectorAll("input.invalid").forEach((el) => {
      el.classList.remove("invalid");
      el.removeAttribute("aria-invalid");
    });
    document.querySelectorAll(".field-error").forEach((el) => (el.textContent = ""));
  }

  function setLoading(button, loading, loadingText) {
    if (loading) {
      button.dataset.label = button.textContent;
      button.textContent = loadingText;
      button.disabled = true;
    } else {
      button.textContent = button.dataset.label || button.textContent;
      button.disabled = false;
    }
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function setupPasswordToggle(inputId, buttonId) {
    const input = $(inputId);
    const btn = $(buttonId);
    btn.addEventListener("click", () => {
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.textContent = show ? "Hide" : "Show";
      btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
    });
  }

  /* ---------- Friendly error messages ---------- */
  function friendlyError(code) {
    switch (code) {
      case "auth/invalid-credential":
      case "auth/wrong-password":
      case "auth/user-not-found":
        return "Invalid email or password.";
      case "auth/invalid-email":
        return "Please enter a valid email address.";
      case "auth/email-already-in-use":
        return "Email already registered.";
      case "auth/weak-password":
        return "Password is too weak.";
      case "auth/too-many-requests":
        return "Too many attempts. Please wait a few minutes and try again.";
      case "auth/network-request-failed":
        return "Network error. Please check your internet connection.";
      case "auth/user-disabled":
        return "This account has been disabled. Please contact support.";
      default:
        return "Something went wrong. Please try again.";
    }
  }

  /* ---------- Role based redirect ---------- */
  async function redirectByRole(user) {
    let role = "customer"; // safest default
    try {
      const snap = await usersRef.doc(user.uid).get();
      if (snap.exists && snap.data().role === "admin") role = "admin";
    } catch (err) {
      console.error("Could not read user profile:", err);
    }
    window.location.href = role === "admin" ? ADMIN_PAGE : nextPage();
  }

  /* ---------- LOGIN PAGE ---------- */
  function initLogin() {
    const loginForm = $("loginForm");
    const resetForm = $("resetForm");

    setupPasswordToggle("password", "togglePassword");

    // Switch between login and reset forms
    $("forgotLink").addEventListener("click", (e) => {
      e.preventDefault();
      clearMessage();
      $("resetEmail").value = $("email").value.trim();
      loginForm.hidden = true;
      resetForm.hidden = false;
      $("resetEmail").focus();
    });

    $("backToLogin").addEventListener("click", () => {
      clearMessage();
      resetForm.hidden = true;
      loginForm.hidden = false;
      $("email").focus();
    });

    loginForm.addEventListener("submit", handleLogin);
    resetForm.addEventListener("submit", handleReset);

    // If the user is already signed in, skip the login page
    auth.onAuthStateChanged((user) => {
      if (user && !busy) redirectByRole(user);
    });
  }

  async function handleLogin(e) {
    e.preventDefault();
    if (busy) return;

    clearMessage();
    clearFieldErrors();

    const email = $("email").value.trim();
    const password = $("password").value;
    const btn = $("loginBtn");

    let valid = true;
    if (!email) {
      setFieldError("email", "emailError", "Email is required.");
      valid = false;
    } else if (!isValidEmail(email)) {
      setFieldError("email", "emailError", "Enter a valid email address.");
      valid = false;
    }
    if (!password) {
      setFieldError("password", "passwordError", "Password is required.");
      valid = false;
    }
    if (!valid) {
      showMessage("Please fill in all required fields.", "error");
      return;
    }

    busy = true;
    setLoading(btn, true, "Signing in...");

    try {
      const persistence = $("remember").checked
        ? firebase.auth.Auth.Persistence.LOCAL
        : firebase.auth.Auth.Persistence.SESSION;
      await auth.setPersistence(persistence);

      const cred = await auth.signInWithEmailAndPassword(email, password);
      showMessage("Login successful.", "success");
      await redirectByRole(cred.user); // button stays disabled while redirecting
    } catch (err) {
      showMessage(friendlyError(err.code), "error");
      busy = false;
      setLoading(btn, false);
    }
  }

  async function handleReset(e) {
    e.preventDefault();
    if (busy) return;

    clearMessage();
    const email = $("resetEmail").value.trim();
    const btn = $("resetBtn");

    if (!email || !isValidEmail(email)) {
      showMessage("Please enter a valid email address.", "error");
      return;
    }

    busy = true;
    setLoading(btn, true, "Sending...");

    try {
      await auth.sendPasswordResetEmail(email);
      showMessage("Password reset link sent. Please check your email.", "success");
    } catch (err) {
      // Same message for unknown emails, so nobody can test who has an account
      if (err.code === "auth/user-not-found") {
        showMessage("Password reset link sent. Please check your email.", "success");
      } else {
        showMessage(friendlyError(err.code), "error");
      }
    } finally {
      busy = false;
      setLoading(btn, false);
    }
  }

  /* ---------- SIGNUP PAGE ---------- */
  function checkPassword(pw) {
    return {
      length: pw.length >= 8,
      number: /\d/.test(pw),
      upper: /[A-Z]/.test(pw),
    };
  }

  function updatePasswordUI() {
    const pw = $("password").value;
    const rules = checkPassword(pw);

    $("reqLength").classList.toggle("valid", rules.length);
    $("reqNumber").classList.toggle("valid", rules.number);
    $("reqUpper").classList.toggle("valid", rules.upper);

    let score = Object.values(rules).filter(Boolean).length;
    if (pw.length >= 12 || /[^A-Za-z0-9]/.test(pw)) score += 1;
    if (!pw) score = 0;

    const bar = $("strengthBar");
    const text = $("strengthText");
    bar.className = "strength-bar";

    if (!pw) {
      bar.style.width = "0";
      text.textContent = "";
    } else if (score <= 2) {
      bar.style.width = "33%";
      text.textContent = "Weak password";
    } else if (score === 3) {
      bar.style.width = "66%";
      bar.classList.add("medium");
      text.textContent = "Medium strength";
    } else {
      bar.style.width = "100%";
      bar.classList.add("strong");
      text.textContent = "Strong password";
    }
  }

  function isValidPhone(phone) {
    const digits = phone.replace(/\D/g, "");
    return /^[+\d\s()-]+$/.test(phone) && digits.length >= 7 && digits.length <= 15;
  }

  function initSignup() {
    setupPasswordToggle("password", "togglePassword");
    setupPasswordToggle("confirmPassword", "toggleConfirm");
    $("password").addEventListener("input", updatePasswordUI);
    $("signupForm").addEventListener("submit", handleSignup);
  }

  async function handleSignup(e) {
    e.preventDefault();
    if (busy) return;

    clearMessage();
    clearFieldErrors();
    $("termsError").textContent = "";

    const fullName = $("fullName").value.trim();
    const phone = $("phone").value.trim();
    const email = $("email").value.trim();
    const password = $("password").value;
    const confirm = $("confirmPassword").value;
    const promo = $("promo").value.trim();
    const btn = $("signupBtn");

    let valid = true;
    let missing = false;

    if (!fullName) {
      setFieldError("fullName", "fullNameError", "Full name is required.");
      valid = false; missing = true;
    }
    if (!phone) {
      setFieldError("phone", "phoneError", "Phone number is required.");
      valid = false; missing = true;
    } else if (!isValidPhone(phone)) {
      setFieldError("phone", "phoneError", "Enter a valid phone number.");
      valid = false;
    }
    if (!email) {
      setFieldError("email", "emailError", "Email is required.");
      valid = false; missing = true;
    } else if (!isValidEmail(email)) {
      setFieldError("email", "emailError", "Enter a valid email address.");
      valid = false;
    }

    const rules = checkPassword(password);
    if (!password) {
      setFieldError("password", "passwordError", "Password is required.");
      valid = false; missing = true;
    } else if (!rules.length || !rules.number || !rules.upper) {
      setFieldError("password", "passwordError", "Password does not meet all requirements.");
      valid = false;
    }

    if (!confirm) {
      setFieldError("confirmPassword", "confirmPasswordError", "Please confirm your password.");
      valid = false; missing = true;
    } else if (password !== confirm) {
      setFieldError("confirmPassword", "confirmPasswordError", "Passwords do not match.");
      valid = false;
    }

    if (!$("terms").checked) {
      $("termsError").textContent = "You must agree to continue.";
      valid = false;
    }

    if (!valid) {
      showMessage(
        missing ? "Please fill in all required fields." : "Please correct the highlighted fields.",
        "error"
      );
      return;
    }

    busy = true;
    setLoading(btn, true, "Creating account...");

    try {
      const cred = await auth.createUserWithEmailAndPassword(email, password);
      const user = cred.user;

      // Profile document. The password is never stored here.
      const profile = {
        uid: user.uid,
        fullName: fullName,
        email: email,
        phone: phone,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        role: "customer",
      };
      if (promo) profile.promoCode = promo;

      try {
        await user.updateProfile({ displayName: fullName });
        await usersRef.doc(user.uid).set(profile);
      } catch (profileErr) {
        console.error("Profile save failed:", profileErr);
        showMessage("Account created, but we could not save your profile. Please contact support.", "error");
        return;
      }

      showMessage("Account created successfully.", "success");
      setTimeout(() => { window.location.href = nextPage(); }, 1200);
    } catch (err) {
      showMessage(friendlyError(err.code), "error");
      busy = false;
      setLoading(btn, false);
    }
  }

  /* ---------- Start the right page ---------- */
  if ($("loginForm")) initLogin();
  if ($("signupForm")) initSignup();
})();
(function () {
  "use strict";

  var root = document.documentElement;
  root.classList.add("auth-pending");

  function setState(state) {
    root.classList.remove("auth-pending", "auth-in", "auth-out");
    root.classList.add(state);
  }

  // If Firebase failed to load, behave as signed out (never break the page).
  if (typeof firebase === "undefined" || !firebase.auth) {
    setState("auth-out");
    return;
  }

  var auth = firebase.auth();

  auth.onAuthStateChanged(function (user) {
    setState(user ? "auth-in" : "auth-out");

    // Optional: greet the customer where you add <span data-auth-name></span>
    document.querySelectorAll("[data-auth-name]").forEach(function (el) {
      var name = user && (user.displayName || user.email) || "";
      el.textContent = name.split(" ")[0];
    });
  });

  // Logout links: any element with data-auth-logout
  document.addEventListener("click", function (e) {
    var link = e.target.closest("[data-auth-logout]");
    if (!link) return;
    e.preventDefault();
    auth.signOut().then(function () {
      window.location.href = "index.html";
    });
  });
})();
// @ts-nocheck
// FAEXXOR Pharmacy - automatic auth menu links.
// It copies the look of your existing "Order History" menu link, so
// My Account / My Orders / Logout / Sign Up / Login match the other items exactly.
(function () {
  "use strict";

  // The existing menu link whose style we copy. Change the text if needed.
  var REFERENCE_TEXT = "order history";

  var LINKS_SIGNED_IN = [
    { text: "My Account", href: "account.html" },
    { text: "My Orders",  href: "orders.html" },
    { text: "Upload Prescription",   href: "upload-prescription.html" },
    { text: "My Prescriptions",      href: "my-prescriptions.html" },
    { text: "Prescription Tracking", href: "prescription-tracking.html" },
    { text: "Logout",     href: "#", logout: true }
  ];
  var LINKS_SIGNED_OUT = [
    { text: "Upload Prescription", href: "upload-prescription.html" },
    { text: "_signup", href: "_signup.html" },
    { text: "_login",   href: "_login.html" }
  ];

  if (typeof firebase === "undefined" || !firebase.auth) {
    console.warn("header-auth: Firebase is not loaded.");
    return;
  }
  var auth = firebase.auth();

  // Find every "Order History" link (works if desktop + mobile menus both exist)
  function findReferences() {
    return Array.prototype.filter.call(document.querySelectorAll("a"), function (a) {
      return a.textContent.trim().toLowerCase() === REFERENCE_TEXT &&
             !a.closest("[data-auth-injected]");
    });
  }

  // Build one new menu item by cloning the reference item
  function buildItem(ref, def) {
    var wrapper = ref.parentElement && ref.parentElement.tagName === "LI" ? ref.parentElement : ref;
    var item = wrapper.cloneNode(true);
    var link = item.tagName === "A" ? item : item.querySelector("a");

    item.removeAttribute("id");
    link.removeAttribute("id");
    link.removeAttribute("onclick");
    link.removeAttribute("aria-current");
    item.classList.remove("active");
    link.classList.remove("active");

    link.textContent = def.text;
    link.setAttribute("href", def.href);
    if (def.logout) link.setAttribute("data-auth-logout", "");

    item.setAttribute("data-auth-injected", "");
    return item;
  }

  function render(user) {
    // Remove what we added before (when login state changes)
    document.querySelectorAll("[data-auth-injected]").forEach(function (el) { el.remove(); });

    var defs = user ? LINKS_SIGNED_IN : LINKS_SIGNED_OUT;

    findReferences().forEach(function (ref) {
      var wrapper = ref.parentElement && ref.parentElement.tagName === "LI" ? ref.parentElement : ref;
      var anchor = wrapper;
      defs.forEach(function (def) {
        var item = buildItem(ref, def);
        anchor.insertAdjacentElement("afterend", item);
        anchor = item; // keep the order: each new item goes after the previous one
      });
    });
  }

  auth.onAuthStateChanged(render);

  // Logout
  document.addEventListener("click", function (e) {
    var link = e.target.closest("[data-auth-logout]");
    if (!link) return;
    e.preventDefault();
    auth.signOut().then(function () { window.location.href = "index.html"; });
  });
})();
