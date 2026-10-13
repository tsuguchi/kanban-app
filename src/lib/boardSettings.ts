import { FirebaseError } from 'firebase/app'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Firestore,
} from 'firebase/firestore'
import type { Invite, Label, Role } from '../types'
import { deleteAll, purgeCardDoc, subcollectionRefs } from './purge'

// ボード設定（S-06）と招待への参加（S-07）のデータ操作

export const LABEL_NAME_MAX_LENGTH = 30
// 招待リンクの有効期限。firestore.rules の inviteLifetime() と同じ値にすること
export const INVITE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000

type Unsubscribe = () => void

function boardRef(db: Firestore, boardId: string) {
  return doc(db, 'boards', boardId)
}

// ---- ボード名・ラベル ----

export async function renameBoard(db: Firestore, boardId: string, name: string): Promise<void> {
  await updateDoc(boardRef(db, boardId), { name, updatedAt: serverTimestamp() })
}

// ラベルの定義をまとめて書き換える（F-50）。削除したラベルの ID はカードに残るが、表示時に無視する
export async function updateLabels(db: Firestore, boardId: string, labels: Label[]): Promise<void> {
  await updateDoc(boardRef(db, boardId), { labels, updatedAt: serverTimestamp() })
}

// ---- 招待リンク ----

export function inviteExpiresAt(invite: Pick<Invite, 'createdAt'>): Date {
  return new Date(invite.createdAt.getTime() + INVITE_LIFETIME_MS)
}

export function isInviteActive(invite: Pick<Invite, 'createdAt' | 'revoked'>, now: Date = new Date()): boolean {
  return !invite.revoked && inviteExpiresAt(invite) > now
}

export function inviteUrl(origin: string, boardId: string, inviteId: string): string {
  return `${origin}/invite/${boardId}/${inviteId}`
}

function toInvite(id: string, data: Record<string, unknown> | undefined): Invite | null {
  if (!data) return null
  return {
    id,
    boardName: data.boardName as string,
    createdAt: (data.createdAt as { toDate: () => Date }).toDate(),
    revoked: data.revoked as boolean,
  }
}

// 発行済みの招待リンクを新しい順に購読する（オーナーのみ）
export function subscribeInvites(
  db: Firestore,
  boardId: string,
  onChange: (invites: Invite[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(boardRef(db, boardId), 'invites'), orderBy('createdAt', 'desc')),
    (snapshot) => {
      onChange(snapshot.docs.flatMap((inviteDoc) =>
        toInvite(inviteDoc.id, inviteDoc.data({ serverTimestamps: 'estimate' })) ?? []))
    },
    onError,
  )
}

// 招待リンクを発行し、その ID を返す（F-20）
export async function createInvite(db: Firestore, boardId: string, uid: string, boardName: string): Promise<string> {
  const ref = await addDoc(collection(boardRef(db, boardId), 'invites'), {
    boardName,
    createdBy: uid,
    createdAt: serverTimestamp(),
    revoked: false,
  })
  return ref.id
}

export async function revokeInvite(db: Firestore, boardId: string, inviteId: string): Promise<void> {
  await updateDoc(doc(boardRef(db, boardId), 'invites', inviteId), { revoked: true })
}

// 招待リンクを 1 件読む。存在しなければ null
export async function getInvite(db: Firestore, boardId: string, inviteId: string): Promise<Invite | null> {
  const snapshot = await getDoc(doc(boardRef(db, boardId), 'invites', inviteId))
  return toInvite(snapshot.id, snapshot.data())
}

// 自分がボードのメンバーなら、そのロールを返す。メンバーでなければ null
export async function getMyRole(db: Firestore, boardId: string, uid: string): Promise<Role | null> {
  try {
    const snapshot = await getDoc(doc(boardRef(db, boardId), 'members', uid))
    return snapshot.exists() ? snapshot.data().role as Role : null
  } catch (error) {
    // メンバーでない人は、メンバー情報を読めない（権限エラーになる）
    if (error instanceof FirebaseError && error.code === 'permission-denied') return null
    throw error
  }
}

// 招待リンクでボードに参加する
export async function joinBoard(db: Firestore, boardId: string, uid: string, inviteId: string): Promise<void> {
  await setDoc(doc(boardRef(db, boardId), 'members', uid), {
    uid,
    role: 'member',
    inviteId,
    joinedAt: serverTimestamp(),
  })
}

// ---- メンバー ----

// オーナーがメンバーを外す、またはメンバーが自分でボードを抜ける（F-22）
export async function removeMember(db: Firestore, boardId: string, memberUid: string): Promise<void> {
  await deleteDoc(doc(boardRef(db, boardId), 'members', memberUid))
}

// ---- ボードの削除 ----

// ボード本体が消えたあとに、配下のデータを片付ける（DATA_MODEL.md §4）。
// 途中で失敗しても、もう一度呼べば続きから消せる
export async function purgeBoardContents(db: Firestore, boardId: string, ownerUid: string): Promise<void> {
  const board = boardRef(db, boardId)

  await deleteAll(await subcollectionRefs(board, 'invites'))

  for (const card of await subcollectionRefs(board, 'cards')) {
    await purgeCardDoc(card)
  }
  await deleteAll(await subcollectionRefs(board, 'columns'))

  // オーナー自身のメンバー情報は最後に消す。これが残っている間は、続きを消す権限がある
  const members = await subcollectionRefs(board, 'members')
  await deleteAll(members.filter((member) => member.id !== ownerUid))
  await deleteDoc(doc(board, 'members', ownerUid))
}

// ボードを削除する（F-13）。先にボード本体を消し、他のメンバーから見えなくしてから片付ける
export async function deleteBoard(db: Firestore, boardId: string, ownerUid: string): Promise<void> {
  await deleteDoc(boardRef(db, boardId))
  await purgeBoardContents(db, boardId, ownerUid)
}
