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
