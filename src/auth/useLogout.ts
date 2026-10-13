import { signOut } from 'firebase/auth'
import { auth } from '../lib/firebase'

// 自分でログアウトしたかどうか。true の間は、RequireAuth がログイン画面に戻り先（?next=）を付けない。
// 付けると、次に別のユーザーがログインしたときに、そのユーザーが参加していないボードが開いてしまう。
// ログアウトすると RequireAuth がすぐにログイン画面へ移すので、移動先はここではなく RequireAuth で決める
let loggedOutByUser = false

export function isLoggedOutByUser(): boolean {
  return loggedOutByUser
}

// 次に誰かがログインしたら、印を外す（AuthProvider から呼ぶ）
export function clearLoggedOutByUser(): void {
  loggedOutByUser = false
}

export function useLogout(): () => Promise<void> {
  return async () => {
    loggedOutByUser = true
    await signOut(auth)
  }
}
