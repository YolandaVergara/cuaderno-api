import admin from 'firebase-admin';
import { logger } from './logger';

// Interface para las credenciales de Firebase
interface FirebaseCredentials {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
}

/**
 * Inicializa Firebase Admin SDK
 * Soporte para múltiples métodos de configuración:
 * 1. Variables de entorno individuales (recomendado para Railway)
 * 2. JSON de service account como string
 * 3. Archivo de service account
 */
function initializeFirebaseAdmin(): void {
  try {
    // Evitar inicialización múltiple
    if (admin.apps.length > 0) {
      logger.info('Firebase Admin already initialized');
      return;
    }

    let credential: admin.credential.Credential;

    // Método 1: Variables de entorno individuales (Railway)
    if (process.env.FIREBASE_PROJECT_ID && 
        process.env.FIREBASE_PRIVATE_KEY && 
        process.env.FIREBASE_CLIENT_EMAIL) {
      
      credential = admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      });

      logger.info('Firebase Admin initialized with environment variables');

    // Método 2: JSON como string de environment variable
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      
      const serviceAccount = JSON.parse(
        process.env.FIREBASE_SERVICE_ACCOUNT_JSON
      );
      credential = admin.credential.cert(serviceAccount as admin.ServiceAccount);

      logger.info('Firebase Admin initialized with service account JSON');

    // Método 3: Archivo local (solo para desarrollo)
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      
      credential = admin.credential.applicationDefault();
      logger.info('Firebase Admin initialized with application default credentials');

    } else {
      throw new Error('No Firebase credentials found. Please set FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, and FIREBASE_CLIENT_EMAIL environment variables.');
    }

    // Inicializar Firebase Admin
    admin.initializeApp({
      credential,
      projectId: process.env.FIREBASE_PROJECT_ID,
    });

    logger.info('Firebase Admin SDK initialized successfully', {
      projectId: process.env.FIREBASE_PROJECT_ID,
      appsCount: admin.apps.length
    });

  } catch (error) {
    logger.error('Failed to initialize Firebase Admin SDK', { error });
    throw error;
  }
}

/**
 * Obtiene la instancia de Firebase Admin Auth
 */
export function getFirebaseAuth(): admin.auth.Auth {
  if (admin.apps.length === 0) {
    initializeFirebaseAdmin();
  }
  return admin.auth();
}

/**
 * Obtiene la instancia de Firebase Admin Firestore
 */
export function getFirebaseFirestore(): admin.firestore.Firestore {
  if (admin.apps.length === 0) {
    initializeFirebaseAdmin();
  }
  return admin.firestore();
}

/**
 * Verifica un token de ID de Firebase
 */
export async function verifyFirebaseToken(idToken: string): Promise<admin.auth.DecodedIdToken> {
  try {
    const auth = getFirebaseAuth();
    const decodedToken = await auth.verifyIdToken(idToken);
    
    logger.debug('Firebase token verified successfully', {
      uid: decodedToken.uid,
      email: decodedToken.email,
    });

    return decodedToken;
  } catch (error) {
    logger.warn('Firebase token verification failed', { error });
    throw error;
  }
}

// Inicializar Firebase Admin al cargar el módulo
initializeFirebaseAdmin();

export { admin };
