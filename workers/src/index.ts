/**
 * NameNature API Worker
 *
 * Proxies image analysis requests to iNaturalist's computer vision API,
 * normalizes results, and returns them to the app.
 *
 * Environment variables (secrets):
 *   INATURALIST_API_TOKEN  – iNaturalist JWT token
 */

const JAPAN_PLACE_ID = 6737;

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

type CategoryId = "flower" | "fungus" | "bird" | "insect";

interface TaxonomyInfo {
  kingdom: string | null;
  phylum: string | null;
  class: string | null;
  order: string | null;
  family: string | null;
  genus: string | null;
  species: string | null;
}

interface Candidate {
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
}

interface AnalysisResponse {
  category: { id: CategoryId; name: string; notice: string };
  notice?: string;
  results: Candidate[];
  totalResults: number;
}

interface Env {
  INATURALIST_API_TOKEN?: string;
  ENVIRONMENT?: string;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

function dataUrlToBlob(dataUrl: string): { blob: Blob; mimeType: string } {
  const [meta, base64] = dataUrl.split(",");
  if (!meta || !base64) throw new Error("data URL の形式が不正です。");
  const match = meta.match(/^data:(.*?);base64$/);
  if (!match) throw new Error("base64 data URL のみ対応しています。");
  const mimeType = match[1];
  const binary = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return { blob: new Blob([binary], { type: mimeType }), mimeType };
}

function getRawScore(result: any): number {
  const value =
    result.normalized_combined_score ??
    result.combined_score ??
    result.vision_score ??
    0;
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Number(value));
}

function getWeightedScore(result: any, rankingConfig: any): number {
  const score = getRawScore(result);
  const rank = result.taxon?.rank ?? "";
  const observationsCount = result.taxon?.observations_count ?? 0;
  let weightedScore = score;
  if (rankingConfig.preferredRanks.includes(rank)) weightedScore += 0.018;
  if (rankingConfig.suppressedRanks.includes(rank)) weightedScore -= 0.03;
  if (observationsCount >= 10000) weightedScore += 0.012;
  else if (observationsCount >= 1000) weightedScore += 0.006;
  return weightedScore;
}

function toDisplayConfidence(rawScore: number, topRawScore: number): number {
  if (!Number.isFinite(rawScore) || rawScore <= 0 || topRawScore <= 0) return 0;
  const ratio = Math.max(0, Math.min(1, rawScore / topRawScore));
  let topConfidence = 0.64;
  if (topRawScore >= 0.85) topConfidence = 0.94;
  else if (topRawScore >= 0.4) topConfidence = 0.88;
  else if (topRawScore >= 0.15) topConfidence = 0.78;
  return Math.max(0.14, Math.min(0.98, topConfidence * Math.sqrt(ratio)));
}

function formatTaxonLabel(taxon: any): string {
  const commonName = taxon.preferred_common_name;
  if (commonName && commonName !== taxon.name) return `${commonName} (${taxon.name})`;
  return commonName ?? taxon.name;
}

function buildTaxonomy(taxon: any, taxonomyLookup: Map<number, any>): TaxonomyInfo {
  const ranks = ["kingdom", "phylum", "class", "order", "family", "genus", "species"];
  const lineage = [...(taxon.ancestor_ids ?? []), taxon.id];
  const taxonomy = Object.fromEntries(ranks.map((rank) => [rank, null])) as TaxonomyInfo;
  for (const id of lineage) {
    const lt = taxonomyLookup.get(id);
    if (!lt || !ranks.includes(lt.rank)) continue;
    (taxonomy as any)[lt.rank] = formatTaxonLabel(lt);
  }
  return taxonomy;
}

function createSummary(taxon: any, displayConfidence: number, language: string): string {
  const score = Math.round(displayConfidence * 100);
  const commonName = taxon.preferred_common_name;
  const label = commonName ? `${commonName} / ${taxon.name}` : taxon.name;
  if (language === "en") {
    return `${label} is currently the top candidate. The iNaturalist score for this match is about ${score}%.`;
  }
  return `${label} が上位候補です。iNaturalist の推論スコアでは ${score}% 程度の一致として返されています。`;
}

