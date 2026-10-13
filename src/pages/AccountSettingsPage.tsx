import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/context'
import { useLogout } from '../auth/useLogout'
import { db } from '../lib/firebase'
import { DISPLAY_NAME_MAX_LENGTH, updateDisplayName } from '../lib/users'

export function AccountSettingsPage() {
  const { user, profile } = useAuth()
  const logout = useLogout()
  // 入力を始めるまではプロフィールの値を表示する
  const [draftName, setDraftName] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const displayName = draftName ?? profile?.displayName ?? ''

  async function handleSave(event: FormEvent) {
    event.preventDefault()
    const name = displayName.trim()
    if (!user || !name) return

    setStatus('saving')
    try {
      await updateDisplayName(db, user.uid, name)
      setDraftName(null)
      setStatus('saved')
    } catch (error) {
      console.error(error)
      setStatus('error')
    }
  }

  return (
    <main className="page">
      <h1>アカウント設定</h1>

      <form className="stacked-form" onSubmit={handleSave}>
        <label htmlFor="display-name">表示名</label>
        <div className="inline-form">
          <input
            id="display-name"
            type="text"
            value={displayName}
            maxLength={DISPLAY_NAME_MAX_LENGTH}
            onChange={(event) => {
              setDraftName(event.target.value)
              setStatus('idle')
            }}
            disabled={!profile || status === 'saving'}
          />
          <button type="submit" className="button-primary" disabled={!displayName.trim() || status === 'saving'}>
            保存
          </button>
        </div>
        {status === 'saved' && <p className="success-message">保存しました。</p>}
        {status === 'error' && <p className="error-message" role="alert">保存できませんでした。もう一度お試しください。</p>}
      </form>

      <button type="button" className="button-secondary" onClick={logout}>
        ログアウト
      </button>
    </main>
  )
}
