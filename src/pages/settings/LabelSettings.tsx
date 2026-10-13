import { useState, type FormEvent } from 'react'
import { LABEL_NAME_MAX_LENGTH } from '../../lib/boardSettings'
import type { Label } from '../../types'

// ラベルの色。白い文字が読める濃さの色にしている
const LABEL_COLORS = [
  { value: '#cf222e', name: '赤' },
  { value: '#bc4c00', name: 'オレンジ' },
  { value: '#9a6700', name: '黄土' },
  { value: '#1a7f37', name: '緑' },
  { value: '#0969da', name: '青' },
  { value: '#8250df', name: '紫' },
  { value: '#bf3989', name: 'ピンク' },
  { value: '#57606a', name: 'グレー' },
]

const LABELS_MAX = 50

function LabelForm({ initial, submitLabel, onSubmit, onCancel }: {
  initial: { name: string, color: string }
  submitLabel: string
  onSubmit: (value: { name: string, color: string }) => void
  onCancel?: () => void
}) {
  const [name, setName] = useState(initial.name)
  const [color, setColor] = useState(initial.color)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onSubmit({ name: trimmed, color })
    setName(initial.name)
  }

  return (
    <form className="label-form" onSubmit={handleSubmit}>
      <input
        type="text"
        aria-label="ラベルの名前"
        placeholder="ラベルの名前"
        value={name}
        maxLength={LABEL_NAME_MAX_LENGTH}
        onChange={(event) => setName(event.target.value)}
      />
      <fieldset className="color-options">
        <legend className="visually-hidden">ラベルの色</legend>
        {LABEL_COLORS.map((option) => (
          <label key={option.value} className="color-option" title={option.name}>
            <input
              type="radio"
              name="label-color"
              value={option.value}
              checked={color === option.value}
              onChange={() => setColor(option.value)}
            />
            <span className="color-swatch" style={{ background: option.value }} aria-label={option.name} />
          </label>
        ))}
      </fieldset>
      <div className="inline-text-form-actions">
        <button type="submit" className="button-primary" disabled={!name.trim()}>{submitLabel}</button>
        {onCancel && <button type="button" className="button-secondary" onClick={onCancel}>キャンセル</button>}
      </div>
    </form>
  )
}

// ラベルの定義（F-50）。メンバーなら誰でも編集できる
export function LabelSettings({ labels, onSave }: { labels: Label[], onSave: (labels: Label[]) => void }) {
  const [editingId, setEditingId] = useState<string | null>(null)

  function handleDelete(label: Label) {
    if (window.confirm(`ラベル「${label.name}」を削除しますか？\nカードに付いているこのラベルも表示されなくなります。`)) {
      onSave(labels.filter((l) => l.id !== label.id))
    }
  }

  return (
    <>
      {labels.length === 0 && <p className="hint">ラベルはまだありません。</p>}
      <ul className="settings-list">
        {labels.map((label) => (
          <li key={label.id}>
            {editingId === label.id ? (
              <LabelForm
                initial={label}
                submitLabel="保存"
                onSubmit={(value) => {
                  onSave(labels.map((l) => (l.id === label.id ? { ...l, ...value } : l)))
                  setEditingId(null)
                }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <>
                <span className="card-label" style={{ background: label.color }}>{label.name}</span>
                <span className="settings-list-actions">
                  <button type="button" className="button-icon" onClick={() => setEditingId(label.id)}>編集</button>
                  <button type="button" className="button-icon" onClick={() => handleDelete(label)}>削除</button>
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
      {labels.length < LABELS_MAX && (
        <LabelForm
          initial={{ name: '', color: LABEL_COLORS[0].value }}
          submitLabel="ラベルを追加"
          onSubmit={(value) => onSave([...labels, { id: crypto.randomUUID(), ...value }])}
        />
      )}
    </>
  )
}
