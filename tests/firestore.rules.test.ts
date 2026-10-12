import { readFileSync } from 'node:fs'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, test } from 'vitest'

// alice: ボードのオーナー / bob: メンバー / carol: 部外者
const BOARD = 'board1'
const COLUMN = 'col1'
const CARD = 'card1'

let env: RulesTestEnvironment

function dbAs(uid: string | null): Firestore {
  const context = uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()
  return context.firestore() as unknown as Firestore
}

function newCard(uid: string, overrides: Record<string, unknown> = {}) {
  return {
    columnId: COLUMN,
    order: 'a0',
    title: 'タスク',
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
    ...overrides,
  }
}

// ルールを無効にした状態で、alice のボードに bob が参加済みのデータを用意する
async function seed() {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore() as unknown as Firestore
    const now = Timestamp.now()
    const old = Timestamp.fromMillis(now.toMillis() - 8 * 24 * 60 * 60 * 1000)
    await setDoc(doc(db, `boards/${BOARD}`), {
      name: 'ボード', ownerId: 'alice', labels: [], createdAt: now, updatedAt: now,
    })
    await setDoc(doc(db, `boards/${BOARD}/members/alice`), {
      uid: 'alice', role: 'owner', inviteId: null, joinedAt: now,
    })
    await setDoc(doc(db, `boards/${BOARD}/members/bob`), {
      uid: 'bob', role: 'member', inviteId: 'inv-valid', joinedAt: now,
    })
    await setDoc(doc(db, `boards/${BOARD}/invites/inv-valid`), {
      boardName: 'ボード', createdBy: 'alice', createdAt: now, revoked: false,
    })
    await setDoc(doc(db, `boards/${BOARD}/invites/inv-revoked`), {
      boardName: 'ボード', createdBy: 'alice', createdAt: now, revoked: true,
    })
    await setDoc(doc(db, `boards/${BOARD}/invites/inv-expired`), {
      boardName: 'ボード', createdBy: 'alice', createdAt: old, revoked: false,
    })
    await setDoc(doc(db, `boards/${BOARD}/columns/${COLUMN}`), {
      name: '未着手', order: 'a0', archived: false, archivedAt: null,
    })
    await setDoc(doc(db, `boards/${BOARD}/cards/${CARD}`), {
      ...newCard('bob'), createdAt: now, updatedAt: now,
    })
    await setDoc(doc(db, `boards/${BOARD}/cards/${CARD}/comments/c1`), {
      authorId: 'bob', body: 'コメント', createdAt: now, updatedAt: null,
    })
    await setDoc(doc(db, `boards/${BOARD}/cards/${CARD}/history/h1`), {
      actorId: 'bob', type: 'created', from: null, to: null, createdAt: now,
    })
  })
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-kanban',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  })
})

beforeEach(async () => {
  await env.clearFirestore()
  await seed()
})

afterAll(async () => {
  await env.cleanup()
})

describe('users', () => {
  test('本人はプロフィールを作成できる', async () => {
    await assertSucceeds(setDoc(doc(dbAs('carol'), 'users/carol'), {
      displayName: 'Carol', photoURL: null, createdAt: serverTimestamp(),
    }))
  })

  test('他人のプロフィールは作成できない', async () => {
    await assertFails(setDoc(doc(dbAs('carol'), 'users/alice'), {
      displayName: 'Alice', photoURL: null, createdAt: serverTimestamp(),
    }))
  })

  test('未ログインでは読めない', async () => {
    await assertFails(getDoc(doc(dbAs(null), 'users/alice')))
  })
})

describe('boards の作成', () => {
  test('ボードと自分のオーナー登録を同じバッチで作成できる', async () => {
    const db = dbAs('carol')
    const batch = writeBatch(db)
    batch.set(doc(db, 'boards/new'), {
      name: '新しいボード', ownerId: 'carol', labels: [],
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    })
    batch.set(doc(db, 'boards/new/members/carol'), {
      uid: 'carol', role: 'owner', inviteId: null, joinedAt: serverTimestamp(),
    })
    await assertSucceeds(batch.commit())
  })

  test('オーナー登録なしではボードを作成できない', async () => {
    await assertFails(setDoc(doc(dbAs('carol'), 'boards/new'), {
      name: '新しいボード', ownerId: 'carol', labels: [],
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }))
  })

  test('既存のボードに自分をオーナーとして追加できない', async () => {
    await assertFails(setDoc(doc(dbAs('carol'), `boards/${BOARD}/members/carol`), {
      uid: 'carol', role: 'owner', inviteId: null, joinedAt: serverTimestamp(),
    }))
  })
})

