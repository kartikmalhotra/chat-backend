import { type App, type AppOptions, cert, getApps, initializeApp } from 'firebase-admin/app';
import { type Firestore, getFirestore } from 'firebase-admin/firestore';

import { env } from './env.js';
import { logger } from './logger.js';

const APP_NAME = 'chat-backend';

function resolveCredential(): Partial<AppOptions> {
  if (env.FIRESTORE_EMULATOR_HOST !== undefined) {
    logger.info({ host: env.FIRESTORE_EMULATOR_HOST }, 'Using Firestore emulator');
    return {};
  }

  if (env.FIREBASE_SERVICE_ACCOUNT_JSON !== undefined) {
    const parsed: unknown = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON must contain a service account object');
    }
    return { credential: cert(parsed) };
  }

  return {};
}

function getFirebaseApp(): App {
  const existing = getApps().find((app) => app.name === APP_NAME);
  if (existing) return existing;

  return initializeApp(
    {
      projectId: env.FIREBASE_PROJECT_ID,
      ...resolveCredential(),
    },
    APP_NAME,
  );
}

let firestore: Firestore | undefined;

export function getFirestoreClient(): Firestore {
  if (!firestore) {
    firestore =
      env.FIRESTORE_DATABASE_ID === '(default)'
        ? getFirestore(getFirebaseApp())
        : getFirestore(getFirebaseApp(), env.FIRESTORE_DATABASE_ID);
    firestore.settings({ ignoreUndefinedProperties: true });
  }
  return firestore;
}
