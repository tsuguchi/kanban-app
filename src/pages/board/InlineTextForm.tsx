import { useState, type FormEvent, type KeyboardEvent } from 'react'

interface InlineTextFormProps {
  initialValue?: string
  placeholder: string
  submitLabel: string
  maxLength: number
  multiline?: boolean
  onSubmit: (value: string) => void
  onCancel: () => void
}

// 列名やカードのタイトルを、その場で入力するための小さなフォーム。
// Enter で確定、Esc で取り消し。複数行の入力欄でも Enter で確定し、改行は入れない（カードのタイトルは 1 行）
export function InlineTextForm(props: InlineTextFormProps) {
  const [value, setValue] = useState(props.initialValue ?? '')

  function submit(event?: FormEvent) {
    event?.preventDefault()
    const trimmed = value.trim()
    if (trimmed) props.onSubmit(trimmed)
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') props.onCancel()
    // 日本語入力の変換確定の Enter では送信しない
    if (props.multiline && event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.preventDefault()
      submit()
    }
  }

  const inputProps = {
    value,
    placeholder: props.placeholder,
    maxLength: props.maxLength,
    autoFocus: true,
    onChange: (event: { target: { value: string } }) => setValue(event.target.value),
    onKeyDown: handleKeyDown,
    'aria-label': props.placeholder,
  }

  return (
    <form className="inline-text-form" onSubmit={submit}>
      {props.multiline ? <textarea rows={2} {...inputProps} /> : <input type="text" {...inputProps} />}
      <div className="inline-text-form-actions">
        <button type="submit" className="button-primary" disabled={!value.trim()}>{props.submitLabel}</button>
        <button type="button" className="button-secondary" onClick={props.onCancel}>キャンセル</button>
      </div>
    </form>
  )
}
