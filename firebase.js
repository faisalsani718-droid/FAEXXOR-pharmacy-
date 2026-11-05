// For Firebase JS SDK v7.20.0 and later, measurementId is optional

const firebaseConfig = {
  apiKey: "AIzaSyA4wFDi07KAqB-mpsptldFVhPK0-RWvD4c",
  authDomain: "faexxor-pharmacy.firebaseapp.com",
  projectId: "faexxor-pharmacy",
  storageBucket: "faexxor-pharmacy.firebasestorage.app",
  messagingSenderId: "240852328687",
  appId: "1:240852328687:web:ac094f8ab41b7e1e88fb1a",
  measurementId: "G-T2RN96XQR1"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Connect to Firestore
const db = firebase.firestore();


console.log("Firebase initialized successfully");
// ===== ADDED: Firebase Authentication (Compat) =====
const auth = firebase.auth();

// Customer sign up (email + password)
function customerSignUp(email, password) {
  return auth.createUserWithEmailAndPassword(email, password);
}

// Customer login
function customerLogin(email, password) {
  return auth.signInWithEmailAndPassword(email, password);
}

// Customer logout
function customerLogout() {
  return auth.signOut();
}

// Quick option: guest session with no form
function ensureCustomer() {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  return auth.signInAnonymously().then(function (cred) {
    return cred.user;
  });
}
// ===== END ADDED =====