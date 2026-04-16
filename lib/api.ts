/**
 * API client for the Nature Pics analysis server.
 *
 * The server (F:\Nature-Pics\server.mjs) proxies requests to iNaturalist's
 * computer vision API and returns normalized candidate results.
 *
 * Set API_BASE_URL below to point at the running server instance.
 */

// iNaturalist API 直接接続設定
let INATURALIST_API_TOKEN: string | null = null;
const JAPAN_PLACE_ID = 6737;

// デバッグ用：期限切れシミュレーションモード
let SIMULATE_TOKEN_EXPIRED: boolean = false;

/**
 * デバッグ用：トークン期限切れをシミュレートします
 * true に設定するとトークン自体は有効なまま、APIリクエストのみ強制的に401エラーを返します
 */
export function setTokenExpiredSimulation(enabled: boolean) {
  SIMULATE_TOKEN_EXPIRED = enabled;
}

/**
 * 現在期限切れシミュレーションモードが有効かどうかを返します
 */
export function isTokenExpiredSimulationEnabled(): boolean {
  return SIMULATE_TOKEN_EXPIRED;
}

const categoryConfig = {
  flower: {
    id: "flower",
    name: "花",
    taxonId: 47125,
    notice:
      "花カテゴリは iNaturalist の Flowering Plants 系統に絞って照合しています。",
    preferredRanks: ["species", "genus", "subspecies", "variety", "family"],
    suppressedRanks: ["subsection", "section", "tribe", "subtribe"],
    minScore: 0.03,
  },
  fungus: {
    id: "fungus",
    name: "キノコ",
    taxonId: 47170,
    notice: "キノコカテゴリは Fungi に限定して候補を返します。",
    preferredRanks: ["species", "genus", "family", "order"],
    suppressedRanks: [
      "subsection",
      "section",
      "tribe",
      "subtribe",
      "class",
      "phylum",
      "kingdom",
    ],
    minScore: 0.025,
  },
  bird: {
    id: "bird",
    name: "鳥",
    taxonId: 3,
    notice: "鳥カテゴリは Aves に限定して候補を返します。",
    preferredRanks: ["species", "genus", "family"],
    suppressedRanks: ["subsection", "section", "tribe", "subtribe"],
    minScore: 0.03,
  },
  insect: {
    id: "insect",
    name: "昆虫",
    taxonId: 47158,
    notice: "昆虫カテゴリは Insecta に限定して候補を返します。",
    preferredRanks: ["species", "genus", "family", "order"],
    suppressedRanks: ["subsection", "section", "tribe", "subtribe"],
    minScore: 0.03,
  },
};

// ── Types ──────────────────────────────────────────────────────────

export type CategoryId = "flower" | "fungus" | "bird" | "insect";

export type TaxonomyInfo = {
  kingdom: string | null;
  phylum: string | null;
  class: string | null;
  order: string | null;
  family: string | null;
  genus: string | null;
  species: string | null;
};

export type Candidate = {
  id: string;
  name: string;
  scientificName: string;
  confidence: number;
  summary: string;
  checkpoints: string[];
  referenceImage: string | null;
  referenceUrl: string;
  rankLabel: string;
  taxonomy: TaxonomyInfo;
};

export type AnalysisResponse = {
  category: {
    id: CategoryId;
    name: string;
    notice: string;
  };
  notice?: string;
  results: Candidate[];
  totalResults: number;
};

export type AnalysisStatus = "idle" | "ready" | "loading" | "success" | "error";

// ── Helpers ────────────────────────────────────────────────────────

function parseJsonBody(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

function extractErrorMessage(
  json: unknown,
  status: number,
  rawText: string,
): string {
  if (json && typeof json === "object") {
    const record = json as Record<string, unknown>;
    if (typeof record.detail === "string" && record.detail.trim())
      return record.detail;
    if (typeof record.error === "string" && record.error.trim())
      return record.error;
    if (typeof record.message === "string" && record.message.trim())
      return record.message;
  }
  const snippet = rawText.trim().slice(0, 240);
  if (snippet && !snippet.startsWith("<")) {
    return `APIエラー (${status}): ${snippet}`;
  }
  return `APIがエラーを返しました (${status})。サーバーが起動しているか確認してください。`;
}

/**
 * Convert a File object to a base64 data URL (web).
 */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("画像の読み取りに失敗しました。"));
      }
    };
    reader.onerror = () =>
      reject(new Error("画像の読み取り中にエラーが発生しました。"));
    reader.readAsDataURL(file);
  });
}

