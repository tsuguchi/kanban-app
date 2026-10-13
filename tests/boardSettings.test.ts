import { readFileSync } from 'node:fs'
import { assertFails, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, collectionGroup, deleteDoc, doc, getDoc, getDocs, setDoc, Timestamp, type Firestore } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { addCard } from '../src/lib/board'
import {
  createInvite,
  deleteBoard,
  getInvite,
  getMyRole,
  INVITE_LIFETIME_MS,
  isInviteActive,
  joinBoard,
  purgeBoardContents,
  removeMember,
  renameBoard,
  revokeInvite,
  updateLabels,
} from '../src/lib/boardSettings'
import { createBoard, subscribeMyBoards } from '../src/lib/boards'
import { addComment } from '../src/lib/card'
import { orderAt } from '../src/lib/order'

// ボード設定（S-06）と招待への参加（S-07）のデータ操作を、本番と同じ Security Rules の下で確かめる

let env: RulesTestEnvironment

function dbAs(uid: string): Firestore {
  return env.authenticatedContext(uid).firestore() as unknown as Firestore
}

async function asAdmin<T>(run: (db: Firestore) => Promise<T>): Promise<T> {
  let result: T | undefined
  await env.withSecurityRulesDisabled(async (context) => {
    result = await run(context.firestore() as unknown as Firestore)
  })
  return result as T
}

// alice のボードに、bob が招待リンクで参加した状態を作る
async function setupBoardWithBob() {
  const boardId = await createBoard(dbAs('alice'), 'alice', 'チームのボード')
  const inviteId = await createInvite(dbAs('alice'), boardId, 'alice', 'チームのボード')
  await joinBoard(dbAs('bob'), boardId, 'bob', inviteId)
  return { boardId, inviteId }
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-kanban',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  })
})

beforeEach(async () => {
  await env.clearFirestore()
})

afterAll(async () => {
  await env.cleanup()
})

describe('招待リンク', () => {
  test('リンクを受け取った人は、参加前にボード名を確認でき、参加するとメンバーになる', async () => {
    const boardId = await createBoard(dbAs('alice'), 'alice', 'チームのボード')
    const inviteId = await createInvite(dbAs('alice'), boardId, 'alice', 'チームのボード')

    const bob = dbAs('bob')
    expect(await getMyRole(bob, boardId, 'bob')).toBeNull()
    const invite = await getInvite(bob, boardId, inviteId)
    expect(invite).toMatchObject({ boardName: 'チームのボード', revoked: false })
    expect(isInviteActive(invite!)).toBe(true)

    await joinBoard(bob, boardId, 'bob', inviteId)
    expect(await getMyRole(bob, boardId, 'bob')).toBe('member')
    expect(await getMyRole(dbAs('alice'), boardId, 'alice')).toBe('owner')
  })

  test('存在しない招待リンクは null を返す', async () => {
    const boardId = await createBoard(dbAs('alice'), 'alice', 'ボード')
    expect(await getInvite(dbAs('bob'), boardId, 'no-such-invite')).toBeNull()
  })

  test('無効にした招待リンクでは参加できない', async () => {
    const boardId = await createBoard(dbAs('alice'), 'alice', 'ボード')
    const inviteId = await createInvite(dbAs('alice'), boardId, 'alice', 'ボード')
    await revokeInvite(dbAs('alice'), boardId, inviteId)

    const invite = await getInvite(dbAs('bob'), boardId, inviteId)
    expect(isInviteActive(invite!)).toBe(false)
    await assertFails(joinBoard(dbAs('bob'), boardId, 'bob', inviteId))
  })

  test('期限が切れた招待リンクでは参加できない。画面側の期限の判定もルールと一致する', async () => {
    const boardId = await createBoard(dbAs('alice'), 'alice', 'ボード')
    const createdAt = Timestamp.fromMillis(Date.now() - INVITE_LIFETIME_MS - 60_000)
    await asAdmin((db) => setDoc(doc(db, 'boards', boardId, 'invites', 'old'), {
      boardName: 'ボード', createdBy: 'alice', createdAt, revoked: false,
    }))

    const invite = await getInvite(dbAs('bob'), boardId, 'old')
    expect(isInviteActive(invite!)).toBe(false)
    await assertFails(joinBoard(dbAs('bob'), boardId, 'bob', 'old'))
  })
})

