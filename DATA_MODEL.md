# Firestore データ構造（ドラフト v0.2）

最終更新: 2026-10-13
要件は [REQUIREMENTS.md](REQUIREMENTS.md) を参照。

## 1. 全体像

```
users/{uid}
boards/{boardId}
├── members/{uid}
├── invites/{inviteId}
├── columns/{columnId}
└── cards/{cardId}
    ├── comments/{commentId}
    └── history/{historyId}
```

設計の方針：

- ボードを開いたときに読み込むのは `boards/{boardId}` と、その配下の `members`、`columns`、`cards` だけにする。カード 500 枚のボードで約 520 件の読み込みになる
- `comments` と `history` は、カード詳細（S-04）を開いたときだけ読み込む
- ラベルの定義とチェックリストは、別のドキュメントに分けず親ドキュメントに埋め込む。読み込み件数を増やさないため
- 並び順には小数点インデックス（fractional indexing）の文字列を使う。カードを 1 枚動かしたときに、書き込みがそのカード 1 件だけで済む

## 2. コレクション定義

### users/{uid}

ユーザーのプロフィール。ドキュメント ID は Firebase Authentication の uid。

| フィールド | 型 | 説明 |
|---|---|---|
| displayName | string | 表示名（F-04） |
| photoURL | string \| null | アイコンの URL |
| createdAt | timestamp | 作成日時 |

メールアドレスは保存しない。Public なアプリで他のユーザーに見えてしまうのを避けるため。

### boards/{boardId}

| フィールド | 型 | 説明 |
|---|---|---|
| name | string | ボード名 |
| ownerId | string | オーナーの uid |
| labels | array<{ id: string, name: string, color: string }> | ラベルの定義（F-50） |
| createdAt | timestamp | 作成日時 |
| updatedAt | timestamp | 更新日時 |

### boards/{boardId}/members/{uid}

ボードのメンバー。ドキュメント ID はメンバーの uid。

| フィールド | 型 | 説明 |
|---|---|---|
| uid | string | ドキュメント ID と同じ値。コレクショングループクエリで「自分が参加しているボード」を探すために持つ |
| role | `"owner"` \| `"member"` | ロール（F-21） |
| inviteId | string \| null | 参加に使った招待リンクの ID。オーナーは null |
| joinedAt | timestamp | 参加日時 |

ボード一覧（S-02）は、`members` のコレクショングループに `uid == 自分の uid` で問い合わせ、見つかったボードを読み込んで表示する。

### boards/{boardId}/invites/{inviteId}

招待リンク（F-20）。ドキュメント ID は Firestore の自動 ID（20 文字のランダムな文字列）で、推測されないことを前提に、そのまま招待リンクの一部として使う。

| フィールド | 型 | 説明 |
|---|---|---|
| boardName | string | 発行時点のボード名。参加前の人はボード本体を読めないので、招待画面（S-07）ではこれを表示する |
| createdBy | string | 発行したオーナーの uid |
| createdAt | timestamp | 発行日時（サーバー時刻） |
| revoked | boolean | 無効化されていれば true |

有効期限は `createdAt` から 7 日。期限の日時は保存せず、`createdAt` から計算する。ブラウザからは「サーバー時刻 + 7 日」を正確に書き込めず、ルールで検証できないため。

### boards/{boardId}/columns/{columnId}

| フィールド | 型 | 説明 |
|---|---|---|
| name | string | 列名 |
| order | string | 並び順（小数点インデックス） |
| archived | boolean | アーカイブ済みなら true |
| archivedAt | timestamp \| null | アーカイブした日時 |

列をアーカイブしても、列内のカードのドキュメントは書き換えない。アーカイブ済みの列に属するカードは、画面に表示しないだけにする。こうすると、列を戻したときにカードも自動で戻る（F-71、F-72）。

### boards/{boardId}/cards/{cardId}

| フィールド | 型 | 説明 |
|---|---|---|
| columnId | string | 所属する列 |
| order | string | 列内の並び順（小数点インデックス） |
| title | string | タイトル（必須） |
| description | string | 説明 |
| dueDate | string \| null | 期限。`"2026-10-13"` の形式。時刻を持たないので、タイムゾーンのずれが起きない |
| assigneeIds | array<string> | 担当者の uid |
| labelIds | array<string> | ラベルの ID |
| checklist | array<{ id: string, text: string, done: boolean }> | チェックリスト |
| commentCount | number | コメント数。カード上に表示するため |
| archived | boolean | カード単体でアーカイブ済みなら true |
| archivedAt | timestamp \| null | アーカイブした日時 |
| createdBy | string | 作成者の uid |
| createdAt | timestamp | 作成日時 |
| updatedBy | string | 最後に更新した人の uid |
| updatedAt | timestamp | 更新日時 |

- ラベルを削除しても、カードの `labelIds` からは消さない。存在しないラベルの ID は表示時に無視する
- メンバーがボードを抜けても、カードの `assigneeIds` からは消さない。表示時に「退出したメンバー」として薄く表示する

### boards/{boardId}/cards/{cardId}/comments/{commentId}