/**
 * Convert a local image URI (from expo-image-picker) to a base64 data URL.
 */
export async function uriToDataUrl(uri: string): Promise<string> {
  const response = await fetch(uri);
  const blob = await response.blob();
  return fileToDataUrl(blob as File);
}

// ── API Call ────────────────────────────────────────────────────────

export type GuideEntry = {
  id: string;
  category: CategoryId;
  approval: "confirmed" | "rejected";
  title: string;
  scientificName: string;
  family?: string;
  observedAt: string;
  confidence?: number;
  imageUrl: string;
  note: string;
  customTitle?: string;
  chatHistory: { id: string; role: "user" | "assistant"; content: string }[];
  taxonomy?: TaxonomyInfo;
  imageDataUrl?: string;
  // 候補を選んで保存された瞬間の元のデータ - 永久に変更されない
  original?: {
    title: string;
    scientificName: string;
    taxonomy: TaxonomyInfo;
  };
};

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

// 有料制限設定
export const FREE_ENTRY_LIMIT = 10;
export let IS_PREMIUM_USER = false;
const PREMIUM_STORAGE_KEY = "premium_purchased";

export function setPremiumUser(enabled: boolean) {
  IS_PREMIUM_USER = enabled;
  if (Platform.OS === "web") {
    localStorage.setItem(PREMIUM_STORAGE_KEY, enabled ? "true" : "false");
  } else {
    AsyncStorage.setItem(PREMIUM_STORAGE_KEY, enabled ? "true" : "false");
  }
}

export function isPremiumUser(): boolean {
  return IS_PREMIUM_USER;
}

export async function loadPremiumStatus() {
  try {
    let stored: string | null = null;
    if (Platform.OS === "web") {
      stored = localStorage.getItem(PREMIUM_STORAGE_KEY);
    } else {
      stored = await AsyncStorage.getItem(PREMIUM_STORAGE_KEY);
    }
    IS_PREMIUM_USER = stored === "true";
  } catch (e) {
    IS_PREMIUM_USER = false;
  }
}

let guideEntriesStorage: GuideEntry[] = [];

// プラットフォームに応じたストレージからデータを読み込み
async function loadFromStorage() {
  try {
    if (Platform.OS === "web") {
      const stored = localStorage.getItem("guideEntries");
      if (stored) {
        guideEntriesStorage = JSON.parse(stored);
      }
    } else {
      // Expo Go / ネイティブ環境
      const stored = await AsyncStorage.getItem("guideEntries");
      if (stored) {
        guideEntriesStorage = JSON.parse(stored);
      }
    }
  } catch (e) {
    console.log("Storage load error:", e);
    // 読み込み失敗時は空配列のまま
    guideEntriesStorage = [];
  }
}

// プラットフォームに応じたストレージにデータを保存
async function saveToStorage() {
  try {
    // 画像データを除外して保存（大きすぎるとAsyncStorageがエラーになる）
    const toSave = guideEntriesStorage.map((entry) => {
      const { imageDataUrl, ...rest } = entry;
      return rest;
    });

    if (Platform.OS === "web") {
      localStorage.setItem("guideEntries", JSON.stringify(toSave));
    } else {
      // Expo Go / ネイティブ環境
      await AsyncStorage.setItem("guideEntries", JSON.stringify(toSave));
    }
  } catch (e) {
    console.log("Storage save error:", e);
    // 保存失敗時は何もしない
  }
}

// 初期化時に読み込み（非同期実行）
loadFromStorage();

// アプリ起動時に自動的に保存されているトークンを読み込み
loadStoredToken();

export async function waitForStorageLoad() {
  await loadFromStorage();
}

export function getGuideEntries(): GuideEntry[] {
  return [...guideEntriesStorage];
}

export function addGuideEntry(
  entry: Omit<GuideEntry, "id" | "observedAt">,
): GuideEntry | null {
  // 無料ユーザーは10件まで制限
  if (!IS_PREMIUM_USER && guideEntriesStorage.length >= FREE_ENTRY_LIMIT) {
    return null;
  }

  const newEntry: GuideEntry = {
    ...entry,
    id: `entry-${Date.now()}`,
    observedAt: new Date().toISOString().split("T")[0],
    // 図鑑に追加された瞬間の元の値を永久保存
    original: {
      title: entry.title,
      scientificName: entry.scientificName,
      taxonomy: entry.taxonomy ? { ...entry.taxonomy } : {
        kingdom: null,
        phylum: null,
        class: null,
        order: null,
        family: null,
        genus: null,
        species: null,
      },
    },
  };
  guideEntriesStorage.push(newEntry);
  saveToStorage();
  return newEntry;
}