describe('boards の読み書き', () => {
  test('メンバーは読める。部外者は読めない', async () => {
    await assertSucceeds(getDoc(doc(dbAs('bob'), `boards/${BOARD}`)))
    await assertFails(getDoc(doc(dbAs('carol'), `boards/${BOARD}`)))
  })

  test('メンバーはラベルを編集できる', async () => {
    await assertSucceeds(updateDoc(doc(dbAs('bob'), `boards/${BOARD}`), {
      labels: [{ id: 'l1', name: '重要', color: 'red' }], updatedAt: serverTimestamp(),
    }))
  })

  test('メンバーはボード名を変更できない。オーナーはできる', async () => {
    await assertFails(updateDoc(doc(dbAs('bob'), `boards/${BOARD}`), {
      name: '改名', updatedAt: serverTimestamp(),
    }))
    await assertSucceeds(updateDoc(doc(dbAs('alice'), `boards/${BOARD}`), {
      name: '改名', updatedAt: serverTimestamp(),
    }))
  })

  test('メンバーはボードを削除できない', async () => {
    await assertFails(deleteDoc(doc(dbAs('bob'), `boards/${BOARD}`)))
  })
})

describe('members とボード一覧', () => {
  test('自分が参加しているボードをコレクショングループで探せる', async () => {
    const db = dbAs('bob')
    await assertSucceeds(getDocs(query(collectionGroup(db, 'members'), where('uid', '==', 'bob'))))
  })

  test('他人の参加状況はコレクショングループで探せない', async () => {
    const db = dbAs('carol')
    await assertFails(getDocs(query(collectionGroup(db, 'members'), where('uid', '==', 'bob'))))
    await assertFails(getDocs(collectionGroup(db, 'members')))
  })

  test('メンバーは自分でボードを抜けられる', async () => {
    await assertSucceeds(deleteDoc(doc(dbAs('bob'), `boards/${BOARD}/members/bob`)))
  })

  test('オーナーはメンバーを外せる。メンバーはオーナーを外せない', async () => {
    await assertFails(deleteDoc(doc(dbAs('bob'), `boards/${BOARD}/members/alice`)))
    await assertSucceeds(deleteDoc(doc(dbAs('alice'), `boards/${BOARD}/members/bob`)))
  })

  test('ボードが残っている間、オーナーは自分のメンバー情報を消せない', async () => {
    await assertFails(deleteDoc(doc(dbAs('alice'), `boards/${BOARD}/members/alice`)))
  })

  test('ロールは変更できない', async () => {
    await assertFails(updateDoc(doc(dbAs('alice'), `boards/${BOARD}/members/bob`), { role: 'owner' }))
  })
})

describe('招待リンク', () => {
  function join(uid: string, inviteId: string, role = 'member') {
    return setDoc(doc(dbAs(uid), `boards/${BOARD}/members/${uid}`), {
      uid, role, inviteId, joinedAt: serverTimestamp(),
    })
  }

  test('有効な招待リンクで参加できる', async () => {
    await assertSucceeds(join('carol', 'inv-valid'))
  })

  test('無効化・期限切れ・存在しない招待リンクでは参加できない', async () => {
    await assertFails(join('carol', 'inv-revoked'))
    await assertFails(join('carol', 'inv-expired'))
    await assertFails(join('carol', 'inv-missing'))
  })

  test('招待リンクでオーナーとして参加することはできない', async () => {
    await assertFails(join('carol', 'inv-valid', 'owner'))
  })

  test('他人を参加させることはできない', async () => {
    await assertFails(setDoc(doc(dbAs('carol'), `boards/${BOARD}/members/dave`), {
      uid: 'dave', role: 'member', inviteId: 'inv-valid', joinedAt: serverTimestamp(),
    }))
  })

  test('部外者でも招待リンクを 1 件取得してボード名を確認できる。一覧は取得できない', async () => {
    const db = dbAs('carol')
    await assertSucceeds(getDoc(doc(db, `boards/${BOARD}/invites/inv-valid`)))
    await assertFails(getDocs(collection(db, `boards/${BOARD}/invites`)))
  })

  test('オーナーは招待リンクを発行・一覧・無効化できる', async () => {
    const db = dbAs('alice')
    await assertSucceeds(setDoc(doc(db, `boards/${BOARD}/invites/inv-new`), {
      boardName: 'ボード', createdBy: 'alice', createdAt: serverTimestamp(), revoked: false,
    }))
    await assertSucceeds(getDocs(collection(db, `boards/${BOARD}/invites`)))
    await assertSucceeds(updateDoc(doc(db, `boards/${BOARD}/invites/inv-valid`), { revoked: true }))
  })

  test('メンバーは招待リンクを発行できない', async () => {
    await assertFails(setDoc(doc(dbAs('bob'), `boards/${BOARD}/invites/inv-new`), {
      boardName: 'ボード', createdBy: 'bob', createdAt: serverTimestamp(), revoked: false,
    }))
  })

  test('無効化した招待リンクは元に戻せない', async () => {
    await assertFails(updateDoc(doc(dbAs('alice'), `boards/${BOARD}/invites/inv-revoked`), { revoked: false }))
  })
})

