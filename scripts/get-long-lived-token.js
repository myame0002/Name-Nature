#!/usr/bin/env node

/**
 * iNaturalist 長期トークン取得スクリプト
 *
 * 使い方:
 * 1. iNaturalistでアプリケーションを登録し、Client IDとClient Secretを取得
 *    https://www.inaturalist.org/oauth/applications
 *
 * 2. 以下のURLをブラウザで開く（YOUR_CLIENT_IDを置き換え）:
 *    https://www.inaturalist.org/oauth/authorize?client_id=YOUR_CLIENT_ID&redirect_uri=urn:ietf:wg:oauth:2.0:oob&response_type=code&scope=write
 *
 * 3. 認証後、表示されるAuthorization Codeをコピー
 *
 * 4. このスクリプトを実行:
 *    node scripts/get-long-lived-token.js CLIENT_ID CLIENT_SECRET AUTHORIZATION_CODE
 *
 * 5. 出力されたaccess_tokenをCloudflare WorkersのSecretsに設定:
 *    cd workers && wrangler secret put INATURALIST_API_TOKEN
 */

const https = require('https');

const [clientId, clientSecret, authCode] = process.argv.slice(2);

if (!clientId || !clientSecret || !authCode) {
  console.error('Usage: node get-long-lived-token.js CLIENT_ID CLIENT_SECRET AUTHORIZATION_CODE');
  console.error('');
  console.error('Steps:');
  console.error('1. Register app at https://www.inaturalist.org/oauth/applications');
  console.error('2. Open this URL in browser (replace YOUR_CLIENT_ID):');
  console.error('   https://www.inaturalist.org/oauth/authorize?client_id=YOUR_CLIENT_ID&redirect_uri=urn:ietf:wg:oauth:2.0:oob&response_type=code&scope=write');
  console.error('3. Copy the authorization code from the browser');
  console.error('4. Run this script with Client ID, Client Secret, and Authorization Code');
  process.exit(1);
}

const postData = new URLSearchParams({
  client_id: clientId,
  client_secret: clientSecret,
  code: authCode,
  redirect_uri: 'urn:ietf:wg:oauth:2.0:oob',
  grant_type: 'authorization_code',
}).toString();

const options = {
  hostname: 'www.inaturalist.org',
  port: 443,
  path: '/oauth/token',
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(postData),
  },
};

const req = https.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const json = JSON.parse(data);

      if (json.error) {
        console.error('Error:', json.error);
        console.error('Description:', json.error_description);
        process.exit(1);
      }

      if (json.access_token) {
        console.log('');
        console.log('✅ Long-lived token obtained successfully!');
        console.log('');
        console.log('Access Token:');
        console.log(json.access_token);
        console.log('');
        console.log('Token Type:', json.token_type);
        console.log('Expires In:', json.expires_in, 'seconds (~' + Math.round(json.expires_in / 86400) + ' days)');
        console.log('');
        console.log('Next steps:');
        console.log('1. Copy the access token above');
        console.log('2. Run: cd workers && wrangler secret put INATURALIST_API_TOKEN');
        console.log('3. Paste the token when prompted');
        console.log('4. Deploy: wrangler deploy');
        console.log('');
      } else {
        console.error('Unexpected response:', data);
        process.exit(1);
      }
    } catch (e) {
      console.error('Failed to parse response:', data);
      process.exit(1);
    }
  });
});

req.on('error', (e) => {
  console.error('Request failed:', e);
  process.exit(1);
});

req.write(postData);
req.end();

</parameter>
<task_progress>
- [x] 現在のAPI実装を確認
- [x] Cloudflare Workersの実装を確認
- [x] iNaturalist APIの認証方法を特定
- [x] 問題の原因を分析
- [x] 解決策を実装（ドキュメント作成）
- [x] 長期トークン取得スクリプト作成
- [ ] トークン管理機能の改善
- [ ] 動作確認
</task_progress>
</write_to_file>