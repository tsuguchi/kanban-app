// Firestore のドキュメントの型。定義は DATA_MODEL.md を参照

export type Role = 'owner' | 'member'

export interface UserProfile {
  displayName: string
  photoURL: string | null
}

export interface BoardSummary {
  id: string
  name: string
  role: Role
}

export interface Label {
  id: string
  name: string
  color: string
}

export interface Board {
  id: string
  name: string
  ownerId: string
  labels: Label[]
}

export interface BoardMember extends UserProfile {
  uid: string
  role: Role
}

export interface Invite {
  id: string
  boardName: string
  createdAt: Date
  revoked: boolean
}

export interface Column {
  id: string
  name: string
  order: string
  archived: boolean
}

export interface ChecklistItem {
  id: string
  text: string
  done: boolean
}

export interface CardComment {
  id: string
  authorId: string
  body: string
  createdAt: Date
  edited: boolean
}

export type HistoryType =
  | 'created' | 'archived' | 'restored' | 'moved'
  | 'title_changed' | 'due_changed' | 'assignees_changed' | 'labels_changed'

export interface HistoryEntry {
  id: string
  actorId: string
  type: HistoryType
  from: Record<string, unknown> | null
  to: Record<string, unknown> | null
  createdAt: Date
}

export interface Card {
  id: string
  columnId: string
  order: string
  title: string
  description: string
  dueDate: string | null
  assigneeIds: string[]
  labelIds: string[]
  checklist: ChecklistItem[]
  commentCount: number
  archived: boolean
}