| フィールド | 型 | 説明 |
|---|---|---|
| authorId | string | 投稿者の uid |
| body | string | 本文 |
| createdAt | timestamp | 投稿日時 |
| updatedAt | timestamp \| null | 編集日時。編集していなければ null |

### boards/{boardId}/cards/{cardId}/history/{historyId}

変更履歴（F-90〜F-92）。カードの更新と同じバッチで書き込む。

| フィールド | 型 | 説明 |
|---|---|---|
| actorId | string | 操作した人の uid |
| type | string | 操作の種類。`created` / `archived` / `restored` / `moved` / `title_changed` / `due_changed` / `assignees_changed` / `labels_changed` |
| from | map \| null | 変更前の値（例：`{ columnName: "未着手" }`） |
| to | map \| null | 変更後の値（例：`{ columnName: "進行中" }`） |
| createdAt | timestamp | 日時（サーバー時刻） |

移動元・移動先の列名は ID ではなく名前で保存する。あとで列名が変わったり列が消えたりしても、履歴の表示が崩れないようにするため。

## 3. Security Rules の方針

ルールの本体は [firestore.rules](firestore.rules)、テストは [tests/firestore.rules.test.ts](tests/firestore.rules.test.ts)。ここでは判定の考え方を示す。

| 対象 | 読み込み | 作成 | 更新 | 削除 |
|---|---|---|---|---|
| users/{uid} | ログイン済みなら誰でも | 本人のみ | 本人のみ | 不可 |
| boards/{b} | メンバー | ログイン済みなら誰でも。`ownerId` は自分。自分のオーナー登録と同じバッチで行う | name はオーナー、labels はメンバー | オーナー |
| members/{uid} | メンバー。コレクショングループでは自分のドキュメントのみ | 下記の「メンバーの追加」を参照 | 不可 | オーナー（他のメンバーを外す）、本人（ボードを抜ける）、オーナー本人（ボードの削除後のみ） |
| invites/{id} | 単体の取得はログイン済みなら誰でも。一覧の取得はオーナーのみ | オーナー | オーナー（`revoked` を true にすることのみ） | オーナー（ボードの削除後のみ） |
| columns | メンバー | メンバー | メンバー | オーナー（アーカイブ済み、またはボードの削除後） |
| cards | メンバー | メンバー。`createdBy` と `updatedBy` は自分 | メンバー。`updatedBy` は自分。作成者と作成日時は変更不可 | オーナー（下記の「完全削除できるカード」） |
| comments | メンバー | メンバー。`authorId` は自分 | 投稿者本人 | 投稿者本人、またはオーナー（完全削除できるカードのもの） |
| history | メンバー | メンバー。`actorId` は自分、`createdAt` はサーバー時刻 | 不可 | オーナー（完全削除できるカードのもの） |

「メンバーである」の判定は `exists(/boards/{b}/members/{自分の uid})` で行う。

メンバーの追加（members の作成）を許可する条件。ドキュメント ID と `uid` が自分の uid であることに加えて、次のどちらかを満たすこと：

- ボードの作成者が、ボードと同じバッチで自分を `owner` として追加する
- `role` が `"member"` で、`inviteId` で指す招待が存在し、`revoked` が false で、`createdAt` から 7 日以内である

完全削除できるカード：カード自身か所属する列がアーカイブ済みであるか、ボードが削除済みであること。削除を途中からやり直せるよう、カードや列がすでに無い場合も許可する。

日時のフィールド（`createdAt`、`updatedAt`、`joinedAt` など）は、すべてサーバー時刻（`serverTimestamp()`）でなければならない。

## 4. 削除の扱い

Spark プランでは Cloud Functions が使えず、Firestore はサブコレクションを自動では消さない。そのため、削除はクライアントがまとめて行う。

- カードの完全削除：`comments`、`history` を消してからカード本体を消す
- 列の完全削除：列内のカードをすべて上記の手順で消してから、列を消す
- ボードの削除：次の順で消す
  1. ボード本体を消す。この時点で、他のメンバーからはボードが見えなくなる
  2. 配下の `invites`、`columns`、`cards`（とその `comments`、`history`）、他のメンバーの `members` を消す
  3. 最後に、オーナー自身の `members` を消す

途中で失敗しても、もう一度実行すれば最後まで消せるように作る。ボードの削除が途中で止まった場合、オーナーの `members` は残っているがボード本体は無い、という状態になる。ボード一覧（S-02）でこの状態を見つけたら、削除の続きを実行する。

Security Rules では、1 回のリクエストで他のドキュメントを参照できる回数に上限がある（単体の書き込みは 10 回、バッチは合計 20 回）。完全削除のルールは 1 件あたり 3〜4 回参照するため、削除は 1 件ずつ（並列で）送るか、バッチを 5 件以下に分ける。

## 5. 必要なインデックス

- `members` のコレクショングループ：`uid` の単一フィールドインデックス（コレクショングループ範囲を有効にする）
- その他のクエリは、ボード内のサブコレクションをすべて読み込んでクライアント側で並べ替えるので、複合インデックスは不要の見込み
