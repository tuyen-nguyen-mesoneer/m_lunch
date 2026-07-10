// Firebase project config — get this from Firebase Console → Project settings →
// your web app → SDK setup and configuration → Config.
export const firebaseConfig = {
    apiKey: "AIzaSyCmpxwH2W_FK5FXhO_fPUnJUpo4tWWnpZ4",
    authDomain: "vn-lunch.firebaseapp.com",
    projectId: "vn-lunch",
    storageBucket: "vn-lunch.firebasestorage.app",
    messagingSenderId: "704795876882",
    appId: "1:704795876882:web:971f4ea1311ca9fe22c2cb",
    measurementId: "G-4WJKBL2695"
};

// Cutoff time (24h) for placing/changing an order for a given weekday —
// each day locks at this hour on the day before.
export const CUTOFF_HOUR = 17;
