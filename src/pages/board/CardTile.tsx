import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Link } from 'react-router'
import { Avatar } from '../../components/Avatar'
import { formatDueDate, isOverdue } from '../../lib/dates'
import type { BoardMember, Card, Label } from '../../types'

interface CardTileProps {
  card: Card
  labels: Label[]
  members: BoardMember[]
}

// ボード上のカードの表示（F-43、F-44）
export function CardTileContent({ card, labels, members }: CardTileProps) {
  const cardLabels = labels.filter((label) => card.labelIds.includes(label.id))
  const doneCount = card.checklist.filter((item) => item.done).length
  const overdue = isOverdue(card.dueDate)

  return (
    <>
      {cardLabels.length > 0 && (
        <div className="card-labels">
          {cardLabels.map((label) => (
            <span key={label.id} className="card-label" style={{ background: label.color }}>{label.name}</span>
          ))}
        </div>
      )}
      <Link to={`c/${card.id}`} className="card-title">{card.title}</Link>
      <div className="card-meta">
        {card.dueDate && (
          <span className={overdue ? 'card-due card-due-overdue' : 'card-due'}>
            {overdue ? '期限切れ ' : '期限 '}{formatDueDate(card.dueDate)}
          </span>
        )}
        {card.checklist.length > 0 && (
          <span className={doneCount === card.checklist.length ? 'card-checklist-done' : undefined}>
            ✓ {doneCount}/{card.checklist.length}
          </span>
        )}
        {card.commentCount > 0 && <span>コメント {card.commentCount}</span>}
        {card.assigneeIds.length > 0 && (
          <span className="card-assignees">
            {card.assigneeIds.map((uid) => {
              const member = members.find((m) => m.uid === uid)
              return member
                ? <Avatar key={uid} name={member.displayName} photoURL={member.photoURL} />
                : <Avatar key={uid} name="退出したメンバー" photoURL={null} departed />
            })}
          </span>
        )}
      </div>
    </>
  )
}

export function CardTile(props: CardTileProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `card:${props.card.id}`,
  })

  return (
    <div
      ref={setNodeRef}
      className={isDragging ? 'card card-placeholder' : 'card'}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      aria-roledescription="並べ替えできるカード"
    >
      <CardTileContent {...props} />
    </div>
  )
}
