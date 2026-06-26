# iNaturalist トークン設定ガイド

## 問題の概要

現在、Cloudflare Workersで使用しているiNaturalist APIトークンが約2日で無効になります。これは**短期トークン（Short-lived token）** を使用しているためです。

## 解決策：長期トークン（Long-lived token）の使用

iNaturalistには**長期トークン**という仕組みがあり、通常1年間程度有効です。

## 長期トークンの取得方法

### 1. iNaturalist アプリケーションの登録

1. [iNaturalist 開発者ページ](https://www.inaturalist.org/oauth/applications) にアクセス
2. 「Register new application」をクリック
3. 以下の情報を入力：
   - **Application name**: Name Nature（または任意の名前）
   - **Redirect URI**: `urn:ietf:wg:oauth:2.0:oob`（デスクトップアプリ用）
   - **Description**: 自然写真解析アプリ
4. 登録後、**Client ID** と **Client Secret** が発行される（後で使用）

### 2. 長期トークンの取得

#### 方法A：ブラウザで手動取得（推奨）

1. 以下のURLをブラウザで開く（`YOUR_CLIENT_ID`を置き換え）：
   ```
   https://www.inaturalist.org/oauth/authorize?client_id=YOUR_CLIENT_ID&redirect_uri=urn:ietf:wg:oauth:2.0:oob&response_type=code&scope=write
   ```

2. iNaturalistにログインし、認証を許可

3. 認証後、**Authorization Code** が表示される

4. 以下のコマンドを実行して長期トークンを取得：
   ```bash
   curl -X POST https://www.inaturalist.org/oauth/token \
     -d "client_id=YOUR_CLIENT_ID" \
     -d "client_secret=YOUR_CLIENT_SECRET" \
     -d "code=AUTHORIZATION_CODE" \
     -d "redirect_uri=urn:ietf:wg:oauth:2.0:oob" \
     -d "grant_type=authorization_code"
   ```

5. レスポンスから `access_token` をコピー（これが長期トークン）

#### 方法B：iNaturalist API Tester ツール使用

1. [iNaturalist API Tester](https://www.inaturalist.org/oauth/applications) にアクセス
2. 登録したアプリケーションを選択
3. 「Get access token」をクリック
4. 必要なスコープ（`write`）を選択
5. 長期トークンが表示されるのでコピー

### 3. Cloudflare Workers へのトークン設定

長期トークンを取得したら、Cloudflare WorkersのSecretsに設定します：

```bash
cd workers
wrangler secret put INATURALIST_API_TOKEN
```

プロンプトが表示されたら、取得した長期トークンを貼り付けてEnter。

### 4. 動作確認

```bash
cd workers
wrangler dev
```

ローカルでテスト後、デプロイ：
```bash
wrangler deploy
```

## トークンの有効期限確認

長期トークンは通常1年間有効ですが、以下の場合に無効になることがあります：

- iNaturalistアカウントのパスワード変更
- アプリケーションの権取り消し
- iNaturalist側のセキュリティポリシー変更

**定期的な確認を推奨：** 3ヶ月に1回程度、APIが正常に動作するか確認してください。

## トラブルシューティング

### トークンが無効になった場合

1. 上記の手順で新しい長期トークンを取得
2. `wrangler secret put INATURALIST_API_TOKEN` で更新
3. `wrangler deploy` で再デプロイ

### API エラーが発生する場合

Workersのログを確認：
```bash
wrangler tail
```

エラーメッセージから原因を特定してください。

## 参考リンク

- [iNaturalist API ドキュメント](https://api.inaturalist.org/v1/docs/)
- [iNaturalist OAuth ドキュメント](https://www.inaturalist.org/pages/api+reference#auth)
- [Cloudflare Workers Secrets ドキュメント](https://developers.cloudflare.com/workers/platform/environment-variables/#secrets)