import { createBrowserRouter, RouterProvider } from 'react-router'

// 画面一覧（REQUIREMENTS.md §4.11）に対応するルート。各画面はこれから実装する
function Placeholder({ title }: { title: string }) {
  return (
    <main>
      <h1>{title}</h1>
      <p>この画面は未実装です。</p>
    </main>
  )
}

const router = createBrowserRouter([
  { path: '/login', element: <Placeholder title="ログイン" /> },
  { path: '/', element: <Placeholder title="ボード一覧" /> },
  {
    path: '/b/:boardId',
    element: <Placeholder title="ボード" />,
    children: [{ path: 'c/:cardId', element: <Placeholder title="カード詳細" /> }],
  },
  { path: '/b/:boardId/settings', element: <Placeholder title="ボード設定" /> },
  { path: '/invite/:boardId/:inviteId', element: <Placeholder title="招待への参加" /> },
  { path: '/settings', element: <Placeholder title="アカウント設定" /> },
  { path: '*', element: <Placeholder title="ページが見つかりません" /> },
])

export default function App() {
  return <RouterProvider router={router} />
}