function createCheckpoints(taxon: any, language: string): string[] {
  const checkpoints: string[] = [];
  if (taxon.name) {
    checkpoints.push(language === "en" ? `Scientific name: ${taxon.name}` : `学名: ${taxon.name}`);
  }
  if (taxon.rank) {
    checkpoints.push(language === "en" ? `Rank: ${taxon.rank}` : `分類ランク: ${taxon.rank}`);
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

function normalizeResult(result: any, displayConfidence: number, language: string, taxonomyLookup: Map<number, any>): Candidate {
  const taxon = result.taxon;
  const referenceImage = taxon.default_photo?.medium_url ?? taxon.default_photo?.url ?? null;
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

async function fetchTaxonomyLookup(taxa: any[], language: string, jwt: string): Promise<Map<number, any>> {
  const ids = Array.from(
    new Set(
      taxa.flatMap((t) => [t.id, ...(t.ancestor_ids ?? [])]).filter((v) => Number.isFinite(v)),
    ),
  );
  if (ids.length === 0) return new Map();
  const query = new URLSearchParams({ locale: language });
  if (language === "ja") query.set("preferred_place_id", String(JAPAN_PLACE_ID));
  const resp = await fetch(`https://api.inaturalist.org/v1/taxa/${ids.join(",")}?${query.toString()}`, {
    headers: { Authorization: `Bearer ${jwt}`, "User-Agent": "Nature-Pics/1.0" },
  });
  const json: any = await resp.json();
  return new Map((json.results ?? []).map((t: any) => [t.id, t]));
}

async function normalizeResults(results: any[], rankingConfig: any, language: string, jwt: string): Promise<Candidate[]> {
  const parentIds = new Set(results.map((r) => r.parent_id).filter((v: any) => Number.isFinite(v)));
  const leafResults = results.filter((r) => !parentIds.has(r.taxon?.id));
  const pool = leafResults.length > 0 ? leafResults : results;
  const rankedPool = pool
    .filter((r) => r.taxon)
    .map((r) => ({ result: r, rawScore: getRawScore(r), weightedScore: getWeightedScore(r, rankingConfig) }))
    .filter(({ rawScore }) => rawScore >= rankingConfig.minScore)
    .sort((a, b) => b.weightedScore - a.weightedScore);
  if (rankedPool.length === 0) return [];
  const topWeightedScore = rankedPool[0].weightedScore;
  const filteredPool = rankedPool
    .filter(({ weightedScore, rawScore }) => rawScore >= 0.08 || weightedScore >= topWeightedScore * 0.72)
    .slice(0, 3);
  const topRawScore = Math.max(...filteredPool.map(({ rawScore }) => rawScore), 0);
  const taxonomyLookup = await fetchTaxonomyLookup(
    filteredPool.map(({ result }) => result.taxon).filter(Boolean),
    language,
    jwt,
  );
  return filteredPool.map(({ result, rawScore }) =>
    normalizeResult(result, toDisplayConfidence(rawScore, topRawScore), language, taxonomyLookup),
  );
}

function buildResponseNotice(category: any, normalizedResults: Candidate[], language: string): string {
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

// ── Request Handlers ────────────────────────────────────────────────

async function handleAnalyze(request: Request, env: Env): Promise<Response> {
  const jwt = env.INATURALIST_API_TOKEN;
  if (!jwt) {
    return jsonResponse({ error: "INATURALIST_API_TOKEN is not configured." }, 500);
  }

  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid request body" }, 400);
  }

  const categoryId = payload.categoryId as CategoryId;
  const category = categoryConfig[categoryId];
  const language = payload.language === "en" ? "en" : "ja";

  if (!category) {
    return jsonResponse({ error: "Unknown categoryId. Must be flower, fungus, bird, or insect." }, 400);
  }

  if (typeof payload.imageDataUrl !== "string" || !payload.imageDataUrl.startsWith("data:")) {
    return jsonResponse({ error: "imageDataUrl is required (data URL format)." }, 400);
  }

  try {
    const { blob, mimeType } = dataUrlToBlob(payload.imageDataUrl);
    const ext = mimeType === "image/png" ? ".png" : ".jpg";
    const formData = new FormData();
    formData.append("image", blob, `upload${ext}`);
    formData.append("taxon_id", String(category.taxonId));
    formData.append("include_representative_photos", "true");
    formData.append("aggregated", "true");
    formData.append("delegate_ca", "true");

    const query = new URLSearchParams({ locale: language });
    if (language === "ja") query.set("preferred_place_id", String(JAPAN_PLACE_ID));

    const upstreamResponse = await fetch(
      `https://api.inaturalist.org/v1/computervision/score_image?${query.toString()}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "User-Agent": "Nature-Pics/1.0",
        },
        body: formData,
      },
    );

    const text = await upstreamResponse.text();
    const json = text ? JSON.parse(text) : {};

    if (!upstreamResponse.ok) {
      return jsonResponse(
        { error: json.error ?? "Upstream request failed", detail: json.message ?? json.details ?? text },
        upstreamResponse.status,
      );
    }

    const results = await normalizeResults(json.results ?? [], category, language, jwt);
    const notice = buildResponseNotice(category, results, language);

    return jsonResponse({
      category: { id: category.id, name: category.name, notice: category.notice },
      notice,
      results,
      totalResults: results.length,
    });
  } catch (error: any) {
    return jsonResponse({ error: "Unexpected server error", detail: error.message }, 500);
  }
}

// ── Main entry ──────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return jsonResponse(null, 204);
    }

    if (request.method === "GET" && url.pathname === "/api/health") {
      return jsonResponse({ ok: true });
    }

    if (request.method === "POST" && url.pathname === "/api/analyze") {
      return handleAnalyze(request, env);
    }

    return jsonResponse({ error: "Not Found" }, 404);
  },
};