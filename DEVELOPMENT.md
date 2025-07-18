# 開発環境セットアップ

## ローカル開発コマンド

### 基本的な開発
```bash
# フロントエンド開発サーバー起動
npm run dev

# フロントエンド + Firebase Functions エミュレーター同時起動
npm run dev:full
```

### Firebase Functions関連
```bash
# Functionsビルド
npm run functions:build

# Functionsエミュレーター単体起動
npm run emulators

# Functionsデプロイ
npm run functions:deploy

# Functionsログ確認
npm run functions:logs
```

### テスト・品質チェック
```bash
# テスト実行
npm run test

# テストUI起動
npm run test:ui

# リント実行
npm run lint

# リント自動修正
npm run lint:fix

# 型チェック
npm run typecheck
```

### ビルド・デプロイ
```bash
# フロントエンドビルド
npm run build

# 全体デプロイ（フロントエンド + Functions）
npm run deploy
```

## Firebase Functions環境変数

### 本番環境
```bash
# 設定確認
firebase functions:config:get

# 設定追加
firebase functions:config:set algolia.app_id="YOUR_APP_ID" algolia.admin_key="YOUR_ADMIN_KEY"
```

### ローカル開発環境
`functions/.env` ファイルに以下を設定：
```
ALGOLIA_APP_ID=VE0JZILTOJ
ALGOLIA_ADMIN_KEY=your_admin_key_here
```

## 開発ワークフロー

1. **日常開発**
   ```bash
   npm run dev:full
   ```

2. **Functions変更時**
   ```bash
   npm run functions:build
   # エミュレーターが自動リロード
   ```

3. **デプロイ前チェック**
   ```bash
   npm run lint
   npm run typecheck
   npm run test
   npm run build
   ```

4. **デプロイ**
   ```bash
   npm run deploy
   ```

## トラブルシューティング

### エミュレーターでFunctionsが読み込まれない
```bash
# Functionsをビルドし直す
npm run functions:build

# エミュレーター再起動
npm run emulators
```

### CORS エラーが発生する
- エミュレーターが正常に起動しているか確認
- `functions/.env` ファイルが正しく設定されているか確認
- ブラウザを開発者モードでリロード

### 本番環境でAlgolia同期が動作しない
```bash
# Functions設定確認
firebase functions:config:get

# ログ確認
npm run functions:logs
```