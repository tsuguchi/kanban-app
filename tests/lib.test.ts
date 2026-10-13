import { readFileSync } from 'node:fs'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import type { User } from 'firebase/auth'
import { collection, deleteDoc, doc, getDoc, getDocs, type Firestore } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import {
  addCard,
  addColumn,
  archiveColumn,
  moveCard,
  moveColumn,
  renameColumn,
  subscribeCards,
  subscribeColumns,
} from '../src/lib/board'
import { createBoard, subscribeMyBoards } from '../src/lib/boards'
import { addComment, archiveCard, deleteComment, editComment, updateCard } from '../src/lib/card'
import { compareByOrder, orderAt } from '../src/lib/order'
import { ensureUserProfile, updateDisplayName } from '../src/lib/users'
import type { BoardSummary, Card, Column } from '../src/types'

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

  test('一覧を購読したままボードを作っても、権限エラーにならずに一覧に出る', async () => {
    const db = dbAs('alice')
    const errors: Error[] = []
    const shown = new Promise<BoardSummary[]>((resolve) => {
      const unsubscribe = subscribeMyBoards(db, 'alice', (boards) => {
        if (boards.length === 1) {
          unsubscribe()
          resolve(boards)
        }
      }, (error) => errors.push(error))
    })
    await createBoard(db, 'alice', '作ったばかりのボード')
    const boards = await shown
    expect(boards.map((board) => board.name)).toEqual(['作ったばかりのボード'])
    expect(errors).toEqual([])
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

// 購読して、最初に届いた内容を返す
function readOnce<T>(subscribe: (onChange: (value: T) => void, onError: (error: Error) => void) => () => void) {
  return new Promise<T>((resolve, reject) => {
    const unsubscribe = subscribe((value) => {
      unsubscribe()
      resolve(value)
    }, reject)
  })
}

async function readBoard(db: Firestore, boardId: string) {
  const columns = (await readOnce<Column[]>((ok, ng) => subscribeColumns(db, boardId, ok, ng))).sort(compareByOrder)
  const cards = (await readOnce<Card[]>((ok, ng) => subscribeCards(db, boardId, ok, ng))).sort(compareByOrder)
  return { columns, cards }
}

async function readHistory(boardId: string, cardId: string) {
  return readAsAdmin(async (db) =>
    (await getDocs(collection(db, 'boards', boardId, 'cards', cardId, 'history'))).docs.map((d) => d.data()))
}

describe('ボード画面の列の操作', () => {
  test('列の追加・名前変更・並べ替え・アーカイブができる', async () => {
    const db = dbAs('alice')
    const boardId = await createBoard(db, 'alice', 'ボード')
    let { columns } = await readBoard(db, boardId)

    await addColumn(db, boardId, 'レビュー待ち', orderAt(columns, columns.length))
    ;({ columns } = await readBoard(db, boardId))
    expect(columns.map((c) => c.name)).toEqual(['未着手', '進行中', '完了', 'レビュー待ち'])

    const review = columns[3]
    await renameColumn(db, boardId, review.id, 'レビュー中')
    await moveColumn(db, boardId, review.id, orderAt(columns.filter((c) => c.id !== review.id), 1))
    await archiveColumn(db, boardId, columns[0].id)

    ;({ columns } = await readBoard(db, boardId))
    expect(columns.map((c) => [c.name, c.archived])).toEqual([
      ['未着手', true],
      ['レビュー中', false],
      ['進行中', false],
      ['完了', false],
    ])
  })
})

describe('ボード画面のカードの操作', () => {
  test('カードを作成すると、変更履歴に「作成」が記録される', async () => {
    const db = dbAs('alice')
    const boardId = await createBoard(db, 'alice', 'ボード')
    const { columns } = await readBoard(db, boardId)

    await addCard(db, boardId, 'alice', columns[0].id, '最初のタスク', orderAt([], 0))
    const { cards } = await readBoard(db, boardId)
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({ title: '最初のタスク', columnId: columns[0].id, archived: false })
    expect(await readHistory(boardId, cards[0].id)).toMatchObject([{ actorId: 'alice', type: 'created' }])
  })

  test('別の列に移すと、移動元と移動先の列名が変更履歴に記録される。同じ列での並べ替えは記録しない', async () => {
    const db = dbAs('alice')
    const boardId = await createBoard(db, 'alice', 'ボード')
    const { columns } = await readBoard(db, boardId)
    const [todo, doing] = columns
    await addCard(db, boardId, 'alice', todo.id, 'A', orderAt([], 0))
    let { cards } = await readBoard(db, boardId)
    await addCard(db, boardId, 'alice', todo.id, 'B', orderAt(cards, 1))
    ;({ cards } = await readBoard(db, boardId))
    const [a, b] = cards

    // 同じ列の中で B を A の前に
    await moveCard(db, boardId, 'alice', b, { toColumn: todo, fromColumnName: todo.name, order: orderAt([a], 0) })
    // A を「進行中」へ
    await moveCard(db, boardId, 'alice', a, { toColumn: doing, fromColumnName: todo.name, order: orderAt([], 0) })

    ;({ cards } = await readBoard(db, boardId))
    expect(cards.map((card) => [card.title, card.columnId])).toEqual(
      expect.arrayContaining([['B', todo.id], ['A', doing.id]]),
    )
    expect((await readHistory(boardId, b.id)).map((h) => h.type)).toEqual(['created'])
    const aHistory = await readHistory(boardId, a.id)
    expect(aHistory.find((h) => h.type === 'moved')).toMatchObject({
      actorId: 'alice',
      from: { columnName: '未着手' },
      to: { columnName: '進行中' },
    })
  })
})

describe('カード詳細の操作', () => {
  async function setupCard() {
    const db = dbAs('alice')
    const boardId = await createBoard(db, 'alice', 'ボード')
    const { columns } = await readBoard(db, boardId)
    await addCard(db, boardId, 'alice', columns[0].id, 'タスク', orderAt([], 0))
    const { cards } = await readBoard(db, boardId)
    return { db, boardId, cardId: cards[0].id }
  }

  test('項目を更新すると、指定した変更履歴が同じバッチで記録される', async () => {
    const { db, boardId, cardId } = await setupCard()
    await updateCard(db, boardId, 'alice', cardId, { title: '新しいタイトル' }, {
      type: 'title_changed', from: { title: 'タスク' }, to: { title: '新しいタイトル' },
    })
    await updateCard(db, boardId, 'alice', cardId, {
      description: '説明',
      dueDate: '2026-10-31',
      assigneeIds: ['alice'],
      checklist: [{ id: 'i1', text: '項目', done: true }],
    })

    const { cards } = await readBoard(db, boardId)
    expect(cards[0]).toMatchObject({
      title: '新しいタイトル', description: '説明', dueDate: '2026-10-31', assigneeIds: ['alice'],
      checklist: [{ id: 'i1', text: '項目', done: true }],
    })
    const types = (await readHistory(boardId, cardId)).map((h) => h.type).sort()
    expect(types).toEqual(['created', 'title_changed'])
  })

  test('コメントの投稿・編集・削除で、カードのコメント数が増減する', async () => {
    const { db, boardId, cardId } = await setupCard()
    await addComment(db, boardId, 'alice', cardId, '1 件目')
    await addComment(db, boardId, 'alice', cardId, '2 件目')
    let { cards } = await readBoard(db, boardId)
    expect(cards[0].commentCount).toBe(2)

    const comments = await readAsAdmin(async (admin) =>
      (await getDocs(collection(admin, 'boards', boardId, 'cards', cardId, 'comments'))).docs)
    await editComment(db, boardId, cardId, comments[0].id, '編集しました')
    await deleteComment(db, boardId, 'alice', cardId, comments[1].id)
    ;({ cards } = await readBoard(db, boardId))
    expect(cards[0].commentCount).toBe(1)
  })

  test('カードをアーカイブすると、変更履歴に記録される', async () => {
    const { db, boardId, cardId } = await setupCard()
    await archiveCard(db, boardId, 'alice', cardId)
    const { cards } = await readBoard(db, boardId)
    expect(cards[0].archived).toBe(true)
    expect((await readHistory(boardId, cardId)).map((h) => h.type).sort()).toEqual(['archived', 'created'])
  })
})
