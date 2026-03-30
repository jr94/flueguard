import * as admin from 'firebase-admin';
import * as path from 'path';

export const initializeFirebaseAdmin = () => {
  if (admin.apps.length === 0) {
    // Si usas un path distinto, modifícalo abajo
    const serviceAccountPath = path.resolve(__dirname, '../../credentials/firebase-service-account.json');

    try {
      const serviceAccount = require(serviceAccountPath);

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log('Firebase Admin initialized successfully.');
    } catch (error) {
      console.warn('Failed to initialize Firebase Admin. Please place the service account JSON in credentials/firebase-service-account.json');
      // No re-lanzamos un error fatal para no romper la app en desarrollo/testing sin firebase
    }
  }
};
