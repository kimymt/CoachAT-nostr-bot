# CoachAT-nostr-bot

[English](README.md) | 日本語

このリポジトリのコンテンツはすべて、エンジニアではない作者が LLM を用いて生成したものです。内容は十分に確認のうえ、自己責任でご利用ください。

## 概要
Cloudflare Worker 上で動作する、Nostr プロトコル向けの非公式 Alex Toussaint ボットです。

## プロジェクトのセットアップ

**1. プロジェクトファイルの配置**
配布された各ファイルを適切なディレクトリに配置してください。プロジェクトの構成は次のようになります。

```
nostr-bot/
├── package.json
├── wrangler.toml
├── vitest.config.js
├── src/
│   ├── index.js
│   └── index.test.js
├── generate-keys.js
└── setup.sh
```

**2. 依存パッケージのインストール**
プロジェクトディレクトリで以下のコマンドを実行し、必要なライブラリをすべてインストールします。

```bash
npm install
```

これにより `nostr-tools` をはじめとする依存パッケージがインストールされます。なお、`bash setup.sh` を実行すると、依存パッケージのインストールと次手順の案内をまとめて行えます(任意)。

**3. Cloudflare アカウントの認証**
Wrangler CLI を使って Cloudflare アカウントにログインします。

```bash
wrangler login
```

ブラウザが開き、Cloudflare アカウントでの認証を求められます。

### 秘密鍵の生成と設定

**1. 新しい秘密鍵を生成する**
プロジェクトに含まれる鍵生成スクリプトを使い、新しい Nostr 秘密鍵を作成します。

```bash
node generate-keys.js
```

このスクリプトは、暗号学的に安全な秘密鍵と対応する公開鍵を生成し、設定方法を併せて表示します。

**2. 秘密鍵を設定する**
生成した秘密鍵を、Cloudflare Workers の環境変数(シークレット)として登録します。

```bash
wrangler secret put NOSTR_PRIVATE_KEY
```

プロンプトが表示されたら、生成された秘密鍵(16 進数文字列)を入力してください。

**3. 設定の確認**
登録が成功したかどうかは、次のコマンドで現在のシークレット一覧を表示して確認できます。

```bash
wrangler secret list
```

### リレーの設定

ボットは、`wrangler.toml` の `[vars]` セクションで定義されているカンマ区切りの `NOSTR_RELAYS` を読み込みます。デフォルト値は以下のとおりです。

```
NOSTR_RELAYS = "wss://relay.damus.io,wss://nos.lol"
```

`NOSTR_RELAYS` が未設定の場合、Worker は実行時に同じ 2 つのリレーへフォールバックします。別のリレーを使いたい場合は、デプロイ前に `wrangler.toml` を編集してください。

## スケジュール

Worker は `wrangler.toml` で定義された cron によって起動されます。

```
crons = ["55 * * * *"]
```

毎時 55 分(UTC)に発火します。ハンドラは起動時刻を JST に変換し、JST の時刻と曜日に応じて投稿メッセージを切り替えます。

- JST 月曜 06:55 — `Let's conquer Mondy, conquer this week.`
- JST 07:55 〜 16:55 — 1 時間ごとに異なるメッセージ(詳細は `src/index.js` を参照)
- 上記以外の時刻 — フォールバックメッセージ:`Let go, be free, do you have fun? And most importantly, spread love.`

cron は毎時 :55(UTC)に動作するため、ボットは 24 時間投稿を行います。専用メッセージが用意されているのは JST 06:55〜16:55 の時間帯のみで、それ以外はフォールバックメッセージが投稿されます。

## 開発

```bash
npm run dev            # ローカルで wrangler dev を起動
npm test               # Vitest によるテストを 1 回実行
npm run test:watch     # 変更検知してテストを再実行
npm run test:coverage  # カバレッジ付きでテストを実行
```

## デプロイ

シークレットとリレーの設定が済んだら、以下のコマンドで Worker をデプロイします。

```bash
npm run deploy
```

このコマンドは内部的に `wrangler deploy` を呼び出します。

## HTTP エンドポイント

デプロイ後、Worker は診断用に次のエンドポイントを提供します。

- `GET /` — 利用可能なエンドポイントを JSON で一覧表示
- `GET /test` — `scheduled` ハンドラを手動で起動してメッセージを投稿
- `GET /status` — リレー設定、導出された公開鍵、`NOSTR_PRIVATE_KEY` の設定有無を返却
- `GET /ping` — `wss://relay.damus.io` への WebSocket 疎通を確認

## ライセンス

本プロジェクトは MIT ライセンスのもとで提供されます。詳細は [LICENSE](LICENSE) を参照してください。
