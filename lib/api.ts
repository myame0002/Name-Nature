/**
 * API client for the Nature Pics analysis server.
 *
 * The server (F:\Nature-Pics\server.mjs) proxies requests to iNaturalist's
 * computer vision API and returns normalized candidate results.
 *
 * Set API_BASE_URL below to point at the running server instance.
 */

const API_BASE_URL = "http://192.168.32.175:8787/api"; // same machine (web mode)

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
  rawText: string
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
};

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

let guideEntriesStorage: GuideEntry[] = [];

// プラットフォームに応じたストレージからデータを読み込み
async function loadFromStorage() {
  try {
    if (Platform.OS === 'web') {
      const stored = localStorage.getItem('guideEntries');
      if (stored) {
        guideEntriesStorage = JSON.parse(stored);
      }
    } else {
      // Expo Go / ネイティブ環境
      const stored = await AsyncStorage.getItem('guideEntries');
      if (stored) {
        guideEntriesStorage = JSON.parse(stored);
      }
    }
  } catch (e) {
    console.log('Storage load error:', e);
    // 読み込み失敗時は空配列のまま
    guideEntriesStorage = [];
  }
}

// プラットフォームに応じたストレージにデータを保存
async function saveToStorage() {
  try {
    // 画像データを除外して保存（大きすぎるとAsyncStorageがエラーになる）
    const toSave = guideEntriesStorage.map(entry => {
      const { imageDataUrl, ...rest } = entry;
      return rest;
    });

    if (Platform.OS === 'web') {
      localStorage.setItem('guideEntries', JSON.stringify(toSave));
    } else {
      // Expo Go / ネイティブ環境
      await AsyncStorage.setItem('guideEntries', JSON.stringify(toSave));
    }
  } catch (e) {
    console.log('Storage save error:', e);
    // 保存失敗時は何もしない
  }
}

// 初期化時に読み込み（非同期実行）
loadFromStorage();

export async function waitForStorageLoad() {
  await loadFromStorage();
}

export function getGuideEntries(): GuideEntry[] {
  return [...guideEntriesStorage];
}

export function addGuideEntry(entry: Omit<GuideEntry, "id" | "observedAt">): GuideEntry {
  const newEntry: GuideEntry = {
    ...entry,
    id: `entry-${Date.now()}`,
    observedAt: new Date().toISOString().split('T')[0],
  };
  guideEntriesStorage.push(newEntry);
  saveToStorage();
  return newEntry;
}

export function deleteGuideEntry(entryId: string): boolean {
  const index = guideEntriesStorage.findIndex(e => e.id === entryId);
  if (index === -1) return false;
  guideEntriesStorage.splice(index, 1);
  saveToStorage();
  return true;
}

export function deleteGuideEntries(entryIds: string[]): number {
  let count = 0;
  entryIds.forEach(id => {
    if (deleteGuideEntry(id)) count++;
  });
  return count;
}

export function updateGuideEntry(entryId: string, updates: Partial<GuideEntry>): GuideEntry | null {
  const index = guideEntriesStorage.findIndex(e => e.id === entryId);
  if (index === -1) return null;
  guideEntriesStorage[index] = {
    ...guideEntriesStorage[index],
    ...updates
  };
  saveToStorage();
  return guideEntriesStorage[index];
}

export async function analyzeNaturePhoto(
  categoryId: CategoryId,
  imageDataUrl: string,
  language: "ja" | "en" = "ja"
): Promise<AnalysisResponse> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId, imageDataUrl, language }),
    });
  } catch {
    throw new Error(
      "解析サーバーに接続できません。サーバーが起動しているか、ネットワーク設定を確認してください。"
    );
  }

  const text = await response.text();
  const json = parseJsonBody(text);

  if (!response.ok) {
    throw new Error(extractErrorMessage(json, response.status, text));
  }

  if (json === null) {
    throw new Error("解析サーバーから空の応答が返りました。");
  }

  return json as AnalysisResponse;
}
