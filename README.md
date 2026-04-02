# Arslan Training Tracker Elite

App web móvil para entreno con Firebase, rutinas versionadas, medidas corporales y reporte semanal.

## Qué incluye esta versión

- tracking por serie con peso, reps y RIR
- memoria del último peso y sugerencia automática de progresión
- temporizador que arranca al marcar serie o ejercicio hecho
- sonido del temporizador configurable: sonido + vibración / solo vibración / silencioso
- modo entreno para móvil con pantalla activa y vista enfocada
- rehacer ejercicio y rehacer día
- duplicar sesiones anteriores
- rutinas versionadas con estados: active, draft, archived, future
- importar rutina por texto o JSON
- añadir ejercicios a varios días
- plantillas rápidas: core, gemelos, cardio y calentamiento
- reordenar y quitar ejercicios por día
- modo coach en Inicio con recomendaciones rápidas
- reporte semanal completo con autocompletado
- exportación del reporte a PDF
- registro de peso y medidas: cintura, pecho, brazo y pierna
- historial por ejercicio y por medidas
- backup JSON, restauración y deshacer último cambio
- login, registro y cierre de sesión con Firebase Auth
- sincronización con Cloud Firestore
- caché local + service worker para abrir más rápido en móvil

## Archivos para GitHub / Hosting

- index.html
- styles.css
- app.js
- firebase-config.js
- firebase-service.js
- pdf-service.js
- firestore.rules
- firebase.json
- .firebaserc
- manifest.webmanifest
- sw.js
- README.md

## Pasos en Firebase

1. Entra en el proyecto `gimnasio-f48a7`.
2. Activa **Authentication > Email/Password**.
3. Crea **Cloud Firestore**.
4. En **Rules** pega el contenido de `firestore.rules` y publica.
5. Publica la web con Firebase Hosting o súbela a GitHub Pages.

## Estructura de Firestore

- users/{uid}/programs
- users/{uid}/sessions
- users/{uid}/reports
- users/{uid}/bodyMetrics
- users/{uid}/exerciseLibrary

## Deploy con Firebase CLI

```bash
firebase login
firebase use gimnasio-f48a7
firebase deploy
```

## Notas de rendimiento móvil

- sin fuentes externas
- interfaz visible primero
- Firebase en carga diferida
- service worker para caché
- temporizador persistente sin escribir en storage cada segundo
- render por vista para reducir carga inicial
