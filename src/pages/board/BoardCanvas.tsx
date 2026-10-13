import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { useMemo, useRef, useState } from 'react'
import { useAuth } from '../../auth/context'
import {
  addCard,
  addColumn,
  archiveColumn,
  COLUMN_NAME_MAX_LENGTH,
  moveCard,
  moveColumn,
  renameColumn,
} from '../../lib/board'
import { db } from '../../lib/firebase'
import { compareByOrder, orderAt } from '../../lib/order'
import type { Board, BoardMember, Card, Column } from '../../types'
import { CardTileContent } from './CardTile'
import { ColumnView } from './ColumnView'
import { InlineTextForm } from './InlineTextForm'

interface BoardCanvasProps {
  board: Board
  columns: Column[]
  cards: Card[]
  members: BoardMember[]
  // 絞り込み（F-80〜F-83）。false を返したカードは表示しない
  cardFilter: (card: Card) => boolean
  onSaveError: () => void
}

// 列ごとのカード ID の並び
type Layout = Record<string, string[]>

type DragItem = { kind: 'card' | 'column', id: string }

// ドラッグ＆ドロップの ID は、カードと列を区別するために "card:" / "column:" を前に付ける
function parseDragId(id: UniqueIdentifier): DragItem {
  const [kind, ...rest] = String(id).split(':')
  return { kind: kind as DragItem['kind'], id: rest.join(':') }
}

function findColumnOf(layout: Layout, cardId: string): string | undefined {
  return Object.keys(layout).find((columnId) => layout[columnId].includes(cardId))
}

// 保存が終わるまでの間、画面に先に反映しておく移動先
type Pending<T> = Record<string, { value: T, token: number }>

const screenReaderInstructions = {
  draggable: 'スペースキーで持ち上げ、矢印キーで移動し、もう一度スペースキーで置きます。Esc キーで取り消します。',
}

