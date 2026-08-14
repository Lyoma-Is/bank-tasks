// ========== Настройки Firebase ==========
// Проект: tetrad-zadaniy

const firebaseConfig = {
  apiKey: "AIzaSyAg8nVp7WZHbWjDP8pWbr1qo7kmLAuciAA",
  authDomain: "tetrad-zadaniy.firebaseapp.com",
  databaseURL: "https://tetrad-zadaniy-default-rtdb.firebaseio.com",
  projectId: "tetrad-zadaniy",
  storageBucket: "tetrad-zadaniy.firebasestorage.app",
  messagingSenderId: "205484764365",
  appId: "1:205484764365:web:54f37201914704a2634d84",
  measurementId: "G-DNC3P2P7YV"
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
