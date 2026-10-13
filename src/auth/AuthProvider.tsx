import { onAuthStateChanged, type User } from 'firebase/auth'
import { useEffect, useState, type ReactNode } from 'react'
import { auth, db } from '../lib/firebase'
import { ensureUserProfile, subscribeUserProfile } from '../lib/users'
import type { UserProfile } from '../types'
import { AuthContext } from './context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  // どのユーザーのプロフィールかを一緒に持ち、ログアウトや切り替えの直後に前のユーザーの情報を出さない
  const [loadedProfile, setLoadedProfile] = useState<{ uid: string, profile: UserProfile | null } | null>(null)
  const profile = user && loadedProfile?.uid === user.uid ? loadedProfile.profile : null

  useEffect(() => {
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!user) return
    ensureUserProfile(db, user).catch((error) => console.error('プロフィールの作成に失敗しました', error))
    return subscribeUserProfile(db, user.uid, (nextProfile) => setLoadedProfile({ uid: user.uid, profile: nextProfile }))
  }, [user])

  return <AuthContext value={{ loading, user, profile }}>{children}</AuthContext>
}
