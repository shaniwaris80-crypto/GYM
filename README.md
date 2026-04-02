# Arslan Training Tracker Pro · gimnasio-f48a7

App web móvil para tracking de entreno con rutinas versionadas, historial por ejercicio, reportes semanales y backend conectado a Firebase Auth + Cloud Firestore.

## Incluye

- Mobile first real: tarjetas verticales, botones grandes y navegación inferior.
- Tracking por serie con peso, reps, RIR y descanso.
- Temporizador automático de pausas.
- Rutinas versionadas: activa, borrador y archivadas.
- Importador de rutina por texto, TXT, DOCX y JSON.
- Biblioteca de ejercicios con aliases para no perder históricos al cambiar nombres.
- Reporte semanal completo.
- Registro de peso corporal.
- Exportación e importación de backup JSON.
- PWA básica con service worker y manifest.
- Firebase Auth por email/contraseña.
- Firestore con intento de caché local persistente y fallback automático.

## Tu proyecto Firebase ya cargado

Este proyecto ya viene conectado a:

- **projectId:** `gimnasio-f48a7`
- **authDomain:** `gimnasio-f48a7.firebaseapp.com`

Archivo ya preparado:

- `firebase-config.js`

## Lo que tienes que hacer en Firebase

1. Entra en **Authentication > Sign-in method** y activa **Email/Password**.
2. Entra en **Firestore Database** y crea la base de datos.
3. Abre **Firestore > Rules** y pega el contenido de `firestore.rules`.
4. Publica las reglas.
5. Sube esta carpeta a Firebase Hosting o a otro hosting estático.

## Estructura Firestore

- `users/{uid}/settings/app`
- `users/{uid}/exerciseLibrary/{exerciseId}`
- `users/{uid}/programs/{programId}`
- `users/{uid}/sessions/{sessionId}`
- `users/{uid}/reports/{reportId}`
- `users/{uid}/bodyMetrics/{metricId}`

## Archivos extra para despliegue

- `firebase.json`
- `.firebaserc`
- `firestore.rules`

## Despliegue rápido con Firebase CLI

```bash
npm install -g firebase-tools
firebase login
firebase deploy
```

Si no has vinculado antes la carpeta:

```bash
firebase use gimnasio-f48a7
firebase deploy
```

## Importador de rutinas

Acepta texto similar al del preparador. El sistema intenta detectar:

- Días y descansos
- Ejercicios
- Series x reps
- Notas de ejecución
- Core y gemelos
- Descanso y RIR si aparecen en el texto

También puedes subir un DOCX; el navegador lo leerá con Mammoth y generará vista previa.
