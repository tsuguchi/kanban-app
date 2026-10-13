# kanban-app

小規模チーム向けのカンバン型タスク管理アプリ。

- 要件：[REQUIREMENTS.md](REQUIREMENTS.md)
- データ構造：[DATA_MODEL.md](DATA_MODEL.md)

## 構成

| 役割 | 技術 |
|---|---|
| フロントエンド | React + TypeScript + Vite、React Router |
| 認証・DB | Firebase Authentication、Cloud Firestore（Spark プラン） |
| 配信 | Cloudflare Workers（静的アセット配信） |

## ローカル開発

必要なもの：

- Node.js 24 以上
- Java（JDK 21 以上。Oracle JDK 25 で動作確認済み）。Firebase Emulator を動かすのに使う

```sh
npm install
cp .env.example .env.local   # そのままで Emulator に接続する設定になっている
npm run emulators            # 別のターミナルで起動しておく。管理画面は http://127.0.0.1:4000
npm run dev
```

Emulator は Firebase へのログインが不要な `demo-kanban` プロジェクトとして動くので、本番のデータには触れない。

テストは、Emulator を起動した状態で実行する。Security Rules のテスト（`tests/firestore.rules.test.ts`）と、`src/lib` のデータ操作が本番と同じルールの下で動くかのテスト（`tests/lib.test.ts`）がある。

```sh
npm test
```

ログイン画面を試すときは、Emulator の偽のログイン画面が開く。「Add new account」で好きな名前とメールアドレスのユーザーを作ってログインできる。

`npm run test:ci` は Emulator の起動から停止までを自動で行う。ただし Windows では、終了後も Firestore Emulator（java.exe）が残ってポート 8080 を使い続けることがあるため、CI（Linux）向けとする。

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバーを起動する |
| `npm run build` | 型チェックと本番用ビルド（`dist/`） |
| `npm run lint` | oxlint で静的解析する |
| `npm run emulators` | Firebase Emulator（Auth、Firestore）を起動する |
| `npm test` | テストを実行する（Emulator の起動が必要） |
| `npm run deploy:rules` | Firestore の Security Rules とインデックスを本番に反映する |
| `npm run deploy` | ビルドして Cloudflare Workers に手動でデプロイする（通常は下記の自動デプロイを使う） |

## 初回セットアップ

最初に一度だけ行う作業。

### 1. Firebase

1. [Firebase コンソール](https://console.firebase.google.com/)でプロジェクトを作る。料金プランは Spark（無料）のままにする
2. Firestore Database を作る
   - ロケーションは `asia-northeast1`（東京）。後から変更できない
   - 本番環境モードで開始する（このリポジトリの `firestore.rules` で上書きする）
3. Authentication を有効にし、ログイン方法に次の 2 つを追加する
   - Google
   - GitHub：GitHub の [Developer settings](https://github.com/settings/developers) で OAuth App を作り、Firebase の画面に表示されるコールバック URL を登録する。発行されたクライアント ID とシークレットを Firebase に入力する
4. 「ユーザー アカウントのリンク」の設定が「同じメールアドレスを使用するアカウントをリンクする」になっていることを確認する（REQUIREMENTS.md F-05）
5. 「プロジェクトの設定」→「マイアプリ」でウェブアプリを追加し、表示された設定値を控えておく（Cloudflare のビルド設定に登録する。本番に接続して試すときは `.env.local` にも入れる）
6. CLI でログインし、このリポジトリとプロジェクトを結び付けて、ルールを反映する

   ```sh
   npx firebase login
   npx firebase use --add      # 作ったプロジェクトを選ぶ。.firebaserc ができる
   npm run deploy:rules
   ```

### 2. Cloudflare Workers

1. Cloudflare のダッシュボードで「Workers & Pages」→「作成」→ GitHub リポジトリをインポートし、このリポジトリを選ぶ
2. ビルドの設定
   - ビルドコマンド：`npm run build`
   - デプロイコマンド：`npx wrangler deploy`
   - ビルド時の環境変数に、`.env.example` の `VITE_FIREBASE_*` の 4 つを登録する（`VITE_USE_EMULATOR` は登録しない）
3. 以後、`main` に push すると自動でデプロイされる
4. デプロイ後の URL（`kanban-app.<アカウント名>.workers.dev`）を、Firebase Authentication の「設定」→「承認済みドメイン」に追加する。これをしないと本番でログインできない
