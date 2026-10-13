import type { User } from 'firebase/auth'
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Firestore,
} from 'firebase/firestore'
import type { UserProfile } from '../types'

export const DISPLAY_NAME_MAX_LENGTH = 50

// 初回ログイン時に、OAuth プロバイダの情報からプロフィールを作る（F-04）
export async function ensureUserProfile(db: Firestore, user: User): Promise<void> {
  const ref = doc(db, 'users', user.uid)
  const snapshot = await getDoc(ref)
  if (snapshot.exists()) return

  const fallbackName = user.email?.split('@')[0] || 'ユーザー'
  await setDoc(ref, {
    displayName: (user.displayName || fallbackName).slice(0, DISPLAY_NAME_MAX_LENGTH),
    photoURL: user.photoURL,
    createdAt: serverTimestamp(),
  })
}

export function subscribeUserProfile(
  db: Firestore,
  uid: string,
  onChange: (profile: UserProfile | null) => void,
): () => void {
  return onSnapshot(
    doc(db, 'users', uid),
    (snapshot) => {
      const data = snapshot.data()
      onChange(data ? { displayName: data.displayName, photoURL: data.photoURL } : null)
    },
    (error) => console.error('プロフィールを読み込めませんでした', error),
  )
}

export async function updateDisplayName(db: Firestore, uid: string, displayName: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { displayName })
}
