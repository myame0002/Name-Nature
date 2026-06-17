/**
 * API client for Name Nature app.
 *
 * Calls the Cloudflare Workers backend which proxies requests to iNaturalist.
 */

// ── Configuration ──────────────────────────────────────────────────

const API_BASE_URL = "https://namenature-api.picturepicture773.workers.dev";

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

// ── Guide Entry Storage (async-storage based) ──────────────────────

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

export { AsyncStorage };

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
      const stored = await AsyncStorage.getItem("guideEntries");
      if (stored) {
        guideEntriesStorage = JSON.parse(stored);
      }
    }
  } catch (e) {
    console.log("Storage load error:", e);
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
      await AsyncStorage.setItem("guideEntries", JSON.stringify(toSave));
    }
  } catch (e) {
    console.log("Storage save error:", e);
  }
}

// 初期化時に読み込み
loadFromStorage();

export async function waitForStorageLoad() {
  await loadFromStorage();
}

export function getGuideEntries(): GuideEntry[] {
  return [...guideEntriesStorage];
}

export function addGuideEntry(
  entry: Omit<GuideEntry, "id" | "observedAt">,
): GuideEntry | null {
  if (!IS_PREMIUM_USER && guideEntriesStorage.length >= FREE_ENTRY_LIMIT) {
    return null;
  }

  const newEntry: GuideEntry = {
    ...entry,
    id: `entry-${Date.now()}`,
    observedAt: new Date().toISOString().split("T")[0],
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

// ── カスタムカテゴリ ────────────────────────────────────────────────

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
  if (!IS_PREMIUM_USER) return null;
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

loadCustomCategories();

// ── API Call (via Cloudflare Workers) ───────────────────────────────

/**
 * iNaturalist API を Cloudflare Workers 経由で呼び出して自然写真を解析します。
 * ユーザーは iNaturalist トークンを入力する必要がありません。
 */
export async function analyzeNaturePhoto(
  categoryId: CategoryId,
  imageDataUrl: string,
  language: "ja" | "en" = "ja",
): Promise<AnalysisResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        categoryId,
        imageDataUrl,
        language,
      }),
    });

    const text = await response.text();
    const json = parseJsonBody(text);

    if (!response.ok) {
      throw new Error(extractErrorMessage(json, response.status, text));
    }

    if (json === null) {
      throw new Error("サーバーから空の応答が返りました。");
    }

    return json as AnalysisResponse;
  } catch (e) {
    console.error("API接続エラー:", e);
    if (e instanceof Error) throw e;
    throw new Error(
      "サーバーに接続できません。ネットワーク接続を確認してください。",
    );
  }
}

// ── トークン関連（互換性のために保持。常に "connected" 扱い） ────────

/**
 * 以前はiNaturalistのJWTトークンを管理していましたが、
 * Cloudflare Workers移行後は不要です。
 * 互換性のため関数は残していますが、トークンは必要ありません。
 */
export function hasValidToken(): boolean {
  return true; // Workers経由なので常に有効
}

export async function setInaturalistToken(_token: string | null) {
  // Workers経由では不要。何もしない。
  console.log("iNaturalistトークンはWorkers側で管理されています。");
}

export async function loadStoredToken(): Promise<string | null> {
  // Workers経由では不要。
  return "workers-managed";
}