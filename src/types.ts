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
