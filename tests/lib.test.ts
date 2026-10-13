import { readFileSync } from 'node:fs'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import type { User } from 'firebase/auth'
import { collection, deleteDoc, doc, getDoc, getDocs, type Firestore } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { createBoard, subscribeMyBoards } from '../src/lib/boards'
import { ensureUserProfile, updateDisplayName } from '../src/lib/users'
import type { BoardSummary } from '../src/types'

// src/lib の関数が、本番と同じ Security Rules の下で動くことを確かめる

let env: RulesTestEnvironment

function dbAs(uid: string): Firestore {
  return env.authenticatedContext(uid).firestore() as unknown as Firestore
}

async function readAsAdmin<T>(read: (db: Firestore) => Promise<T>): Promise<T> {
  let result: T | undefined
  await env.withSecurityRulesDisabled(async (context) => {
    result = await read(context.firestore() as unknown as Firestore)
  })
  return result as T
}

// 一覧が条件を満たすまで待つ
function waitForBoards(db: Firestore, uid: string, done: (boards: BoardSummary[]) => boolean) {
  return new Promise<BoardSummary[]>((resolve, reject) => {
    const unsubscribe = subscribeMyBoards(db, uid, (boards) => {
      if (done(boards)) {
        unsubscribe()
        resolve(boards)
      }
    }, reject)
  })
}

function fakeUser(fields: Partial<User> & { uid: string }): User {
  return { displayName: null, email: null, photoURL: null, ...fields } as User
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

describe('createBoard', () => {
  test('ボード・オーナー登録・初期の 3 列を作る', async () => {
    const boardId = await createBoard(dbAs('alice'), 'alice', '開発チーム')

    const { board, member, columns } = await readAsAdmin(async (db) => ({
      board: (await getDoc(doc(db, 'boards', boardId))).data(),
      member: (await getDoc(doc(db, 'boards', boardId, 'members', 'alice'))).data(),
      columns: (await getDocs(collection(db, 'boards', boardId, 'columns'))).docs.map((d) => d.data()),
    }))

    expect(board).toMatchObject({ name: '開発チーム', ownerId: 'alice', labels: [] })
    expect(member).toMatchObject({ uid: 'alice', role: 'owner', inviteId: null })
    const names = columns
      .sort((a, b) => (a.order < b.order ? -1 : 1))
      .map((column) => column.name)
    expect(names).toEqual(['未着手', '進行中', '完了'])
  })
})

describe('subscribeMyBoards', () => {
  test('自分が参加しているボードだけを、名前順で返す', async () => {
    await createBoard(dbAs('alice'), 'alice', 'B のボード')
    await createBoard(dbAs('alice'), 'alice', 'A のボード')
    await createBoard(dbAs('carol'), 'carol', 'Carol のボード')

    const boards = await waitForBoards(dbAs('alice'), 'alice', (list) => list.length === 2)
    expect(boards.map((board) => [board.name, board.role])).toEqual([
      ['A のボード', 'owner'],
      ['B のボード', 'owner'],
    ])
  })

  test('削除が途中で止まったボード（メンバー情報だけが残っている）は表示しない', async () => {
    const db = dbAs('alice')
    const deletedId = await createBoard(db, 'alice', '消したボード')
    await createBoard(db, 'alice', '残すボード')
    await deleteDoc(doc(db, 'boards', deletedId))

    const boards = await waitForBoards(db, 'alice', (list) => list.length > 0)
    expect(boards.map((board) => board.name)).toEqual(['残すボード'])
  })
})

describe('ensureUserProfile', () => {
  test('初回だけ OAuth の情報からプロフィールを作り、2 回目以降は上書きしない', async () => {
    const db = dbAs('alice')
    await ensureUserProfile(db, fakeUser({ uid: 'alice', displayName: 'Alice', photoURL: 'https://example.com/a.png' }))
    await updateDisplayName(db, 'alice', 'ありす')
    await ensureUserProfile(db, fakeUser({ uid: 'alice', displayName: 'Alice' }))

    const profile = await readAsAdmin(async (admin) => (await getDoc(doc(admin, 'users', 'alice'))).data())
    expect(profile).toMatchObject({ displayName: 'ありす', photoURL: 'https://example.com/a.png' })
  })

  test('表示名がなければメールアドレスの @ より前を使い、長すぎる名前は切り詰める', async () => {
    await ensureUserProfile(dbAs('bob'), fakeUser({ uid: 'bob', email: 'bob.smith@example.com' }))
    await ensureUserProfile(dbAs('carol'), fakeUser({ uid: 'carol', displayName: 'あ'.repeat(80) }))

    const [bob, carol] = await readAsAdmin(async (admin) => [
      (await getDoc(doc(admin, 'users', 'bob'))).data(),
      (await getDoc(doc(admin, 'users', 'carol'))).data(),
    ])
    expect(bob?.displayName).toBe('bob.smith')
    expect(carol?.displayName).toHaveLength(50)
  })
})
