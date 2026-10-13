import { FirebaseError } from 'firebase/app'
import { useEffect, useState } from 'react'
import { subscribeBoard, subscribeCards, subscribeColumns, subscribeMembers } from '../../lib/board'
import { db } from '../../lib/firebase'
import type { Board, BoardMember, Card, Column } from '../../types'

export type BoardLoadError = 'not-found' | 'forbidden' | 'unknown'

export interface BoardData {
  board: Board | null
  columns: Column[] | null
  cards: Card[] | null
  members: BoardMember[] | null
  error: BoardLoadError | null
}

// ボード画面で使うデータをまとめて購読する。
// ボードを切り替えるときは、呼び出し側で key を変えてコンポーネントごと作り直すこと
export function useBoardData(boardId: string): BoardData {
  const [board, setBoard] = useState<Board | null>(null)
  const [columns, setColumns] = useState<Column[] | null>(null)
  const [cards, setCards] = useState<Card[] | null>(null)
  const [members, setMembers] = useState<BoardMember[] | null>(null)
  const [error, setError] = useState<BoardLoadError | null>(null)

  useEffect(() => {
    function handleError(caught: Error) {
      // メンバーでないボードや、存在しないボードを開くと、権限エラーになる
      if (caught instanceof FirebaseError && caught.code === 'permission-denied') {
        setError('forbidden')
      } else {
        console.error(caught)
        setError('unknown')
      }
    }

    const unsubscribes = [
      subscribeBoard(db, boardId, (nextBoard) => {
        setBoard(nextBoard)
        if (!nextBoard) setError('not-found')
      }, handleError),
      subscribeColumns(db, boardId, setColumns, handleError),
      subscribeCards(db, boardId, setCards, handleError),
      subscribeMembers(db, boardId, setMembers, handleError),
    ]
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe())
  }, [boardId])

  return { board, columns, cards, members, error }
}