export function BoardCanvas({ board, columns, cards, members, cardFilter, onSaveError }: BoardCanvasProps) {
  const { user } = useAuth()
  const uid = user!.uid
  const [pendingCards, setPendingCards] = useState<Pending<{ columnId: string, order: string }>>({})
  const [pendingColumns, setPendingColumns] = useState<Pending<string>>({})
  // カードをドラッグしている間だけ使う、仮の並び
  const [draftLayout, setDraftLayout] = useState<Layout | null>(null)
  const [activeItem, setActiveItem] = useState<DragItem | null>(null)
  const [addingColumn, setAddingColumn] = useState(false)
  const nextToken = useRef(0)

  const sensors = useSensors(
    // 少し動かしてからドラッグを始めることで、クリック（カードを開く）と区別する
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const visibleColumns = useMemo(
    () => columns
      .filter((column) => !column.archived)
      .map((column) => pendingColumns[column.id] ? { ...column, order: pendingColumns[column.id].value } : column)
      .sort(compareByOrder),
    [columns, pendingColumns],
  )

  const cardsById = useMemo(
    () => new Map(cards.map((card) => {
      const pending = pendingCards[card.id]
      return [card.id, pending ? { ...card, ...pending.value } : card]
    })),
    [cards, pendingCards],
  )

  // アーカイブ済みのカードと、アーカイブ済みの列のカードは表示しない（F-70、F-71）。
  // 絞り込みで隠したカードも含めた並びは、カードを末尾に追加するときの位置の計算に使う
  const unfilteredLayout = useMemo(() => {
    const layout: Layout = Object.fromEntries(visibleColumns.map((column) => [column.id, []]))
    const activeCards = [...cardsById.values()]
      .filter((card) => !card.archived && card.columnId in layout)
      .sort(compareByOrder)
    for (const card of activeCards) layout[card.columnId].push(card.id)
    return layout
  }, [visibleColumns, cardsById])

  const savedLayout = useMemo(
    () => Object.fromEntries(Object.entries(unfilteredLayout).map(([columnId, ids]) =>
      [columnId, ids.filter((id) => cardFilter(cardsById.get(id)!))])) as Layout,
    [unfilteredLayout, cardsById, cardFilter],
  )

  const layout = draftLayout ?? savedLayout
  const columnName = (columnId: string) => columns.find((column) => column.id === columnId)?.name ?? ''

  // ---- 保存 ----

  function withPending<T>(
    setPending: (update: (pending: Pending<T>) => Pending<T>) => void,
    id: string,
    value: T,
    save: () => Promise<void>,
  ) {
    const token = ++nextToken.current
    setPending((pending) => ({ ...pending, [id]: { value, token } }))
    save()
      .catch((error) => {
        console.error(error)
        onSaveError()
      })
      .finally(() => {
        // 保存が終われば Firestore の内容に反映されているので、仮の値を外す。
        // 同じものを続けて動かしたときは、後の操作の仮の値を残す
        setPending((pending) => {
          if (pending[id]?.token !== token) return pending
          const { [id]: _removed, ...rest } = pending
          return rest
        })
      })
  }

  function commitCardMove(card: Card, toColumnId: string, toList: string[]) {
    const index = toList.indexOf(card.id)
    const others = toList.filter((id) => id !== card.id).map((id) => cardsById.get(id)!)
    const order = orderAt(others, index)
    const toColumn = visibleColumns.find((column) => column.id === toColumnId)!
    withPending(setPendingCards, card.id, { columnId: toColumnId, order }, () =>
      moveCard(db, board.id, uid, card, { toColumn, fromColumnName: columnName(card.columnId), order }))
  }

  function commitColumnMove(columnId: string, toIndex: number) {
    const others = visibleColumns.filter((column) => column.id !== columnId)
    const order = orderAt(others, toIndex)
    withPending(setPendingColumns, columnId, order, () => moveColumn(db, board.id, columnId, order))
  }

  function save(action: Promise<void>) {
    action.catch((error) => {
      console.error(error)
      onSaveError()
    })
  }

  // ---- ドラッグ＆ドロップ ----

  function handleDragStart({ active }: DragStartEvent) {
    const item = parseDragId(active.id)
    setActiveItem(item)
    if (item.kind === 'card') setDraftLayout(savedLayout)
  }

  // カードを別の列の上に持っていったら、その場で仮の並びを入れ替える
  function handleDragOver({ active, over }: DragOverEvent) {
    const item = parseDragId(active.id)
    if (item.kind !== 'card' || !over) return

    setDraftLayout((current) => {
      const base = current ?? savedLayout
      const target = parseDragId(over.id)
      const fromColumnId = findColumnOf(base, item.id)
      const toColumnId = target.kind === 'column' ? target.id : findColumnOf(base, target.id)
      if (!fromColumnId || !toColumnId || fromColumnId === toColumnId) return current

      const toList = [...base[toColumnId]]
      let insertAt = toList.length
      if (target.kind === 'card') {
        const translated = active.rect.current.translated
        const isBelowTarget = translated !== null && translated.top > over.rect.top + over.rect.height / 2
        insertAt = toList.indexOf(target.id) + (isBelowTarget ? 1 : 0)
      }
      toList.splice(insertAt, 0, item.id)
      return {
        ...base,
        [fromColumnId]: base[fromColumnId].filter((id) => id !== item.id),
        [toColumnId]: toList,
      }
    })
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    const item = parseDragId(active.id)
    const currentLayout = draftLayout ?? savedLayout
    setActiveItem(null)
    setDraftLayout(null)
    if (!over) return
    const target = parseDragId(over.id)

    if (item.kind === 'column') {
      const targetColumnId = target.kind === 'column' ? target.id : findColumnOf(currentLayout, target.id)
      const fromIndex = visibleColumns.findIndex((column) => column.id === item.id)
      const toIndex = visibleColumns.findIndex((column) => column.id === targetColumnId)
      if (toIndex >= 0 && fromIndex !== toIndex) commitColumnMove(item.id, toIndex)
      return
    }

    const card = cardsById.get(item.id)
    const toColumnId = findColumnOf(currentLayout, item.id)
    if (!card || !toColumnId) return

    let toList = currentLayout[toColumnId]
    if (target.kind === 'card' && target.id !== item.id && toList.includes(target.id)) {
      toList = arrayMove(toList, toList.indexOf(item.id), toList.indexOf(target.id))
    }
    const unchanged = card.columnId === toColumnId
      && savedLayout[toColumnId].indexOf(item.id) === toList.indexOf(item.id)
    if (!unchanged) commitCardMove(card, toColumnId, toList)
  }

  function handleDragCancel() {
    setActiveItem(null)
    setDraftLayout(null)
  }

  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      const item = parseDragId(active.id)
      return item.kind === 'card'
        ? `カード「${cardsById.get(item.id)?.title}」を持ち上げました。`
        : `列「${columnName(item.id)}」を持ち上げました。`
    },
    onDragOver: ({ over }) => over ? '移動しています。' : 'ドロップできる場所の外です。',
    onDragEnd: ({ over }) => over ? '置きました。' : '移動を取り消しました。',
    onDragCancel: () => '移動を取り消しました。',
  }

  const activeCard = activeItem?.kind === 'card' ? cardsById.get(activeItem.id) : undefined
  const activeColumn = activeItem?.kind === 'column' ? visibleColumns.find((c) => c.id === activeItem.id) : undefined

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
      accessibility={{ announcements, screenReaderInstructions }}
    >
      <div className="board-canvas">
        <SortableContext items={visibleColumns.map((column) => `column:${column.id}`)} strategy={horizontalListSortingStrategy}>
          {visibleColumns.map((column) => (
            <ColumnView
              key={column.id}
              column={column}
              cards={layout[column.id].map((id) => cardsById.get(id)!)}
              labels={board.labels}
              members={members}
              onAddCard={(title) => {
                const columnCards = unfilteredLayout[column.id].map((id) => cardsById.get(id)!)
                save(addCard(db, board.id, uid, column.id, title, orderAt(columnCards, columnCards.length)))
              }}
              onRename={(name) => save(renameColumn(db, board.id, column.id, name))}
              onArchive={() => save(archiveColumn(db, board.id, column.id))}
            />
          ))}
        </SortableContext>

        <div className="column column-new">
          {addingColumn ? (
            <InlineTextForm
              placeholder="列の名前"
              submitLabel="追加"
              maxLength={COLUMN_NAME_MAX_LENGTH}
              onSubmit={(name) => {
                save(addColumn(db, board.id, name, orderAt(visibleColumns, visibleColumns.length)))
                setAddingColumn(false)
              }}
              onCancel={() => setAddingColumn(false)}
            />
          ) : (
            <button type="button" className="add-button" onClick={() => setAddingColumn(true)}>＋ 列を追加</button>
          )}
        </div>
      </div>

      <DragOverlay>
        {activeCard && (
          <div className="card card-overlay">
            <CardTileContent card={activeCard} labels={board.labels} members={members} />
          </div>
        )}
        {activeColumn && (
          <div className="column column-overlay">
            <h2 className="column-title">{activeColumn.name}</h2>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
