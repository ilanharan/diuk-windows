// Copy this file to firebase-config.js and fill in your Firebase project values.
// firebase-config.js is gitignored and must never be committed.

const FIREBASE_CONFIG = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT.firebaseapp.com",
  databaseURL:       "https://YOUR_PROJECT.firebaseio.com",
  projectId:         "YOUR_PROJECT",
  storageBucket:     "YOUR_PROJECT.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID",
};

firebase.initializeApp(FIREBASE_CONFIG);
const firebaseAuth = firebase.auth();
firebaseAuth.languageCode = 'he';