export function canAddMoreEntries(): boolean {
  return IS_PREMIUM_USER || guideEntriesStorage.length < FREE_ENTRY_LIMIT;
}

export function getRemainingEntries(): number {
  if (IS_PREMIUM_USER) return Infinity;
  return Math.max(0, FREE_ENTRY_LIMIT - guideEntriesStorage.length);
}

export function deleteGuideEntry(entryId: string): boolean {
  const index = guideEntriesStorage.findIndex((e) => e.id === entryId);
  if (index === -1) return false;
  guideEntriesStorage.splice(index, 1);
  saveToStorage();
  return true;
}

export function deleteGuideEntries(entryIds: string[]): number {
  let count = 0;
  entryIds.forEach((id) => {
    if (deleteGuideEntry(id)) count++;
  });
  return count;
}

export function updateGuideEntry(
  entryId: string,
  updates: Partial<GuideEntry>,
): GuideEntry | null {
  const index = guideEntriesStorage.findIndex((e) => e.id === entryId);
  if (index === -1) return null;
  guideEntriesStorage[index] = {
    ...guideEntriesStorage[index],
    ...updates,
  };
  saveToStorage();
  return guideEntriesStorage[index];
}

// ── カスタムカテゴリ ──────────────────────────────────────────────────────

export type CustomCategory = {
  id: string;
  name: string;
  color: string;
  colorActive: string;
};

let customCategoriesStorage: CustomCategory[] = [];

async function loadCustomCategories() {
  try {
    if (Platform.OS === "web") {
      const stored = localStorage.getItem("customCategories");
      if (stored) {
        customCategoriesStorage = JSON.parse(stored);
      }
    } else {
      const stored = await AsyncStorage.getItem("customCategories");
      if (stored) {
        customCategoriesStorage = JSON.parse(stored);
      }
    }
  } catch (e) {
    console.log("Custom categories load error:", e);
    customCategoriesStorage = [];
  }
}

async function saveCustomCategories() {
  try {
    if (Platform.OS === "web") {
      localStorage.setItem("customCategories", JSON.stringify(customCategoriesStorage));
    } else {
      await AsyncStorage.setItem("customCategories", JSON.stringify(customCategoriesStorage));
    }
  } catch (e) {
    console.log("Custom categories save error:", e);
  }
}

export function getCustomCategories(): CustomCategory[] {
  return [...customCategoriesStorage];
}

export function addCustomCategory(category: Omit<CustomCategory, "id">): CustomCategory | null {
  // オリジナルしおりは有料会員のみ
  if (!IS_PREMIUM_USER) {
    return null;
  }

  const newCategory: CustomCategory = {
    ...category,
    id: `custom-${Date.now()}`,
  };
  customCategoriesStorage.push(newCategory);
  saveCustomCategories();
  return newCategory;
}

export function updateCustomCategory(categoryId: string, updates: Partial<CustomCategory>): CustomCategory | null {
  const index = customCategoriesStorage.findIndex((c) => c.id === categoryId);
  if (index === -1) return null;
  customCategoriesStorage[index] = {
    ...customCategoriesStorage[index],
    ...updates,
  };
  saveCustomCategories();
  return customCategoriesStorage[index];
}

export function deleteCustomCategory(categoryId: string): boolean {
  const index = customCategoriesStorage.findIndex((c) => c.id === categoryId);
  if (index === -1) return false;
  customCategoriesStorage.splice(index, 1);
  saveCustomCategories();
  return true;
}

// 初期化時に読み込み（非同期実行）
loadCustomCategories();

/**
 * ユーザーのiNaturalist APIトークンを設定します
 * アプリ起動時または設定画面で呼び出してください
 */
