import { generateNKeysBetween } from 'fractional-indexing'
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore'
import type { BoardSummary, Role } from '../types'

export const BOARD_NAME_MAX_LENGTH = 100

// 新しいボードに最初から作る列（F-32）
const DEFAULT_COLUMN_NAMES = ['未着手', '進行中', '完了']

// ボードを作成し、作成者をオーナーにする（F-10）。作成したボードの ID を返す
export async function createBoard(db: Firestore, uid: string, name: string): Promise<string> {
  const boardRef = doc(collection(db, 'boards'))

  // ボードとオーナー登録は、Security Rules の都合で同じバッチにする必要がある
  const boardBatch = writeBatch(db)
  boardBatch.set(boardRef, {
    name,
    ownerId: uid,
    labels: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  boardBatch.set(doc(boardRef, 'members', uid), {
    uid,
    role: 'owner',
    inviteId: null,
    joinedAt: serverTimestamp(),
  })
  await boardBatch.commit()

  // 列の作成はメンバー登録が済んでいることが前提なので、別のバッチにする
  const columnBatch = writeBatch(db)
  const orders = generateNKeysBetween(null, null, DEFAULT_COLUMN_NAMES.length)
  DEFAULT_COLUMN_NAMES.forEach((columnName, index) => {
    columnBatch.set(doc(collection(boardRef, 'columns')), {
      name: columnName,
      order: orders[index],
      archived: false,
      archivedAt: null,
    })
  })
  await columnBatch.commit()

  return boardRef.id
}

// 自分が参加しているボードの一覧を購読する（F-11）。ボード名の昇順で返す
export function subscribeMyBoards(
  db: Firestore,
  uid: string,
  onChange: (boards: BoardSummary[]) => void,
  onError: (error: Error) => void,
): () => void {
  // 参加状況が立て続けに変わったとき、古い読み込み結果で上書きしないための番号
  let latestRequest = 0

  return onSnapshot(
    query(collectionGroup(db, 'members'), where('uid', '==', uid)),
    (snapshot) => {
      const request = ++latestRequest
      const memberships = snapshot.docs.map((memberDoc) => ({
        boardRef: memberDoc.ref.parent.parent!,
        role: memberDoc.data().role as Role,
      }))

      Promise.all(
        memberships.map(async ({ boardRef, role }) => {
          const board = await getDoc(boardRef)
          // ボードの削除が途中で止まっていると、メンバー情報だけが残っている（DATA_MODEL.md §4）
          if (!board.exists()) return null
          return { id: board.id, name: board.data().name as string, role }
        }),
      )
        .then((boards) => {
          if (request !== latestRequest) return
          onChange(
            boards
              .filter((board) => board !== null)
              .sort((a, b) => a.name.localeCompare(b.name, 'ja')),
          )
        })
        .catch(onError)
    },
    onError,
  )
}
