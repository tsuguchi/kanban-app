import { FirebaseError } from 'firebase/app'
import {
  GithubAuthProvider,
  GoogleAuthProvider,
  linkWithCredential,
  signInWithPopup,
  type AuthCredential,
  type AuthProvider,
} from 'firebase/auth'
import { useState } from 'react'
import { Navigate, useSearchParams } from 'react-router'
import { useAuth } from '../auth/context'
import { auth } from '../lib/firebase'

const PROVIDERS = {
  google: { label: 'Google', create: (): AuthProvider => new GoogleAuthProvider(), credentialClass: GoogleAuthProvider },
  github: { label: 'GitHub', create: (): AuthProvider => new GithubAuthProvider(), credentialClass: GithubAuthProvider },
} as const

type ProviderId = keyof typeof PROVIDERS

// ログイン後の戻り先。外部サイトへ飛ばされないよう、サイト内のパスだけを受け付ける
function safeNextPath(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/'
}

export function LoginPage() {
  const { loading, user } = useAuth()
  const [searchParams] = useSearchParams()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 同じメールアドレスで別の方法を使ってログインしようとしたときの、つなぎ待ちのログイン情報（F-05）
  const [pendingLink, setPendingLink] = useState<{ credential: AuthCredential, label: string } | null>(null)

  if (loading) return <p className="page-message">読み込み中…</p>
  if (user && !busy) return <Navigate to={safeNextPath(searchParams.get('next'))} replace />

  async function signIn(providerId: ProviderId) {
    const provider = PROVIDERS[providerId]
    setBusy(true)
    setError(null)
    try {
      const result = await signInWithPopup(auth, provider.create())
      if (pendingLink) {
        await linkWithCredential(result.user, pendingLink.credential)
        setPendingLink(null)
      }
    } catch (caught) {
      if (!(caught instanceof FirebaseError)) throw caught
      switch (caught.code) {
        case 'auth/popup-closed-by-user':
        case 'auth/cancelled-popup-request':
          break
        case 'auth/account-exists-with-different-credential': {
          const credential = provider.credentialClass.credentialFromError(caught)
          if (credential) setPendingLink({ credential, label: provider.label })
          setError(
            'このメールアドレスは、別の方法ですでに登録されています。'
            + `前回使った方法でログインすると、${provider.label} のアカウントもつながり、次回からどちらでもログインできます。`,
          )
          break
        }
        case 'auth/popup-blocked':
          setError('ポップアップがブロックされました。ブラウザの設定でこのサイトのポップアップを許可してください。')
          break
        default:
          console.error(caught)
          setError('ログインに失敗しました。時間をおいてもう一度お試しください。')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login-page">
      <h1>カンバン</h1>
      <p>チームのタスクをボードで共有・管理します。</p>
      <div className="login-buttons">
        {(Object.keys(PROVIDERS) as ProviderId[]).map((providerId) => (
          <button
            key={providerId}
            type="button"
            className="button-primary"
            disabled={busy || pendingLink?.label === PROVIDERS[providerId].label}
            onClick={() => signIn(providerId)}
          >
            {PROVIDERS[providerId].label} でログイン
          </button>
        ))}
      </div>
      {error && <p className="error-message" role="alert">{error}</p>}
    </main>
  )
}
