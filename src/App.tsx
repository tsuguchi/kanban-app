import { createBrowserRouter, RouterProvider } from 'react-router'
import { AuthProvider } from './auth/AuthProvider'
import { RequireAuth } from './auth/RequireAuth'
import { AppLayout } from './components/AppLayout'
import { AccountSettingsPage } from './pages/AccountSettingsPage'
import { BoardListPage } from './pages/BoardListPage'
import { BoardRoute } from './pages/board/BoardPage'
import { CardDetailRoute } from './pages/board/card/CardDetailModal'
import { LoginPage } from './pages/LoginPage'

// 未実装の画面の仮置き
function Placeholder({ title }: { title: string }) {
  return (
    <main className="page">
      <h1>{title}</h1>
      <p>この画面は未実装です。</p>
    </main>
  )
}

// 画面一覧は REQUIREMENTS.md §4.11 を参照
const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <BoardListPage /> },
          {
            path: '/b/:boardId',
            element: <BoardRoute />,
            children: [{ path: 'c/:cardId', element: <CardDetailRoute /> }],
          },
          { path: '/b/:boardId/settings', element: <Placeholder title="ボード設定" /> },
          { path: '/invite/:boardId/:inviteId', element: <Placeholder title="招待への参加" /> },
          { path: '/settings', element: <AccountSettingsPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <Placeholder title="ページが見つかりません" /> },
])

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  )
}