export async function setInaturalistToken(token: string | null) {
  INATURALIST_API_TOKEN = token;

  try {
    if (Platform.OS === "web") {
      if (token) {
        localStorage.setItem("inaturalist_token", token);
      } else {
        localStorage.removeItem("inaturalist_token");
      }
    } else {
      if (token) {
        await AsyncStorage.setItem("inaturalist_token", token);
      } else {
        await AsyncStorage.removeItem("inaturalist_token");
      }
    }
  } catch (e) {
    console.log("トークン保存エラー:", e);
  }
}

/**
 * 保存されているiNaturalist APIトークンを読み込みます
 * アプリ起動時に自動的に呼び出されます
 */
export async function loadStoredToken(): Promise<string | null> {
  try {
    let stored: string | null = null;

    if (Platform.OS === "web") {
      stored = localStorage.getItem("inaturalist_token");
    } else {
      stored = await AsyncStorage.getItem("inaturalist_token");
    }

    if (stored && stored.trim()) {
      INATURALIST_API_TOKEN = stored.trim();
      return INATURALIST_API_TOKEN;
    }
  } catch (e) {
    console.log("トークン読み込みエラー:", e);
  }

  return null;
}

/**
 * トークンが設定されているか確認します
 */
export function hasValidToken(): boolean {
  return !!INATURALIST_API_TOKEN && INATURALIST_API_TOKEN.length > 20;
}

// ── iNaturalist 直接通信用ヘルパー関数 ─────────────────────────────

function dataUrlToBlob(dataUrl: string): {
  blob: Blob | null;
  mimeType: string;
  base64: string;
} {
  const [meta, base64] = dataUrl.split(",");
  if (!meta || !base64) throw new Error("data URL の形式が不正です。");

  const match = meta.match(/^data:(.*?);base64$/);
  if (!match) throw new Error("base64 data URL のみ対応しています。");

  const mimeType = match[1];

  // React Native 互換: 可能な場合はBlobを作成、不可の場合はbase64のまま返す
  if (Platform.OS === "web") {
    try {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);

      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      return {
        blob: new Blob([bytes], { type: mimeType }),
        mimeType,
        base64,
      };
    } catch (e) {
      console.log("Web環境でのBlob作成エラー:", e);
    }
  }

  // React Native / スマホ環境では Blob を作らない (ネイティブブリッジの制限)
  return {
    blob: null,
    mimeType,
    base64,
  };
}

function getRawScore(result: any): number {
  const value =
    result.normalized_combined_score ??
    result.combined_score ??
    result.vision_score ??
    0;

  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Number(value));
}

function getWeightedScore(result: any, rankingConfig: any): number {
  const score = getRawScore(result);
  const rank = result.taxon?.rank ?? "";
  const observationsCount = result.taxon?.observations_count ?? 0;

  let weightedScore = score;

  if (rankingConfig.preferredRanks.includes(rank)) {
    weightedScore += 0.018;
  }

  if (rankingConfig.suppressedRanks.includes(rank)) {
    weightedScore -= 0.03;
  }

  if (observationsCount >= 10000) {
    weightedScore += 0.012;
  } else if (observationsCount >= 1000) {
    weightedScore += 0.006;
  }

  return weightedScore;
}

function toDisplayConfidence(rawScore: number, topRawScore: number): number {
  if (!Number.isFinite(rawScore) || rawScore <= 0 || topRawScore <= 0) {
    return 0;
  }

  const ratio = Math.max(0, Math.min(1, rawScore / topRawScore));
  let topConfidence = 0.64;

  if (topRawScore >= 0.85) {
    topConfidence = 0.94;
  } else if (topRawScore >= 0.4) {
    topConfidence = 0.88;
  } else if (topRawScore >= 0.15) {
    topConfidence = 0.78;
  }

  return Math.max(0.14, Math.min(0.98, topConfidence * Math.sqrt(ratio)));
}

function formatTaxonLabel(taxon: any): string {
  const commonName = taxon.preferred_common_name;

  if (commonName && commonName !== taxon.name) {
    return `${commonName} (${taxon.name})`;
  }

  return commonName ?? taxon.name;
}

function buildTaxonomy(
  taxon: any,
  taxonomyLookup: Map<number, any>,
): TaxonomyInfo {
  const ranks = [
    "kingdom",
    "phylum",
    "class",
    "order",
    "family",
    "genus",
    "species",
  ];
  const lineage = [...(taxon.ancestor_ids ?? []), taxon.id];
  const taxonomy = Object.fromEntries(
    ranks.map((rank) => [rank, null]),
  ) as TaxonomyInfo;

  for (const id of lineage) {
    const lineageTaxon = taxonomyLookup.get(id);

    if (!lineageTaxon || !ranks.includes(lineageTaxon.rank)) {
      continue;
    }

    (taxonomy as any)[lineageTaxon.rank] = formatTaxonLabel(lineageTaxon);
  }

  return taxonomy;
}

