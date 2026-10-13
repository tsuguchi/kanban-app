import type { User } from 'firebase/auth'
import { createContext, useContext } from 'react'
import type { UserProfile } from '../types'

export interface AuthState {
  // 認証状態を確認中は true
  loading: boolean
  user: User | null
  // Firestore の users/{uid}。初回ログイン直後は作成されるまで null
  profile: UserProfile | null
}

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const state = useContext(AuthContext)
  if (!state) throw new Error('useAuth は AuthProvider の中で使ってください')
  return state
}
