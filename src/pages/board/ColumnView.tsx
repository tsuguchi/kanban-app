import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useState } from 'react'
import { CARD_TITLE_MAX_LENGTH, COLUMN_NAME_MAX_LENGTH } from '../../lib/board'
import type { BoardMember, Card, Column, Label } from '../../types'
import { CardTile } from './CardTile'
import { InlineTextForm } from './InlineTextForm'

interface ColumnViewProps {
  column: Column
  cards: Card[]
  labels: Label[]
  members: BoardMember[]
  onAddCard: (title: string) => void
  onRename: (name: string) => void
  onArchive: () => void
}

export function ColumnView({ column, cards, labels, members, onAddCard, onRename, onArchive }: ColumnViewProps) {
  const [renaming, setRenaming] = useState(false)
  const [addingCard, setAddingCard] = useState(false)
  // 追加したら入力欄を空にして、続けて次のカードを入力できるようにする
  const [addFormKey, setAddFormKey] = useState(0)
  const {
    attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging,
  } = useSortable({ id: `column:${column.id}` })

  function handleArchive() {
    if (window.confirm(`列「${column.name}」をアーカイブしますか？\n列の中のカードも表示されなくなります。アーカイブ一覧から元に戻せます。`)) {
      onArchive()
    }
  }

  return (
    <section
      ref={setNodeRef}
      className={isDragging ? 'column column-placeholder' : 'column'}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      aria-label={column.name}
    >
      <header className="column-header">
        {renaming ? (
          <InlineTextForm
            initialValue={column.name}
            placeholder="列の名前"
            submitLabel="保存"
            maxLength={COLUMN_NAME_MAX_LENGTH}
            onSubmit={(name) => {
              if (name !== column.name) onRename(name)
              setRenaming(false)
            }}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <>
            {/* 列はこの見出し部分をつかんで動かす */}
            <h2
              ref={setActivatorNodeRef}
              className="column-title"
              {...attributes}
              {...listeners}
              aria-roledescription="並べ替えできる列"
            >
              {column.name}
              <span className="column-count">{cards.length}</span>
            </h2>
            <div className="column-actions">
              <button type="button" className="button-icon" onClick={() => setRenaming(true)} title="列の名前を変更">
                名前変更
              </button>
              <button type="button" className="button-icon" onClick={handleArchive} title="列をアーカイブ">
                アーカイブ
              </button>
            </div>
          </>
        )}
      </header>

      <SortableContext items={cards.map((card) => `card:${card.id}`)} strategy={verticalListSortingStrategy}>
        <div className="column-cards">
          {cards.map((card) => <CardTile key={card.id} card={card} labels={labels} members={members} />)}
        </div>
      </SortableContext>

      {addingCard ? (
        <InlineTextForm
          key={addFormKey}
          placeholder="カードのタイトル"
          submitLabel="追加"
          maxLength={CARD_TITLE_MAX_LENGTH}
          multiline
          onSubmit={(title) => {
            onAddCard(title)
            setAddFormKey((key) => key + 1)
          }}
          onCancel={() => setAddingCard(false)}
        />
      ) : (
        <button type="button" className="add-button" onClick={() => setAddingCard(true)}>＋ カードを追加</button>
      )}
    </section>
  )
}