describe('列とカード', () => {
  test('メンバーは列とカードを作成できる。部外者はできない', async () => {
    await assertSucceeds(setDoc(doc(dbAs('bob'), `boards/${BOARD}/columns/col2`), {
      name: '進行中', order: 'a1', archived: false, archivedAt: null,
    }))
    await assertSucceeds(setDoc(doc(dbAs('bob'), `boards/${BOARD}/cards/card2`), newCard('bob')))
    await assertFails(setDoc(doc(dbAs('carol'), `boards/${BOARD}/cards/card3`), newCard('carol')))
  })

  test('作成者や更新者を偽ってカードを作成できない', async () => {
    await assertFails(setDoc(doc(dbAs('bob'), `boards/${BOARD}/cards/card2`), newCard('bob', { createdBy: 'alice' })))
    await assertFails(setDoc(doc(dbAs('bob'), `boards/${BOARD}/cards/card2`), newCard('bob', { updatedBy: 'alice' })))
  })

  test('期限は YYYY-MM-DD 形式でなければならない', async () => {
    await assertSucceeds(setDoc(doc(dbAs('bob'), `boards/${BOARD}/cards/card2`), newCard('bob', { dueDate: '2026-10-31' })))
    await assertFails(setDoc(doc(dbAs('bob'), `boards/${BOARD}/cards/card3`), newCard('bob', { dueDate: '10/31' })))
  })

  test('カードの移動と変更履歴を同じバッチで書き込める', async () => {
    const db = dbAs('alice')
    const batch = writeBatch(db)
    batch.update(doc(db, `boards/${BOARD}/cards/${CARD}`), {
      columnId: 'col2', order: 'a5', updatedBy: 'alice', updatedAt: serverTimestamp(),
    })
    batch.set(doc(db, `boards/${BOARD}/cards/${CARD}/history/h2`), {
      actorId: 'alice', type: 'moved',
      from: { columnName: '未着手' }, to: { columnName: '進行中' },
      createdAt: serverTimestamp(),
    })
    await assertSucceeds(batch.commit())
  })

  test('カードの作成者と作成日時は変更できない', async () => {
    await assertFails(updateDoc(doc(dbAs('alice'), `boards/${BOARD}/cards/${CARD}`), {
      createdBy: 'alice', updatedBy: 'alice', updatedAt: serverTimestamp(),
    }))
  })

  test('アーカイブしていないカード・列は完全削除できない', async () => {
    await assertFails(deleteDoc(doc(dbAs('alice'), `boards/${BOARD}/cards/${CARD}`)))
    await assertFails(deleteDoc(doc(dbAs('alice'), `boards/${BOARD}/columns/${COLUMN}`)))
  })

  test('アーカイブ済みのカードは、オーナーだけがコメント・履歴ごと完全削除できる', async () => {
    await assertSucceeds(updateDoc(doc(dbAs('bob'), `boards/${BOARD}/cards/${CARD}`), {
      archived: true, archivedAt: serverTimestamp(), updatedBy: 'bob', updatedAt: serverTimestamp(),
    }))
    await assertFails(deleteDoc(doc(dbAs('bob'), `boards/${BOARD}/cards/${CARD}/history/h1`)))

    const db = dbAs('alice')
    await assertSucceeds(deleteDoc(doc(db, `boards/${BOARD}/cards/${CARD}/comments/c1`)))
    await assertSucceeds(deleteDoc(doc(db, `boards/${BOARD}/cards/${CARD}/history/h1`)))
    await assertSucceeds(deleteDoc(doc(db, `boards/${BOARD}/cards/${CARD}`)))
  })

  test('アーカイブ済みの列に入っているカードは、カード自体をアーカイブしていなくても完全削除できる', async () => {
    await assertSucceeds(updateDoc(doc(dbAs('bob'), `boards/${BOARD}/columns/${COLUMN}`), {
      archived: true, archivedAt: serverTimestamp(),
    }))
    const db = dbAs('alice')
    await assertSucceeds(deleteDoc(doc(db, `boards/${BOARD}/cards/${CARD}`)))
    await assertSucceeds(deleteDoc(doc(db, `boards/${BOARD}/columns/${COLUMN}`)))
  })

  test('アーカイブ状態と日時の組み合わせが矛盾する更新はできない', async () => {
    await assertFails(updateDoc(doc(dbAs('bob'), `boards/${BOARD}/columns/${COLUMN}`), {
      archived: true, archivedAt: null,
    }))
  })
})

