/**
 * Админ-доступ через Firebase Authentication.
 * Админ: UID в Firebase Auth или /admin/uid в Realtime Database.
 * Fallback: /admin/login + /admin/password (Realtime Database).
 */
(function (global) {
  const SESSION_KEY = 'bank_admin_session';
  const SESSION_UID = 'bank_admin_uid';
  const DEFAULT_ADMIN_UID = 'JqhUHrE7L3UcidaJzQIt90WcVcp2';

  function isAdmin() {
    try {
      return sessionStorage.getItem(SESSION_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function setAdmin(ok, uid) {
    try {
      if (ok) {
        sessionStorage.setItem(SESSION_KEY, '1');
        if (uid) sessionStorage.setItem(SESSION_UID, uid);
      } else {
        sessionStorage.removeItem(SESSION_KEY);
        sessionStorage.removeItem(SESSION_UID);
      }
    } catch (e) {}
  }

  function logoutAdmin() {
    setAdmin(false);
    try {
      if (typeof firebase !== 'undefined' && firebase.auth) {
        firebase.auth().signOut().catch(function () {});
      }
    } catch (e) {}
  }

  async function getAllowedAdminUid() {
    try {
      if (typeof initFirebase === 'function') initFirebase();
      const db = typeof getFirebaseDb === 'function' ? getFirebaseDb() : null;
      if (db) {
        const snap = await db.ref('admin/uid').once('value');
        const v = snap.val();
        if (v && String(v).trim()) return String(v).trim();
      }
    } catch (e) {}
    return DEFAULT_ADMIN_UID;
  }

  /** Вход через Firebase Auth (email + password) */
  async function loginAdminWithEmail(email, password) {
    const em = String(email || '').trim();
    const pass = String(password || '');
    if (!em || !pass) return { ok: false, error: 'Введите email и пароль' };

    if (typeof initFirebase === 'function') initFirebase();
    if (typeof firebase === 'undefined' || !firebase.auth) {
      return { ok: false, error: 'Firebase Auth не загружен' };
    }

    try {
      const cred = await firebase.auth().signInWithEmailAndPassword(em, pass);
      const uid = cred.user && cred.user.uid;
      const allowed = await getAllowedAdminUid();
      if (uid && uid === allowed) {
        setAdmin(true, uid);
        return { ok: true, uid: uid };
      }
      await firebase.auth().signOut();
      setAdmin(false);
      return { ok: false, error: 'Этот аккаунт не является администратором' };
    } catch (e) {
      console.error(e);
      var msg = e.message || 'Ошибка входа';
      if (e.code === 'auth/user-not-found' || e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') {
        msg = 'Неверный email или пароль';
      } else if (e.code === 'auth/invalid-email') {
        msg = 'Некорректный email';
      }
      return { ok: false, error: msg };
    }
  }

  /** Старый способ: login/password из RTDB /admin */
  async function loginAdminRtdb(login, password) {
    const loginTrim = String(login || '').trim();
    const pass = String(password || '');
    if (!loginTrim || !pass) {
      return { ok: false, error: 'Введите логин и пароль' };
    }
    if (typeof initFirebase === 'function') initFirebase();
    if (typeof getFirebaseDb !== 'function' || !getFirebaseDb()) {
      return { ok: false, error: 'Firebase не подключён' };
    }
    try {
      const snap = await getFirebaseDb().ref('admin').once('value');
      const data = snap.val() || {};
      const storedLogin = String(data.login != null ? data.login : data.username || '').trim();
      const storedPass = String(data.password != null ? data.password : '');
      if (storedLogin && storedPass && loginTrim === storedLogin && pass === storedPass) {
        setAdmin(true, data.uid || DEFAULT_ADMIN_UID);
        return { ok: true };
      }
      return { ok: false, error: 'Неверный логин или пароль' };
    } catch (e) {
      return { ok: false, error: e.message || 'Ошибка Firebase' };
    }
  }

  async function loginAdmin(loginOrEmail, password) {
    // Сначала Firebase Auth (email), затем RTDB
    const s = String(loginOrEmail || '');
    if (s.indexOf('@') >= 0) {
      const r = await loginAdminWithEmail(s, password);
      if (r.ok) return r;
      // если Auth не сработал — попробуем RTDB тем же логином
    }
    const rtdb = await loginAdminRtdb(loginOrEmail, password);
    if (rtdb.ok) return rtdb;
    if (s.indexOf('@') >= 0) {
      return await loginAdminWithEmail(s, password);
    }
    return rtdb;
  }

  function requireAdminOrRedirect(redirectTo) {
    if (isAdmin()) return true;
    const next = redirectTo || (location.pathname.split('/').pop() || 'index.html') + location.search;
    location.href = 'admin.html?next=' + encodeURIComponent(next);
    return false;
  }

  function isHomePage() {
    const path = (location.pathname || '').split('/').pop() || '';
    return path === '' || path === 'index.html' || path === 'index.htm';
  }

  function mountProfileFab() {
    if (!isHomePage()) return;
    if (document.getElementById('profileFab')) return;
    const a = document.createElement('a');
    a.id = 'profileFab';
    a.className = 'profile-fab';
    a.href = 'admin.html';
    a.title = isAdmin() ? 'Админ' : 'Вход администратора';
    a.setAttribute('aria-label', 'Профиль');
    a.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
    document.body.appendChild(a);
  }

  global.BankAuth = {
    isAdmin: isAdmin,
    setAdmin: setAdmin,
    logoutAdmin: logoutAdmin,
    loginAdmin: loginAdmin,
    loginAdminWithEmail: loginAdminWithEmail,
    requireAdminOrRedirect: requireAdminOrRedirect,
    mountProfileFab: mountProfileFab,
    DEFAULT_ADMIN_UID: DEFAULT_ADMIN_UID
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountProfileFab);
  } else {
    mountProfileFab();
  }
})(window);
