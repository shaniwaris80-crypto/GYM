# Arslan Training Tracker Final

App web móvil completa para entreno, progreso y reportes, con Firebase ya integrado.

## Incluye

- tracking por serie con peso, reps y RIR
- memoria de pesos anteriores por ejercicio
- temporizador con sonido y vibración al terminar
- al marcar una serie o un ejercicio hecho arranca el descanso
- rehacer ejercicio y rehacer día
- rutina activa + rutinas versionadas
- duplicar rutina y activar bloques nuevos
- importar rutina por texto pegado
- asignar ejercicios a varios días
- reporte semanal completo
- exportación del reporte semanal en PDF
- registro de peso corporal
- login, registro y cierre de sesión con Firebase Auth
- sincronización con Cloud Firestore
- caché local + service worker para abrir más rápido en móvil

## Archivos que debes subir

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

## Pasos en Firebase

1. Abre tu proyecto `gimnasio-f48a7`.
2. En Authentication activa **Email/Password**.
3. En Firestore Database crea la base de datos.
4. En Rules pega el contenido de `firestore.rules` y publica.
5. Sube estos archivos a Firebase Hosting o GitHub Pages.

## Estructura usada en Firestore

- users/{uid}/programs
- users/{uid}/sessions
- users/{uid}/reports
- users/{uid}/weights

## Despliegue con Firebase CLI

```bash
firebase login
firebase use gimnasio-f48a7
firebase deploy
```

## Rendimiento móvil

Esta versión está hecha para cargar antes en móvil:

- sin fuentes externas
- interfaz local primero
- Firebase se conecta después
- PDF solo se carga cuando lo pides
- service worker para caché
- scripts clásicos, sin build ni módulos obligatorios
