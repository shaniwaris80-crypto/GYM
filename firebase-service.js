(function () {
  function loadScriptOnce(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-firebase-src="${src}"]`);
      if (existing && existing.dataset.loaded === 'true') return resolve();
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.dataset.firebaseSrc = src;
      script.addEventListener('load', () => {
        script.dataset.loaded = 'true';
        resolve();
      }, { once: true });
      script.addEventListener('error', reject, { once: true });
      document.head.appendChild(script);
    });
  }

  let app = null;
  let auth = null;
  let db = null;

  async function initFirebase() {
    const cfg = window.appConfig;
    if (!cfg || !cfg.useFirebase) return null;
    if (!window.firebase) {
      await loadScriptOnce('https://www.gstatic.com/firebasejs/12.11.0/firebase-app-compat.js');
      await loadScriptOnce('https://www.gstatic.com/firebasejs/12.11.0/firebase-auth-compat.js');
      await loadScriptOnce('https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore-compat.js');
    }
    if (!app) {
      app = firebase.apps && firebase.apps.length ? firebase.app() : firebase.initializeApp(cfg.firebaseConfig);
      auth = firebase.auth();
      try {
        db = firebase.firestore();
        if (typeof db.enablePersistence === 'function') {
          db.enablePersistence({ synchronizeTabs: false }).catch(() => {});
        }
      } catch (error) {
        console.warn('Firestore persistence no disponible', error);
        db = firebase.firestore();
      }
    }
    return { app, auth, db };
  }

  function listenAuth(callback) {
    if (!auth) throw new Error('Firebase no inicializado');
    return auth.onAuthStateChanged(callback);
  }

  function signup(email, password) { return auth.createUserWithEmailAndPassword(email, password); }
  function login(email, password) { return auth.signInWithEmailAndPassword(email, password); }
  function logout() { return auth.signOut(); }

  function subscribeCollection(uid, name, callback) {
    return db.collection(`users/${uid}/${name}`).orderBy('updatedAt', 'desc').onSnapshot((snapshot) => {
      const rows = snapshot.docs.map((row) => ({ id: row.id, ...row.data() }));
      callback(rows);
    }, (error) => {
      console.warn('Snapshot error', name, error);
      callback([]);
    });
  }

  function upsertDocument(uid, collectionName, id, data) {
    return db.doc(`users/${uid}/${collectionName}/${id}`).set({
      ...data,
      updatedAt: new Date().toISOString(),
      serverUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }

  function removeDocument(uid, collectionName, id) {
    return db.doc(`users/${uid}/${collectionName}/${id}`).delete();
  }

  window.firebaseApiService = {
    initFirebase,
    listenAuth,
    signup,
    login,
    logout,
    subscribeCollection,
    upsertDocument,
    removeDocument
  };
})();
