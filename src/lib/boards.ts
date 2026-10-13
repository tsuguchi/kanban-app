import { FirebaseError } from 'firebase/app'
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

// 自分が参加しているボードの一覧を購読する（F-11）。ボード名の昇順で返す。
// ボード本体が消えてメンバー情報だけが残っているボード（削除が途中で止まったもの）のうち、
// 自分がオーナーのものは onOrphaned で知らせる。呼び出し側で片付けの続きを行う（DATA_MODEL.md §4）
export function subscribeMyBoards(
  db: Firestore,
  uid: string,
  onChange: (boards: BoardSummary[]) => void,
  onError: (error: Error) => void,
  onOrphaned?: (boardIds: string[]) => void,
): () => void {
  // 参加状況が立て続けに変わったとき、古い読み込み結果で上書きしないための番号
  let latestRequest = 0
  // 前回読み込んだ参加状況。変わっていなければ、ボードを読み直さない
  let latestMembershipKey: string | null = null

  return onSnapshot(
    query(collectionGroup(db, 'members'), where('uid', '==', uid)),
    // サーバーへの保存が確定したことも通知してもらう
    { includeMetadataChanges: true },
    (snapshot) => {
      // ボードを作った直後のメンバー情報は、サーバーへの保存が確定するまで使わない。
      // 確定前にボードを読みに行くと、サーバー側ではまだメンバーではないため、権限エラーになる
      const memberships = snapshot.docs
        .filter((memberDoc) => !memberDoc.metadata.hasPendingWrites)
        .map((memberDoc) => ({
          boardRef: memberDoc.ref.parent.parent!,
          role: memberDoc.data().role as Role,
        }))
      const membershipKey = memberships.map(({ boardRef, role }) => `${boardRef.id}:${role}`).sort().join(',')
      if (membershipKey === latestMembershipKey) return
      latestMembershipKey = membershipKey
      const request = ++latestRequest

      Promise.all(
        memberships.map(async ({ boardRef, role }) => {
          try {
            const board = await getDoc(boardRef)
            if (!board.exists()) return { id: boardRef.id, role, orphaned: true as const }
            return { id: board.id, name: board.data().name as string, role, orphaned: false as const }
          } catch (error) {
            // 読み込み中にメンバーから外された場合は、そのボードは表示しない
            if (error instanceof FirebaseError && error.code === 'permission-denied') return null
            throw error
          }
        }),
      )
        .then((results) => {
          if (request !== latestRequest) return
          const boards: BoardSummary[] = []
          const orphanedIds: string[] = []
          for (const result of results) {
            if (result === null) continue
            if (!result.orphaned) boards.push({ id: result.id, name: result.name, role: result.role })
            else if (result.role === 'owner') orphanedIds.push(result.id)
          }
          onChange(boards.sort((a, b) => a.name.localeCompare(b.name, 'ja')))
          if (orphanedIds.length > 0) onOrphaned?.(orphanedIds)
        })
        .catch((error) => {
          if (request === latestRequest) onError(error)
        })
    },
    onError,
  )
}
