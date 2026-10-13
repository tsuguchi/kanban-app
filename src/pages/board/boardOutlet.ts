import { useOutletContext } from 'react-router'
import type { Board, BoardMember, Card, Column } from '../../types'

// ボード画面（S-03）の上に開く画面（カード詳細）へ渡すデータ。購読はボード画面でまとめて行う
export interface BoardOutletContext {
  board: Board
  columns: Column[]
  cards: Card[]
  members: BoardMember[]
  onSaveError: () => void
}

export function useBoardOutlet(): BoardOutletContext {
  return useOutletContext<BoardOutletContext>()
}
