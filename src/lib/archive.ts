import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore'
import { purgeCardDoc } from './purge'

// アーカイブ一覧（S-05）の操作。元に戻す（F-72）と完全削除（F-73）

// 列を元に戻す。列と一緒に表示されなくなっていたカードも、まとめて元の位置に戻る（F-72）
export async function restoreColumn(db: Firestore, boardId: string, columnId: string): Promise<void> {
  await updateDoc(doc(db, 'boards', boardId, 'columns', columnId), { archived: false, archivedAt: null })
}

// カードを元に戻し、変更履歴に記録する。戻し先の列と並び順は呼び出し側で決める
export async function restoreCard(
  db: Firestore,
  boardId: string,
  uid: string,
  cardId: string,
  to: { columnId: string, order: string },
): Promise<void> {
  const cardRef = doc(db, 'boards', boardId, 'cards', cardId)
  await writeBatch(db)
    .update(cardRef, {
      archived: false,
      archivedAt: null,
      columnId: to.columnId,
      order: to.order,
      updatedBy: uid,
      updatedAt: serverTimestamp(),
    })
    .set(doc(collection(cardRef, 'history')), {
      actorId: uid,
      type: 'restored',
      from: null,
      to: null,
      createdAt: serverTimestamp(),
    })
    .commit()
}

// アーカイブ済みのカードを、コメント・変更履歴ごと完全に削除する（オーナーのみ）
export async function purgeCard(db: Firestore, boardId: string, cardId: string): Promise<void> {
  await purgeCardDoc(doc(db, 'boards', boardId, 'cards', cardId))
}

// アーカイブ済みの列を、中のカードごと完全に削除する（オーナーのみ）。
// 途中で失敗しても、もう一度呼べば続きから消せる
export async function purgeColumn(db: Firestore, boardId: string, columnId: string): Promise<void> {
  const cards = await getDocs(query(collection(db, 'boards', boardId, 'cards'), where('columnId', '==', columnId)))
  for (const card of cards.docs) {
    await purgeCardDoc(card.ref)
  }
  await deleteDoc(doc(db, 'boards', boardId, 'columns', columnId))
}
