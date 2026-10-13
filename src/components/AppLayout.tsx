import { Link, Outlet } from 'react-router'
import { useAuth } from '../auth/context'
import { useLogout } from '../auth/useLogout'

// ログイン後の画面に共通するヘッダー
export function AppLayout() {
  const { user, profile } = useAuth()
  const logout = useLogout()
  const displayName = profile?.displayName ?? user?.displayName ?? ''

  return (
    <>
      <header className="app-header">
        <Link to="/" className="app-title">タスク管理ボード</Link>
        <nav className="app-header-menu">
          <Link to="/settings" className="app-header-user">
            {profile?.photoURL && <img src={profile.photoURL} alt="" className="avatar" />}
            {displayName}
          </Link>
          <button type="button" className="button-secondary" onClick={logout}>
            ログアウト
          </button>
        </nav>
      </header>
      <Outlet />
    </>
  )
}
