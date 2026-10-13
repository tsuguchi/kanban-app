import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore'
import type { Board, BoardMember, Card, Column, Role } from '../types'

// ボード画面（S-03）のデータの購読と更新

export const COLUMN_NAME_MAX_LENGTH = 100
export const CARD_TITLE_MAX_LENGTH = 200

type Unsubscribe = () => void

export function subscribeBoard(
  db: Firestore,
  boardId: string,
  onChange: (board: Board | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'boards', boardId),
    (snapshot) => {
      const data = snapshot.data()
      onChange(data ? { id: snapshot.id, name: data.name, ownerId: data.ownerId, labels: data.labels } : null)
    },
    onError,
  )
}

export function subscribeColumns(
  db: Firestore,
  boardId: string,
  onChange: (columns: Column[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, 'boards', boardId, 'columns'),
    (snapshot) => {
      onChange(snapshot.docs.map((columnDoc) => {
        const data = columnDoc.data()
        return { id: columnDoc.id, name: data.name, order: data.order, archived: data.archived }
      }))
    },
    onError,
  )
}

export function subscribeCards(
  db: Firestore,
  boardId: string,
  onChange: (cards: Card[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, 'boards', boardId, 'cards'),
    (snapshot) => {
      onChange(snapshot.docs.map((cardDoc) => {
        const data = cardDoc.data()
        return {
          id: cardDoc.id,
          columnId: data.columnId,
          order: data.order,
          title: data.title,
          description: data.description,
          dueDate: data.dueDate,
          assigneeIds: data.assigneeIds,
          labelIds: data.labelIds,
          checklist: data.checklist,
          commentCount: data.commentCount,
          archived: data.archived,
        }
      }))
    },
    onError,
  )
}

// メンバーと、その表示名・アイコンを購読する。オーナーが先頭で、あとは表示名の順
export function subscribeMembers(
  db: Firestore,
  boardId: string,
  onChange: (members: BoardMember[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  let latestRequest = 0
  return onSnapshot(
    collection(db, 'boards', boardId, 'members'),
    (snapshot) => {
      const request = ++latestRequest
      Promise.all(snapshot.docs.map(async (memberDoc) => {
        const uid = memberDoc.id
        const profile = (await getDoc(doc(db, 'users', uid))).data()
        return {
          uid,
          role: memberDoc.data().role as Role,
          displayName: profile?.displayName ?? '（名前未設定）',
          photoURL: profile?.photoURL ?? null,
        }
      }))
        .then((members) => {
          if (request !== latestRequest) return
          // オーナーを先頭に、あとは表示名の順に並べる
          onChange(members.sort((a, b) =>
            a.role !== b.role ? (a.role === 'owner' ? -1 : 1) : a.displayName.localeCompare(b.displayName, 'ja')))
        })
        .catch(onError)
    },
    onError,
  )
}

// ---- 列 ----

export async function addColumn(db: Firestore, boardId: string, name: string, order: string): Promise<void> {
  await setDoc(doc(collection(db, 'boards', boardId, 'columns')), {
    name,
    order,
    archived: false,
    archivedAt: null,
  })
}

export async function renameColumn(db: Firestore, boardId: string, columnId: string, name: string): Promise<void> {
  await updateDoc(doc(db, 'boards', boardId, 'columns', columnId), { name })
}

export async function moveColumn(db: Firestore, boardId: string, columnId: string, order: string): Promise<void> {
  await updateDoc(doc(db, 'boards', boardId, 'columns', columnId), { order })
}

// 列をアーカイブする（F-70、F-71）。列内のカードは書き換えず、表示しないだけにする
export async function archiveColumn(db: Firestore, boardId: string, columnId: string): Promise<void> {
  await updateDoc(doc(db, 'boards', boardId, 'columns', columnId), {
    archived: true,
    archivedAt: serverTimestamp(),
  })
}

// ---- カード ----

// カードを作成し、変更履歴に「作成」を記録する
export async function addCard(
  db: Firestore,
  boardId: string,
  uid: string,
  columnId: string,
  title: string,
  order: string,
): Promise<void> {
  const cardRef = doc(collection(db, 'boards', boardId, 'cards'))
  await writeBatch(db)
    .set(cardRef, {
      columnId,
      order,
      title,
      description: '',
      dueDate: null,
      assigneeIds: [],
      labelIds: [],
      checklist: [],
      commentCount: 0,
      archived: false,
      archivedAt: null,
      createdBy: uid,
      createdAt: serverTimestamp(),
      updatedBy: uid,
      updatedAt: serverTimestamp(),
    })
    .set(doc(collection(cardRef, 'history')), {
      actorId: uid,
      type: 'created',
      from: null,
      to: null,
      createdAt: serverTimestamp(),
    })
    .commit()
}

// カードを動かす。別の列に移したときは、変更履歴に移動元と移動先の列名を記録する（F-90）
export async function moveCard(
  db: Firestore,
  boardId: string,
  uid: string,
  card: Card,
  move: { toColumn: Column, fromColumnName: string, order: string },
): Promise<void> {
  const cardRef = doc(db, 'boards', boardId, 'cards', card.id)
  const batch = writeBatch(db).update(cardRef, {
    columnId: move.toColumn.id,
    order: move.order,
    updatedBy: uid,
    updatedAt: serverTimestamp(),
  })
  if (card.columnId !== move.toColumn.id) {
    batch.set(doc(collection(cardRef, 'history')), {
      actorId: uid,
      type: 'moved',
      from: { columnName: move.fromColumnName },
      to: { columnName: move.toColumn.name },
      createdAt: serverTimestamp(),
    })
  }
  await batch.commit()
}