describe('コメント', () => {
  test('メンバーはコメントを投稿できる。投稿者を偽ることはできない', async () => {
    const db = dbAs('alice')
    await assertSucceeds(setDoc(doc(db, `boards/${BOARD}/cards/${CARD}/comments/c2`), {
      authorId: 'alice', body: 'こんにちは', createdAt: serverTimestamp(), updatedAt: null,
    }))
    await assertFails(setDoc(doc(db, `boards/${BOARD}/cards/${CARD}/comments/c3`), {
      authorId: 'bob', body: 'なりすまし', createdAt: serverTimestamp(), updatedAt: null,
    }))
  })

  test('自分のコメントだけ編集・削除できる', async () => {
    await assertFails(updateDoc(doc(dbAs('alice'), `boards/${BOARD}/cards/${CARD}/comments/c1`), {
      body: '書き換え', updatedAt: serverTimestamp(),
    }))
    await assertFails(deleteDoc(doc(dbAs('alice'), `boards/${BOARD}/cards/${CARD}/comments/c1`)))
    await assertSucceeds(updateDoc(doc(dbAs('bob'), `boards/${BOARD}/cards/${CARD}/comments/c1`), {
      body: '編集しました', updatedAt: serverTimestamp(),
    }))
    await assertSucceeds(deleteDoc(doc(dbAs('bob'), `boards/${BOARD}/cards/${CARD}/comments/c1`)))
  })
})

describe('変更履歴', () => {
  test('操作者を偽った履歴は書き込めない', async () => {
    await assertFails(setDoc(doc(dbAs('bob'), `boards/${BOARD}/cards/${CARD}/history/h2`), {
      actorId: 'alice', type: 'moved', from: null, to: null, createdAt: serverTimestamp(),
    }))
  })

  test('日時をクライアントの時刻にした履歴は書き込めない', async () => {
    await assertFails(setDoc(doc(dbAs('bob'), `boards/${BOARD}/cards/${CARD}/history/h2`), {
      actorId: 'bob', type: 'moved', from: null, to: null, createdAt: Timestamp.now(),
    }))
  })

  test('履歴は書き換えられない', async () => {
    await assertFails(updateDoc(doc(dbAs('bob'), `boards/${BOARD}/cards/${CARD}/history/h1`), { type: 'archived' }))
  })
})

describe('ボードの削除', () => {
  test('オーナーはボード本体を消したあと、配下と自分のメンバー情報を片付けられる', async () => {
    const db = dbAs('alice')
    await assertSucceeds(deleteDoc(doc(db, `boards/${BOARD}`)))
    await assertSucceeds(deleteDoc(doc(db, `boards/${BOARD}/cards/${CARD}/comments/c1`)))
    await assertSucceeds(deleteDoc(doc(db, `boards/${BOARD}/cards/${CARD}/history/h1`)))
    await assertSucceeds(deleteDoc(doc(db, `boards/${BOARD}/cards/${CARD}`)))
    await assertSucceeds(deleteDoc(doc(db, `boards/${BOARD}/columns/${COLUMN}`)))
    await assertSucceeds(deleteDoc(doc(db, `boards/${BOARD}/invites/inv-valid`)))
    await assertSucceeds(deleteDoc(doc(db, `boards/${BOARD}/members/bob`)))
    await assertSucceeds(deleteDoc(doc(db, `boards/${BOARD}/members/alice`)))
  })

  test('ボードの削除後も、メンバーは配下を消せない', async () => {
    await assertSucceeds(deleteDoc(doc(dbAs('alice'), `boards/${BOARD}`)))
    await assertFails(deleteDoc(doc(dbAs('bob'), `boards/${BOARD}/columns/${COLUMN}`)))
  })
})
