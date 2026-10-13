import {
  collection,
  doc,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore'
import type { Card, CardComment, HistoryEntry, HistoryType } from '../types'

// カード詳細（S-04）のデータの購読と更新

export const CARD_DESCRIPTION_MAX_LENGTH = 10000
export const CHECKLIST_ITEM_MAX_LENGTH = 200
export const COMMENT_MAX_LENGTH = 5000

type Unsubscribe = () => void

export type EditableCardFields = Partial<Pick<Card, 'title' | 'description' | 'dueDate' | 'assigneeIds' | 'labelIds' | 'checklist'>>

export interface HistoryRecord {
  type: HistoryType
  from: Record<string, unknown> | null
  to: Record<string, unknown> | null
}

function cardRef(db: Firestore, boardId: string, cardId: string) {
  return doc(db, 'boards', boardId, 'cards', cardId)
}

// カードの項目を更新する。変更履歴に残す操作は、同じバッチで履歴も書く（F-90、F-92）
export async function updateCard(
  db: Firestore,
  boardId: string,
  uid: string,
  cardId: string,
  fields: EditableCardFields,
  history?: HistoryRecord,
): Promise<void> {
  const ref = cardRef(db, boardId, cardId)
  const batch = writeBatch(db).update(ref, {
    ...fields,
    updatedBy: uid,
    updatedAt: serverTimestamp(),
  })
  if (history) {
    batch.set(doc(collection(ref, 'history')), {
      actorId: uid,
      ...history,
      createdAt: serverTimestamp(),
    })
  }
  await batch.commit()
}

// カードをアーカイブする（F-70）。元に戻すのはアーカイブ一覧（S-05）から
export async function archiveCard(db: Firestore, boardId: string, uid: string, cardId: string): Promise<void> {
  const ref = cardRef(db, boardId, cardId)
  await writeBatch(db)
    .update(ref, {
      archived: true,
      archivedAt: serverTimestamp(),
      updatedBy: uid,
      updatedAt: serverTimestamp(),
    })
    .set(doc(collection(ref, 'history')), {
      actorId: uid,
      type: 'archived',
      from: null,
      to: null,
      createdAt: serverTimestamp(),
    })
    .commit()
}

// ---- コメント ----

export function subscribeComments(
  db: Firestore,
  boardId: string,
  cardId: string,
  onChange: (comments: CardComment[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(cardRef(db, boardId, cardId), 'comments'), orderBy('createdAt')),
    (snapshot) => {
      onChange(snapshot.docs.map((commentDoc) => {
        // 投稿直後はサーバー時刻が未確定なので、見込みの時刻を使う
        const data = commentDoc.data({ serverTimestamps: 'estimate' })
        return {
          id: commentDoc.id,
          authorId: data.authorId,
          body: data.body,
          createdAt: data.createdAt.toDate(),
          edited: data.updatedAt !== null,
        }
      }))
    },
    onError,
  )
}

// コメントを投稿し、カードのコメント数を 1 増やす
export async function addComment(db: Firestore, boardId: string, uid: string, cardId: string, body: string): Promise<void> {
  const ref = cardRef(db, boardId, cardId)
  await writeBatch(db)
    .set(doc(collection(ref, 'comments')), {
      authorId: uid,
      body,
      createdAt: serverTimestamp(),
      updatedAt: null,
    })
    .update(ref, { commentCount: increment(1), updatedBy: uid, updatedAt: serverTimestamp() })
    .commit()
}

export async function editComment(
  db: Firestore,
  boardId: string,
  cardId: string,
  commentId: string,
  body: string,
): Promise<void> {
  await updateDoc(doc(cardRef(db, boardId, cardId), 'comments', commentId), {
    body,
    updatedAt: serverTimestamp(),
  })
}

// コメントを削除し、カードのコメント数を 1 減らす
export async function deleteComment(
  db: Firestore,
  boardId: string,
  uid: string,
  cardId: string,
  commentId: string,
): Promise<void> {
  const ref = cardRef(db, boardId, cardId)
  await writeBatch(db)
    .delete(doc(ref, 'comments', commentId))
    .update(ref, { commentCount: increment(-1), updatedBy: uid, updatedAt: serverTimestamp() })
    .commit()
}

// ---- 変更履歴 ----

export function subscribeHistory(
  db: Firestore,
  boardId: string,
  cardId: string,
  onChange: (entries: HistoryEntry[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(cardRef(db, boardId, cardId), 'history'), orderBy('createdAt', 'desc')),
    (snapshot) => {
      onChange(snapshot.docs.map((historyDoc) => {
        const data = historyDoc.data({ serverTimestamps: 'estimate' })
        return {
          id: historyDoc.id,
          actorId: data.actorId,
          type: data.type,
          from: data.from,
          to: data.to,
          createdAt: data.createdAt.toDate(),
        }
      }))
    },
    onError,
  )
}

function quote(value: unknown): string {
  return value === null || value === undefined || value === '' ? 'なし' : `「${String(value)}」`
}

function quoteNames(value: unknown): string {
  return quote(Array.isArray(value) ? value.join('、') : null)
}

// 変更履歴を、画面に表示する文章にする
export function describeHistory(entry: Pick<HistoryEntry, 'type' | 'from' | 'to'>): string {
  const from = entry.from ?? {}
  const to = entry.to ?? {}
  switch (entry.type) {
    case 'created':
      return 'カードを作成しました'
    case 'archived':
      return 'カードをアーカイブしました'
    case 'restored':
      return 'カードを元に戻しました'
    case 'moved':
      return `${quote(from.columnName)}から${quote(to.columnName)}に移動しました`
    case 'title_changed':
      return `タイトルを${quote(from.title)}から${quote(to.title)}に変更しました`
    case 'due_changed':
      return `期限を${quote(from.dueDate)}から${quote(to.dueDate)}に変更しました`
    case 'assignees_changed':
      return `担当者を${quoteNames(from.names)}から${quoteNames(to.names)}に変更しました`
    case 'labels_changed':
      return `ラベルを${quoteNames(from.names)}から${quoteNames(to.names)}に変更しました`
  }
}