function createSummary(
  taxon: any,
  displayConfidence: number,
  language: "ja" | "en",
): string {
  const score = Math.round(displayConfidence * 100);
  const commonName = taxon.preferred_common_name;

  if (language === "en") {
    const label = commonName ? `${commonName} / ${taxon.name}` : taxon.name;
    return `${label} is currently the top candidate. The iNaturalist score for this match is about ${score}%.`;
  }

  const label = commonName ? `${commonName} / ${taxon.name}` : taxon.name;
  return `${label} が上位候補です。iNaturalist の推論スコアでは ${score}% 程度の一致として返されています。`;
}

function createCheckpoints(taxon: any, language: "ja" | "en"): string[] {
  const checkpoints: string[] = [];

  if (taxon.name) {
    checkpoints.push(
      language === "en"
        ? `Scientific name: ${taxon.name}`
        : `学名: ${taxon.name}`,
    );
  }
  if (taxon.rank) {
    checkpoints.push(
      language === "en" ? `Rank: ${taxon.rank}` : `分類ランク: ${taxon.rank}`,
    );
  }
  if (typeof taxon.observations_count === "number") {
    checkpoints.push(
      language === "en"
        ? `iNaturalist observations: ${taxon.observations_count.toLocaleString("en-US")}`
        : `iNaturalist 観測数: ${taxon.observations_count.toLocaleString("ja-JP")}`,
    );
  }

  return checkpoints.slice(0, 3);
}

function normalizeResult(
  result: any,
  displayConfidence: number,
  language: "ja" | "en",
  taxonomyLookup: Map<number, any>,
): Candidate {
  const taxon = result.taxon;
  const referenceImage =
    taxon.default_photo?.medium_url ?? taxon.default_photo?.url ?? null;
  const localizedName = taxon.preferred_common_name ?? taxon.name;

  return {
    id: String(taxon.id),
    name: localizedName,
    scientificName: taxon.name,
    confidence: displayConfidence,
    summary: createSummary(taxon, displayConfidence, language),
    checkpoints: createCheckpoints(taxon, language),
    referenceImage,
    referenceUrl: `https://www.inaturalist.org/taxa/${taxon.id}`,
    rankLabel: taxon.rank,
    taxonomy: buildTaxonomy(taxon, taxonomyLookup),
  };
}

async function normalizeResults(
  results: any[],
  rankingConfig: any,
  language: "ja" | "en",
): Promise<Candidate[]> {
  const parentIds = new Set(
    results
      .map((result) => result.parent_id)
      .filter((value) => Number.isFinite(value)),
  );

  const leafResults = results.filter(
    (result) => !parentIds.has(result.taxon?.id),
  );
  const pool = leafResults.length > 0 ? leafResults : results;
  const rankedPool = pool
    .filter((result) => result.taxon)
    .map((result) => ({
      result,
      rawScore: getRawScore(result),
      weightedScore: getWeightedScore(result, rankingConfig),
    }))
    .filter(({ rawScore }) => rawScore >= rankingConfig.minScore)
    .sort((left, right) => right.weightedScore - left.weightedScore);

  if (rankedPool.length === 0) {
    return [];
  }

  const topWeightedScore = rankedPool[0].weightedScore;
  const filteredPool = rankedPool
    .filter(({ weightedScore, rawScore }) => {
      if (rawScore >= 0.08) {
        return true;
      }

      return weightedScore >= topWeightedScore * 0.72;
    })
    .slice(0, 3);

  const topRawScore = Math.max(
    ...filteredPool.map(({ rawScore }) => rawScore),
    0,
  );

  const ids = Array.from(
    new Set(
      filteredPool
        .flatMap(({ result }) => [
          result.taxon.id,
          ...(result.taxon.ancestor_ids ?? []),
        ])
        .filter((value) => Number.isFinite(value)),
    ),
  );

  const taxonomyLookup = new Map<number, any>();

  if (ids.length > 0) {
    const query = new URLSearchParams({ locale: language });
    if (language === "ja") {
      query.set("preferred_place_id", String(JAPAN_PLACE_ID));
    }

    const taxonResponse = await fetch(
      `https://api.inaturalist.org/v1/taxa/${ids.join(",")}?${query.toString()}`,
    );
    const taxonJson = await taxonResponse.json();

    if (taxonJson.results) {
      for (const taxon of taxonJson.results) {
        taxonomyLookup.set(taxon.id, taxon);
      }
    }
  }

  return filteredPool.map(({ result, rawScore }) =>
    normalizeResult(
      result,
      toDisplayConfidence(rawScore, topRawScore),
      language,
      taxonomyLookup,
    ),
  );
}

