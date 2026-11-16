import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, updatePassword } from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  doc,
  getDocFromServer,
  type Firestore,
} from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Secondary app for admin utility if needed
const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
export const secondaryAuth = getAuth(secondaryApp);

let dbInstance: Firestore;
try {
  dbInstance = initializeFirestore(
    app,
    { experimentalAutoDetectLongPolling: true },
    firebaseConfig.firestoreDatabaseId
  );
} catch {
  dbInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
}

export const db = dbInstance;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  const serialized = JSON.stringify(errInfo);
  console.error('Firestore Error: ', serialized);
  throw new Error(serialized);
}

export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'ping'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Please check your network / Firebase configuration.");
    }
    return false;
  }
}

void testConnection();

export { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, updatePassword };
