import { appConfig } from './firebase-config.js';
import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js';
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import { initializeFirestore, persistentLocalCache, persistentSingleTabManager, collection, doc, setDoc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';

let app;
let auth;
let db;

export async function initFirebase() {
  if (!appConfig.useFirebase) return null;
  if (!app) {
    app = getApps()[0] || initializeApp(appConfig.firebaseConfig);
    try {
      db = initializeFirestore(app, {
        localCache: persistentLocalCache({ tabManager: persistentSingleTabManager() })
      });
    } catch (error) {
      console.warn('Firestore persistent cache no disponible, usando instancia simple.', error);
      db = initializeFirestore(app, {});
    }
    auth = getAuth(app);
  }
  return { app, auth, db };
}

export function listenAuth(callback) {
  if (!auth) throw new Error('Firebase no inicializado');
  return onAuthStateChanged(auth, callback);
}

export function signup(email, password) {
  return createUserWithEmailAndPassword(auth, email, password);
}

export function login(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export function logout() {
  return signOut(auth);
}

export function subscribeCollection(uid, name, callback) {
  const q = query(collection(db, `users/${uid}/${name}`), orderBy('updatedAt', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const rows = snapshot.docs.map((row) => ({ id: row.id, ...row.data() }));
    callback(rows);
  });
}

export function upsertDocument(uid, collectionName, id, data) {
  return setDoc(doc(db, `users/${uid}/${collectionName}/${id}`), {
    ...data,
    updatedAt: new Date().toISOString(),
    serverUpdatedAt: serverTimestamp()
  }, { merge: true });
}

export function removeDocument(uid, collectionName, id) {
  return deleteDoc(doc(db, `users/${uid}/${collectionName}/${id}`));
}
