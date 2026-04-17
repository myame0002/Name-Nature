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

import { setPremiumUser, isPremiumUser, loadPremiumStatus } from './api';

// App Store / Google Play 商品ID
export const PREMIUM_PRODUCT_ID = 'app.namenature.full_version';
export const PREMIUM_PRICE = '490円';

let isInitialized = false;
let purchaseUpdateSubscription: any = null;

/**
 * アプリ内課金システムを初期化
 */
export async function initPremiumSystem() {
  if (isInitialized) return;

  try {
    await loadPremiumStatus();

    if (Platform.OS !== 'web') {
      await initConnection();

      // 購入済みかどうか復元チェック
      await getAvailablePurchases();
      
      // 購入イベントリスナー
      purchaseUpdateSubscription = purchaseUpdatedListener(async (purchase: Purchase) => {
        if (purchase.productId === PREMIUM_PRODUCT_ID) {
          // 購入完了: 永続化
          setPremiumUser(true);
          await finishTransaction({ purchase, isConsumable: false });
          
          Alert.alert(
            ' ありがとうございます！',
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
  // テスター版の場合は購入画面に普通に進める（実際に課金して正規のライセンスに移行できるように）
  if (isPremiumUser() && !__IS_TESTER_PREMIUM__) {
    Alert.alert('お知らせ', '既に完全版を購入済みです。');
    return;
  }

  if (Platform.OS === 'web') {
    // Web版の場合はデモ処理
    Alert.alert(
      ' 完全版にアップグレード',
      `モバイルアプリ版からご購入いただけます。\n\n価格: ${PREMIUM_PRICE} （一回払い）`,
      [{ text: 'OK' }]
    );
    return;
  }

  try {
    const products = await fetchProducts({ skus: [PREMIUM_PRODUCT_ID] });
    
    if (!products || products.length === 0) {
      Alert.alert('エラー', '商品情報を取得できませんでした。後ほどお試しください。');
      return;
    }

    await requestPurchase({ skus: [PREMIUM_PRODUCT_ID] } as any);
  } catch (e) {
    Alert.alert('エラー', '購入処理に失敗しました。');
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

// テスター版フラグ
export let __IS_TESTER_PREMIUM__ = false;

/**
 * クローズドテスター用 完全版開放
 * シークレットコード認証済みの場合に呼び出し
 */
export function activateTesterPremium() {
  __IS_TESTER_PREMIUM__ = true;
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
