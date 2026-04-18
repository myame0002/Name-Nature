/**
 * アプリ内課金 完全版 490円
 * 消費型ではなく永久ライセンス
 * react-native-iap 版 (SDK52 対応)
 */
import { Platform, Alert } from 'react-native';
import {
  initConnection,
  endConnection,
  fetchProducts,
  requestPurchase,
  getAvailablePurchases,
  purchaseUpdatedListener,
  finishTransaction,
  Product,
  Purchase,
} from 'react-native-iap';

import { setPremiumUser, isPremiumUser, loadPremiumStatus, AsyncStorage } from './api';

// App Store / Google Play 商品ID
export const PREMIUM_PRODUCT_ID = 'app.namenature.full_version';
export const PREMIUM_PRICE = '490円';

let isInitialized = false;
let purchaseUpdateSubscription: any = null;

// テスター版フラグ
export let __IS_TESTER_PREMIUM__ = false;

/**
 * アプリ内課金システムを初期化
 */
export async function initPremiumSystem() {
  if (isInitialized) return;

  try {
    await loadPremiumStatus();

    // テスターフラグ復元
    if (Platform.OS === 'web') {
      __IS_TESTER_PREMIUM__ = localStorage.getItem('tester_premium') === 'true';
    } else {
      const stored = await AsyncStorage.getItem('tester_premium');
      __IS_TESTER_PREMIUM__ = stored === 'true';
    }

    if (Platform.OS !== 'web') {
      await initConnection();

      // 購入済みかどうか復元チェック
      await getAvailablePurchases();
      
      // 購入イベントリスナー
      purchaseUpdateSubscription = purchaseUpdatedListener(async (purchase: Purchase) => {
        if (purchase.productId === PREMIUM_PRODUCT_ID) {
          // 購入完了: 永続化
          setPremiumUser(true);
          // 正規購入したらテスターフラグを外す
          __IS_TESTER_PREMIUM__ = false;
          if (Platform.OS === 'web') {
            localStorage.removeItem('tester_premium');
          } else {
            await AsyncStorage.removeItem('tester_premium');
          }
          await finishTransaction({ purchase, isConsumable: false });
          
          Alert.alert(
            '🎉 ありがとうございます！',
            '完全版にアップグレードされました。\n全ての機能が無制限に使えるようになりました！',
            [{ text: 'OK' }]
          );
        }
      });
    }

    isInitialized = true;
  } catch (e) {
    console.log('Premium init error', e);
  }
}

/**
 * 完全版を購入
 */
export async function purchasePremium() {
  // テスター版の場合
  if (__IS_TESTER_PREMIUM__) {
    Alert.alert(
      'テスターモード',
      'あなたはクローズドテスターとして既に完全版が開放されています。\n\n購入フローの動作確認を行いますか？',
      [
        { text: 'キャンセル', style: 'cancel' },
        { 
          text: '✅ 購入画面を起動', 
          onPress: async () => {
            // テスター用: 購入フローの動作確認モード
            try {
              await requestPurchase({
                sku: PREMIUM_PRODUCT_ID,
                productId: PREMIUM_PRODUCT_ID,
                obfuscatedAccountId: "tester_user",
                purchaseType: 'inapp'
              } as any);
            } catch (e) {
              Alert.alert('テスト結果', String(e));
            }
          }
        }
      ]
    );
    return;
  }

  if (isPremiumUser()) {
    Alert.alert('お知らせ', '既に完全版を購入済みです。');
    return;
  }

  if (Platform.OS === 'web') {
    // Web版の場合はデモ処理
    Alert.alert(
      '✨ 完全版にアップグレード',
      `モバイルアプリ版からご購入いただけます。\n\n価格: ${PREMIUM_PRICE} （一回払い）`,
      [{ text: 'OK' }]
    );
    return;
  }

  try {
    let products: any[] = [];
    
    try {
      // 本番環境では必ず商品取得が成功する必要がある
      products = await fetchProducts({ skus: [PREMIUM_PRODUCT_ID] });
    } catch (fetchErr) {
      // 開発環境/テスト環境では商品取得が失敗するのが普通
      // テスターユーザーの場合だけは失敗を許可する
      if (!__IS_TESTER_PREMIUM__) {
        throw fetchErr;
      }
    }

    // テスターユーザー以外は商品が取得できないと購入できない
    if (!__IS_TESTER_PREMIUM__ && (!products || products.length === 0)) {
      throw new Error("商品情報が取得できませんでした。Google Play / App Store に正しく登録されているか確認してください。");
    }

    // 正しいパラメータ (最新バージョンでのみ動作する組み合わせ)
    await requestPurchase({
      sku: PREMIUM_PRODUCT_ID,
      productId: PREMIUM_PRODUCT_ID,
      obfuscatedAccountId: "tester_user",
      purchaseType: 'inapp'
    } as any);
  } catch (e) {
    Alert.alert('エラー', '購入画面を開けませんでした。\nアプリを再起動してもう一度お試しください。\n\n' + String(e));
  }
}

/**
 * 購入を復元
 */
export async function restorePremiumPurchase() {
  if (Platform.OS === 'web') {
    return;
  }

  try {
    await getAvailablePurchases();
    
    if (!isPremiumUser()) {
      Alert.alert(
        '復元結果',
        '購入履歴が見つかりませんでした。\n同じアカウントで購入されているかご確認ください。'
      );
    }
  } catch (e) {
    Alert.alert('エラー', '復元処理に失敗しました。');
  }
}

/**
 * 完全版購入ダイアログを表示
 */
export function showPremiumUpgradeAlert() {
  Alert.alert(
    '🔒 完全版にアップグレード',
    `無料版では最大10件まで図鑑に保存できます。\n\n完全版 ${PREMIUM_PRICE} （一回払い）の特典:\n✅ 図鑑保存 無制限\n✅ オリジナルしおり作成機能\n✅ 今後の全機能アップデート`,
    [
      { text: '後で', style: 'cancel' },
      { text: '✨ 購入する', onPress: purchasePremium },
      { text: '購入を復元', onPress: restorePremiumPurchase }
    ]
  );
}

/**
 * クローズドテスター用 完全版開放
 * シークレットコード認証済みの場合に呼び出し
 */
export function activateTesterPremium() {
  __IS_TESTER_PREMIUM__ = true;
  // テスターフラグも永続化
  if (Platform.OS === 'web') {
    localStorage.setItem('tester_premium', 'true');
  } else {
    AsyncStorage.setItem('tester_premium', 'true');
  }
  setPremiumUser(true);
  Alert.alert(
    '✅ テスター登録完了',
    '完全版が永久に開放されました！\nクローズドテストへようこそ。\n\n全ての機能が無制限で利用可能です。',
    [{ text: 'ありがとう' }]
  );
}

/**
 * シークレットコード検証
 */
export function verifyTesterCode(code: string): boolean {
  const validCodes = [
    'NATURE2026',
    'TESTER0417',
    'CLOSED_BETA'
  ];
  
  return validCodes.includes(code.trim().toUpperCase());
}

/**
 * アプリ終了時のクリーンアップ
 */
export function cleanupPremiumSystem() {
  if (purchaseUpdateSubscription) {
    purchaseUpdateSubscription.remove();
    purchaseUpdateSubscription = null;
  }
  endConnection();
  isInitialized = false;
}