describe('ボード名とラベル', () => {
  test('ボード名はオーナーだけが変更できる。ラベルはメンバーも編集できる', async () => {
    const { boardId } = await setupBoardWithBob()
    await assertFails(renameBoard(dbAs('bob'), boardId, '勝手に改名'))
    await renameBoard(dbAs('alice'), boardId, '新しい名前')
    await updateLabels(dbAs('bob'), boardId, [{ id: 'l1', name: '重要', color: '#cf222e' }])

    const board = await asAdmin(async (db) => (await getDoc(doc(db, 'boards', boardId))).data())
    expect(board).toMatchObject({ name: '新しい名前', labels: [{ id: 'l1', name: '重要', color: '#cf222e' }] })
  })
})

describe('メンバー', () => {
  test('オーナーはメンバーを外せる', async () => {
    const { boardId } = await setupBoardWithBob()
    await removeMember(dbAs('alice'), boardId, 'bob')
    expect(await getMyRole(dbAs('bob'), boardId, 'bob')).toBeNull()
  })

  test('メンバーは自分で抜けられる。オーナーは抜けられない', async () => {
    const { boardId } = await setupBoardWithBob()
    await removeMember(dbAs('bob'), boardId, 'bob')
    expect(await getMyRole(dbAs('bob'), boardId, 'bob')).toBeNull()
    await assertFails(removeMember(dbAs('alice'), boardId, 'alice'))
  })

  test('外されたメンバーのボード一覧は、エラーにならずに空になる', async () => {
    const { boardId } = await setupBoardWithBob()
    const errors: Error[] = []
    const lists: string[][] = []
    const unsubscribe = subscribeMyBoards(dbAs('bob'), 'bob', (boards) => lists.push(boards.map((b) => b.name)), (e) => errors.push(e))
    await expect.poll(() => lists.at(-1)).toEqual(['チームのボード'])
    await removeMember(dbAs('alice'), boardId, 'bob')
    await expect.poll(() => lists.at(-1)).toEqual([])
    unsubscribe()
    expect(errors).toEqual([])
  })
})

describe('ボードの削除', () => {
  async function countRemaining(boardId: string) {
    return asAdmin(async (db) => {
      const board = doc(db, 'boards', boardId)
      const counts: Record<string, number> = { board: (await getDoc(board)).exists() ? 1 : 0 }
      for (const name of ['members', 'invites', 'columns', 'cards']) {
        counts[name] = (await getDocs(collection(board, name))).size
      }
      for (const name of ['comments', 'history']) {
        counts[name] = (await getDocs(collectionGroup(db, name))).size
      }
      return counts
    })
  }

  async function fillBoard(boardId: string) {
    const db = dbAs('alice')
    const columns = await asAdmin(async (admin) => (await getDocs(collection(admin, 'boards', boardId, 'columns'))).docs)
    await addCard(db, boardId, 'alice', columns[0].id, 'カード 1', orderAt([], 0))
    await addCard(db, boardId, 'alice', columns[1].id, 'カード 2', orderAt([], 0))
    const cards = await asAdmin(async (admin) => (await getDocs(collection(admin, 'boards', boardId, 'cards'))).docs)
    await addComment(dbAs('bob'), boardId, 'bob', cards[0].id, 'コメント')
  }

  test('ボードを削除すると、配下のデータがすべて消える', async () => {
    const { boardId } = await setupBoardWithBob()
    await fillBoard(boardId)
    const before = await countRemaining(boardId)
    expect(before).toMatchObject({ board: 1, members: 2, invites: 1, columns: 3, cards: 2, comments: 1, history: 2 })

    await deleteBoard(dbAs('alice'), boardId, 'alice')
    expect(await countRemaining(boardId)).toEqual({
      board: 0, members: 0, invites: 0, columns: 0, cards: 0, comments: 0, history: 0,
    })
  })

  test('メンバーはボードを削除できない', async () => {
    const { boardId } = await setupBoardWithBob()
    await assertFails(deleteBoard(dbAs('bob'), boardId, 'bob'))
  })

  test('削除が途中で止まったボードは、オーナーのボード一覧が知らせ、続きから片付けられる', async () => {
    const { boardId } = await setupBoardWithBob()
    await fillBoard(boardId)
    // ボード本体だけを消した状態（片付けの途中で止まった状態）を作る
    await deleteDoc(doc(dbAs('alice'), 'boards', boardId))

    const orphaned = await new Promise<string[]>((resolve, reject) => {
      const unsubscribe = subscribeMyBoards(dbAs('alice'), 'alice', () => {}, reject, (ids) => {
        unsubscribe()
        resolve(ids)
      })
    })
    expect(orphaned).toEqual([boardId])

    await purgeBoardContents(dbAs('alice'), boardId, 'alice')
    expect(await countRemaining(boardId)).toEqual({
      board: 0, members: 0, invites: 0, columns: 0, cards: 0, comments: 0, history: 0,
    })
  })
})