function buildResponseNotice(
  category: any,
  normalizedResults: Candidate[],
  language: "ja" | "en",
): string {
  const baseNotice = category.notice;

  if (normalizedResults.length === 0) {
    return `${baseNotice} 今回の写真は信頼できる候補が絞れなかったため、無理に近くない候補は出していません。`;
  }

  const topConfidence = normalizedResults[0]?.confidence ?? 0;

  if (topConfidence < 0.08) {
    return `${baseNotice} 今回の候補は全体に信頼度が低めなので、参考程度に見てください。`;
  }

  return baseNotice;
}

/**
 * iNaturalist API を直接叩いて自然写真を解析します
 * ローカルサーバーを経由しません
 */
export async function analyzeNaturePhoto(
  categoryId: CategoryId,
  imageDataUrl: string,
  language: "ja" | "en" = "ja",
): Promise<AnalysisResponse> {
  if (!hasValidToken()) {
    throw new Error(
      "iNaturalist トークンが設定されていません。設定画面から自分のAPIトークンを入力してください。",
    );
  }

  const category = categoryConfig[categoryId];
  if (!category) {
    throw new Error("不明なカテゴリIDです");
  }

  let response: Response;

  // ✅ デバッグ用：期限切れシミュレーションモード
  if (SIMULATE_TOKEN_EXPIRED) {
    // 実際にAPIを叩かず、直接401エラーと同じ挙動を再現
    SIMULATE_TOKEN_EXPIRED = false; // 一回だけ動作して自動的にOFFになる
    throw new Error("TOKEN_EXPIRED");
  }

  try {
    const imageData = dataUrlToBlob(imageDataUrl);
    const formData = new FormData();
    const query = new URLSearchParams({ locale: language });

    if (language === "ja") {
      query.set("preferred_place_id", String(JAPAN_PLACE_ID));
    }

    if (Platform.OS === "web" && imageData.blob) {
      // Webブラウザ環境
      formData.append("image", imageData.blob, "upload.jpg");
    } else {
      // React Native / スマホ環境: base64文字列を直接送信
      const extension = imageData.mimeType === "image/png" ? ".png" : ".jpg";
      // @ts-ignore React Native の FormData は特殊なURI形式をサポート
      formData.append("image", {
        uri: imageDataUrl,
        name: `upload${extension}`,
        type: imageData.mimeType,
      } as any);
    }
    formData.append("taxon_id", String(category.taxonId));
    formData.append("include_representative_photos", "true");
    formData.append("aggregated", "true");
    formData.append("delegate_ca", "true");

    response = await fetch(
      `https://api.inaturalist.org/v1/computervision/score_image?${query.toString()}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${INATURALIST_API_TOKEN}`,
          "User-Agent": "Nature-Pics/1.0",
        },
        body: formData,
      },
    );
  } catch (e) {
    console.error("API接続エラー:", e);
    throw new Error(
      "iNaturalist API に接続できません。ネットワーク接続を確認してください。",
    );
  }

  const text = await response.text();
  const json = parseJsonBody(text);

  if (!response.ok) {
    // トークン期限切れ・無効の場合は特別に処理
    if (response.status === 401) {
      // 無効なトークンを削除
      await setInaturalistToken(null);
      throw new Error("TOKEN_EXPIRED");
    }
    
    throw new Error(extractErrorMessage(json, response.status, text));
  }

  if (json === null) {
    throw new Error("iNaturalist API から空の応答が返りました。");
  }

  const results = await normalizeResults(
    (json as any).results ?? [],
    category,
    language,
  );
  const notice = buildResponseNotice(category, results, language);

  return {
    category: {
      id: category.id as CategoryId,
      name: category.name,
      notice: category.notice,
    },
    notice,
    results,
    totalResults: results.length,
  };
}
