# Name Nature

自然写真を解析して図鑑を作成するアプリです。iNaturalistのコンピュータビジョンAPIを利用して、花・キノコ・鳥・昆虫を識別します。

## iNaturalist API トークン管理

本アプリはCloudflare Workers経由でiNaturalist APIを呼び出しています。APIトークンは**長期トークン（Long-lived token）** を使用することを推奨します。

### トークン有効期限について

- **短期トークン**: 約2日で無効になる（旧方式）
- **長期トークン**: 約1年間有効（推奨）

### 長期トークンの取得方法

詳細な手順は [docs/INATURALIST_TOKEN_SETUP.md](docs/INATURALIST_TOKEN_SETUP.md) を参照してください。

簡易手順:
1. [iNaturalist 開発者ページ](https://www.inaturalist.org/oauth/applications) でアプリケーションを登録
2. OAuth認証フローで長期トークンを取得
3. `cd workers && wrangler secret put INATURALIST_API_TOKEN` でトークンを設定
4. `wrangler deploy` でデプロイ

### トークン期限切れの検出

本アプリはトークンの期限切れを自動検出し、ユーザーに通知します。フロントエンド・バックエンド両方でエラーハンドリングを実装しています。

## 技術スタック

- **Frontend**: Expo (React Native)
- **Backend**: Cloudflare Workers
- **API**: iNaturalist Computer Vision API
- **Storage**: AsyncStorage / localStorage

## 開発環境のセットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定

WorkersのSecretsにiNaturalist APIトークンを設定:

```bash
cd workers
wrangler secret put INATURALIST_API_TOKEN
```

### 3. アプリの起動

```bash
# Workersのローカル開発
cd workers
wrangler dev

# Expoアプリ（別ターミナル）
npx expo start
```

## 機能

- 📸 写真を撮影またはライブラリから選択
- 🔍 iNaturalist APIによる自動識別
- 📚 図鑑機能（候補の保存・管理）
- 🌐 日本語/英語対応
- 💎 プレミアム機能（無制限図鑑エントリ）

## ライセンス

[LICENSE](LICENSE)

## 参考リンク

- [iNaturalist API ドキュメント](https://api.inaturalist.org/v1/docs/)
- [Cloudflare Workers ドキュメント](https://developers.cloudflare.com/workers/)
- [Expo ドキュメント](https://docs.expo.dev/)

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
