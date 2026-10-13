import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from './context'
import { isLoggedOutByUser } from './useLogout'

// 未ログインならログイン画面へ送る。ログイン後は元の URL に戻る
export function RequireAuth() {
  const { loading, user } = useAuth()
  const location = useLocation()

  if (loading) return <p className="page-message">読み込み中…</p>
  if (!user) {
    // 自分でログアウトしたときは、戻り先を付けない（次にログインする人が別のユーザーかもしれないため）
    if (isLoggedOutByUser()) return <Navigate to="/login" replace />
    const next = location.pathname + location.search
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />
  }
  return <Outlet />
}
