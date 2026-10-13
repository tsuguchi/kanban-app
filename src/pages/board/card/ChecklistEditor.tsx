import { useState, type FormEvent } from 'react'
import { CHECKLIST_ITEM_MAX_LENGTH } from '../../../lib/card'
import type { ChecklistItem } from '../../../types'

const CHECKLIST_MAX_ITEMS = 100

interface ChecklistEditorProps {
  items: ChecklistItem[]
  onSave: (items: ChecklistItem[]) => void
}

// チェックリスト（F-42）。項目の追加・完了・削除
export function ChecklistEditor({ items, onSave }: ChecklistEditorProps) {
  const [newItemText, setNewItemText] = useState('')
  const doneCount = items.filter((item) => item.done).length

  function handleAdd(event: FormEvent) {
    event.preventDefault()
    const text = newItemText.trim()
    if (!text) return
    onSave([...items, { id: crypto.randomUUID(), text, done: false }])
    setNewItemText('')
  }

  return (
    <div className="checklist">
      {items.length > 0 && (
        <div className="checklist-progress">
          <span>{doneCount}/{items.length}</span>
          <progress value={doneCount} max={items.length} aria-label="チェックリストの進捗" />
        </div>
      )}
      <ul className="checklist-items">
        {items.map((item) => (
          <li key={item.id}>
            <label className={item.done ? 'checklist-item-done' : undefined}>
              <input
                type="checkbox"
                checked={item.done}
                onChange={() => onSave(items.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)))}
              />
              {item.text}
            </label>
            <button
              type="button"
              className="button-icon"
              aria-label={`「${item.text}」を削除`}
              onClick={() => onSave(items.filter((i) => i.id !== item.id))}
            >
              削除
            </button>
          </li>
        ))}
      </ul>
      {items.length < CHECKLIST_MAX_ITEMS && (
        <form className="inline-form" onSubmit={handleAdd}>
          <input
            type="text"
            aria-label="チェックリストの項目"
            placeholder="項目を追加"
            value={newItemText}
            maxLength={CHECKLIST_ITEM_MAX_LENGTH}
            onChange={(event) => setNewItemText(event.target.value)}
          />
          <button type="submit" className="button-secondary" disabled={!newItemText.trim()}>追加</button>
        </form>
      )}
    </div>
  )
}
