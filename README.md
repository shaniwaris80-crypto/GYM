# Arslan Training Tracker Pro · móvil rápido

Versión rehecha para abrir antes en móvil, con:

- tracking por serie con peso, reps y RIR
- temporizador con sonido al terminar
- botón **Ejercicio hecho** que marca todo y lanza descanso
- **Rehacer ejercicio** y **Rehacer día**
- rutina versionada
- añadir un ejercicio a varios días
- importar rutina pegando texto
- reporte semanal editable
- **PDF del reporte semanal**
- Firebase Auth + Firestore
- service worker para cachear la app

## Archivos para GitHub

Sube estos:

- `index.html`
- `styles.css`
- `app.js`
- `firebase-config.js`
- `firebase-service.js`
- `pdf-service.js`
- `firestore.rules`
- `firebase.json`
- `.firebaserc`
- `manifest.webmanifest`
- `sw.js`

## Pasos en Firebase

1. Authentication → activa **Email/Password**
2. Firestore Database → crear base de datos
3. Firestore → Rules → pega `firestore.rules`
4. Hosting → despliega esta carpeta

## Despliegue rápido

```bash
firebase login
firebase use gimnasio-f48a7
firebase deploy
```

## Sobre el rendimiento móvil

Esta versión abre más rápido porque:

- no usa fuentes externas
- no carga Firebase al primer frame
- pinta primero la pantalla y sincroniza después
- el PDF se carga solo cuando pulsas PDF
- usa service worker para cachear archivos

## Estructura Firestore

- `users/{uid}/programs`
- `users/{uid}/sessions`
- `users/{uid}/reports`
- `users/{uid}/weights`

## Nota

La importación de rutina está optimizada para texto pegado. Si luego quieres parser DOCX real dentro de la app, se puede añadir como siguiente mejora.
