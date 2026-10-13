import { collection, deleteDoc, getDocs, type DocumentReference } from 'firebase/firestore'

// 完全削除の共通処理。Spark プランでは Cloud Functions が使えず、Firestore はサブコレクションを
// 自動では消さないので、クライアントから消す（DATA_MODEL.md §4）

// Security Rules は削除 1 件ごとに他のドキュメントを数回参照するので、バッチにまとめず少しずつ並列に消す
export async function deleteAll(refs: DocumentReference[], concurrency = 10): Promise<void> {
  for (let i = 0; i < refs.length; i += concurrency) {
    await Promise.all(refs.slice(i, i + concurrency).map((ref) => deleteDoc(ref)))
  }
}

export async function subcollectionRefs(parent: DocumentReference, name: string): Promise<DocumentReference[]> {
  return (await getDocs(collection(parent, name))).docs.map((d) => d.ref)
}

// カードを、コメントと変更履歴ごと消す
export async function purgeCardDoc(card: DocumentReference): Promise<void> {
  await deleteAll([
    ...await subcollectionRefs(card, 'comments'),
    ...await subcollectionRefs(card, 'history'),
  ])
  await deleteDoc(card)
}
