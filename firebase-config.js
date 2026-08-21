// ========== Настройки Firebase ==========
// Проект: tasksent-20546
// Важно: для Realtime Database нужен databaseURL (Realtime Database → URL вверху)

const firebaseConfig = {
  apiKey: "AIzaSyDT1s07eq2MTvqGJ0LlOvgUsSqFbE02ghU",
  authDomain: "tasksent-20546.firebaseapp.com",
  databaseURL: "https://tasksent-20546-default-rtdb.firebaseio.com",
  projectId: "tasksent-20546",
  storageBucket: "tasksent-20546.firebasestorage.app",
  messagingSenderId: "141575922366",
  appId: "1:141575922366:web:fb14587373f9b703cff4ef",
  measurementId: "G-RS9Q9ZKQ9F"
};

// true = Firebase; false = только localStorage
const USE_FIREBASE = true;

let firebaseApp = null;
let firebaseDb = null;

function initFirebase() {
  if (!USE_FIREBASE) return null;
  if (typeof firebase === 'undefined') {
    console.warn('Firebase SDK не загружен');
    return null;
  }
  if (!firebaseConfig.apiKey || firebaseConfig.apiKey.includes('YOUR_')) {
    console.warn('Укажите firebaseConfig в firebase-config.js');
    return null;
  }
  try {
    if (!firebase.apps.length) {
      firebaseApp = firebase.initializeApp(firebaseConfig);
    } else {
      firebaseApp = firebase.app();
    }
    firebaseDb = firebase.database();
    return firebaseDb;
  } catch (e) {
    console.error('Firebase init error', e);
    return null;
  }
}

function getFirebaseDb() {
  if (firebaseDb) return firebaseDb;
  return initFirebase();
}

function isFirebaseReady() {
  return !!getFirebaseDb();
}

// Совместимость со старыми именами
function initSupabase() { return initFirebase(); }
function isSupabaseReady() { return isFirebaseReady(); }
function getSupabase() { return null; }
