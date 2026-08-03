import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

// TODO: REPlACE WITH YOUR ACTUAL FIREBASE CONFIG
const firebaseConfig = {
    apiKey: "AIzaSyB4i-oM2N87AZ2t_PBg-zxNZgVq2q93-aA",
    authDomain: "gantari-content-manager.firebaseapp.com",
    projectId: "gantari-content-manager",
    storageBucket: "gantari-content-manager.firebasestorage.app",
    messagingSenderId: "599025558061",
    appId: "1:599025558061:web:9cd0ecad8c5f69f427cea4",
    measurementId: "G-ETRXMTL1FC"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// DOM Elements
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const authError = document.getElementById('auth-error');
const btnGoogleLogin = document.getElementById('btn-google-login');

// Check Auth State
onAuthStateChanged(auth, (user) => {
    if (user) {
        // Redirect to dashboard if already logged in - Gunakan replace agar tidak tersimpan di riwayat browser (tombol Back)
        window.location.replace('dashboard.html');
    }
});

// Login with Username
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    
    // Append domain to username
    const email = username + "@gantari.com";
    
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        authError.innerText = error.message;
    }
});

// Register with Username
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('register-username').value;
    const password = document.getElementById('register-password').value;
    
    // Append domain to username
    const email = username + "@gantari.com";
    
    try {
        await createUserWithEmailAndPassword(auth, email, password);
    } catch (error) {
        authError.innerText = error.message;
    }
});

// Login with Google
if (btnGoogleLogin) {
    btnGoogleLogin.addEventListener('click', async () => {
        const provider = new GoogleAuthProvider();
        try {
            await signInWithPopup(auth, provider);
        } catch (error) {
            authError.innerText = error.message;
        }
    });
}
