import { useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router'
import { Avatar } from '../../../components/Avatar'
import { CARD_DESCRIPTION_MAX_LENGTH } from '../../../lib/card'
import { CARD_TITLE_MAX_LENGTH } from '../../../lib/board'
import type { BoardMember, Label } from '../../../types'

// カード詳細の各項目の編集部品。保存の方法と変更履歴の書き方は CardDetailModal が決める

// モーダルの中の入力欄で Esc を押したとき、モーダルまで閉じないようにする
function cancelOnEscape(event: KeyboardEvent, cancel: () => void) {
  if (event.key === 'Escape') {
    event.preventDefault()
    cancel()
  }
}

export function TitleEditor({ title, onSave }: { title: string, onSave: (title: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  // 確定は blur のときだけ行う。Enter は blur を起こすだけにして、保存が 2 回走らないようにする
  const cancelled = useRef(false)

  function handleBlur() {
    const trimmed = draft?.trim()
    if (!cancelled.current && trimmed && trimmed !== title) onSave(trimmed)
    setDraft(null)
  }

  if (draft === null) {
    return (
      <h2 className="card-detail-title">
        <button
          type="button"
          className="text-button"
          title="タイトルを編集"
          onClick={() => {
            cancelled.current = false
            setDraft(title)
          }}
        >
          {title}
        </button>
      </h2>
    )
  }
  return (
    <input
      type="text"
      className="card-detail-title-input"
      aria-label="タイトル"
      value={draft}
      maxLength={CARD_TITLE_MAX_LENGTH}
      autoFocus
      onChange={(event) => setDraft(event.target.value)}
      onBlur={handleBlur}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.nativeEvent.isComposing) event.currentTarget.blur()
        cancelOnEscape(event, () => {
          cancelled.current = true
          setDraft(null)
        })
      }}
    />
  )
}

export function DescriptionEditor({ description, onSave }: { description: string, onSave: (description: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null)

  if (draft === null) {
    return description
      ? (
        <div className="card-description">
          <p className="pre-wrap">{description}</p>
          <button type="button" className="button-secondary" onClick={() => setDraft(description)}>編集</button>
        </div>
      )
      : <button type="button" className="add-button" onClick={() => setDraft('')}>＋ 説明を追加</button>
  }
  return (
    <div className="card-description">
      <textarea
        aria-label="説明"
        rows={6}
        value={draft}
        maxLength={CARD_DESCRIPTION_MAX_LENGTH}
        autoFocus
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => cancelOnEscape(event, () => setDraft(null))}
      />
      <div className="inline-text-form-actions">
        <button
          type="button"
          className="button-primary"
          onClick={() => {
            if (draft !== description) onSave(draft)
            setDraft(null)
          }}
        >
          保存
        </button>
        <button type="button" className="button-secondary" onClick={() => setDraft(null)}>キャンセル</button>
      </div>
    </div>
  )
}

// "YYYY-MM-DD" の形式か。ブラウザの日付欄は年を 6 桁まで受け付けるため、保存前に確かめる
const DATE_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/

export function DueDateEditor({ dueDate, onSave }: { dueDate: string | null, onSave: (dueDate: string | null) => void }) {
  // キーボードで年を打つと 1 文字ごとに change が起きるので、確定は blur のときに行う
  const [draft, setDraft] = useState<string | null>(null)
  const [invalid, setInvalid] = useState(false)

  function handleBlur() {
    if (draft !== null) {
      const next = draft || null
      const valid = next === null || DATE_PATTERN.test(next)
      setInvalid(!valid)
      if (valid && next !== dueDate) onSave(next)
    }
    setDraft(null)
  }

  return (
    <>
      <div className="inline-form">
        <input
          type="date"
          aria-label="期限"
          min="2000-01-01"
          max="2099-12-31"
          value={draft ?? dueDate ?? ''}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={handleBlur}
        />
        {dueDate && <button type="button" className="button-icon" onClick={() => onSave(null)}>期限をなしにする</button>}
      </div>
      {invalid && <p className="error-message hint" role="alert">日付の形式が正しくないため、保存しませんでした。</p>}
    </>
  )
}

interface AssigneePickerProps {
  assigneeIds: string[]
  members: BoardMember[]
  onSave: (assigneeIds: string[]) => void
}

export function AssigneePicker({ assigneeIds, members, onSave }: AssigneePickerProps) {
  // ボードを抜けたメンバーが担当者に残っていれば、外せるように表示する
  const departedIds = assigneeIds.filter((uid) => !members.some((member) => member.uid === uid))

  function toggle(uid: string) {
    onSave(assigneeIds.includes(uid) ? assigneeIds.filter((id) => id !== uid) : [...assigneeIds, uid])
  }

  return (
    <ul className="picker-list">
      {members.map((member) => (
        <li key={member.uid}>
          <label>
            <input type="checkbox" checked={assigneeIds.includes(member.uid)} onChange={() => toggle(member.uid)} />
            <Avatar name={member.displayName} photoURL={member.photoURL} />
            {member.displayName}
          </label>
        </li>
      ))}
      {departedIds.map((uid) => (
        <li key={uid}>
          <label>
            <input type="checkbox" checked onChange={() => toggle(uid)} />
            <Avatar name="退出したメンバー" photoURL={null} departed />
            退出したメンバー
          </label>
        </li>
      ))}
    </ul>
  )
}

interface LabelPickerProps {
  boardId: string
  labelIds: string[]
  labels: Label[]
  onSave: (labelIds: string[]) => void
}

export function LabelPicker({ boardId, labelIds, labels, onSave }: LabelPickerProps) {
  if (labels.length === 0) {
    return <p className="hint">ラベルは <Link to={`/b/${boardId}/settings`}>ボード設定</Link> で作成できます。</p>
  }

  function toggle(labelId: string) {
    onSave(labelIds.includes(labelId) ? labelIds.filter((id) => id !== labelId) : [...labelIds, labelId])
  }

  return (
    <ul className="picker-list">
      {labels.map((label) => (
        <li key={label.id}>
          <label>
            <input type="checkbox" checked={labelIds.includes(label.id)} onChange={() => toggle(label.id)} />
            <span className="card-label" style={{ background: label.color }}>{label.name}</span>
          </label>
        </li>
      ))}
    </ul>
  )
}
