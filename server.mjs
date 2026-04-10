import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { extname, resolve } from 'node:path'

const PORT = Number(process.env.PORT ?? 8787)
const MAX_BODY_SIZE = 15 * 1024 * 1024
const JAPAN_PLACE_ID = 6737

const categoryConfig = {
  flower: {
    id: 'flower',
    name: '花',
    taxonId: 47125,
    notice: '花カテゴリは iNaturalist の Flowering Plants 系統に絞って照合しています。',
    preferredRanks: ['species', 'genus', 'subspecies', 'variety', 'family'],
    suppressedRanks: ['subsection', 'section', 'tribe', 'subtribe'],
    minScore: 0.03,
  },
  fungus: {
    id: 'fungus',
    name: 'キノコ',
    taxonId: 47170,
    notice: 'キノコカテゴリは Fungi に限定して候補を返します。',
    preferredRanks: ['species', 'genus', 'family', 'order'],
    suppressedRanks: ['subsection', 'section', 'tribe', 'subtribe', 'class', 'phylum', 'kingdom'],
    minScore: 0.025,
  },
  bird: {
    id: 'bird',
    name: '鳥',
    taxonId: 3,
    notice: '鳥カテゴリは Aves に限定して候補を返します。',
    preferredRanks: ['species', 'genus', 'family'],
    suppressedRanks: ['subsection', 'section', 'tribe', 'subtribe'],
    minScore: 0.03,
  },
  insect: {
    id: 'insect',
    name: '昆虫',
    taxonId: 47158,
    notice: '昆虫カテゴリは Insecta に限定して候補を返します。',
    preferredRanks: ['species', 'genus', 'family', 'order'],
    suppressedRanks: ['subsection', 'section', 'tribe', 'subtribe'],
    minScore: 0.03,
  },
}

loadEnvFile('.env.local')
loadEnvFile('.env')

const server = createServer(async (request, response) => {
  setCorsHeaders(response)

  if (request.method === 'OPTIONS') {
    response.writeHead(204)
    response.end()
    return
  }

  if (request.method === 'GET' && request.url === '/api/health') {
    sendJson(response, 200, { ok: true })
    return
  }

  if (request.method === 'POST' && request.url === '/api/analyze') {
    await handleAnalyze(request, response)
    return
  }

  if (request.method === 'POST' && request.url === '/api/field-guide-note') {
    await handleFieldGuideNote(request, response)
    return
  }

  if (request.method === 'POST' && request.url === '/api/observation-question') {
    await handleObservationQuestion(request, response)
    return
  }

  sendJson(response, 404, { error: 'Not Found' })
})

server.listen(PORT, () => {
  console.log(`Nature Pics API listening on http://localhost:${PORT}`)
})

async function handleAnalyze(request, response) {
  const token = process.env.INATURALIST_API_TOKEN

  if (!token) {
    sendJson(response, 500, {
      error: 'INATURALIST_API_TOKEN is not configured.',
      detail: 'server.mjs が参照できる環境変数に有効な iNaturalist JWT を設定してください。',
    })
    return
  }

  let payload

  try {
    payload = await readJsonBody(request)
  } catch (error) {
    sendJson(response, 400, {
      error: 'Invalid request body',
      detail: error instanceof Error ? error.message : 'JSON の読み取りに失敗しました。',
    })
    return
  }

  const category = categoryConfig[payload.categoryId]
  const language = payload.language === 'en' ? 'en' : 'ja'

  if (!category) {
    sendJson(response, 400, {
      error: 'Unknown categoryId',
      detail: 'categoryId は flower, fungus, bird, insect のいずれかである必要があります。',
    })
    return
  }

  if (typeof payload.imageDataUrl !== 'string' || !payload.imageDataUrl.startsWith('data:')) {
    sendJson(response, 400, {
      error: 'imageDataUrl is required',
      detail: 'フロントエンドから data URL 形式の画像を送ってください。',
    })
    return
  }

  try {
    const imageFile = dataUrlToFile(payload.imageDataUrl)
    const formData = new FormData()
    const query = new URLSearchParams({ locale: language })

    if (language === 'ja') {
      query.set('preferred_place_id', String(JAPAN_PLACE_ID))
    }

    formData.append('image', imageFile, imageFile.name)
    formData.append('taxon_id', String(category.taxonId))
    formData.append('include_representative_photos', 'true')
    formData.append('aggregated', 'true')
    formData.append('delegate_ca', 'true')

    const upstreamResponse = await fetch(`https://api.inaturalist.org/v1/computervision/score_image?${query.toString()}`, {
      method: 'POST',
      headers: {
        Authorization: token,
      },
      body: formData,
    })

    const text = await upstreamResponse.text()
    const json = text ? JSON.parse(text) : {}

    if (!upstreamResponse.ok) {
      sendJson(response, upstreamResponse.status, {
        error: json.error ?? 'Upstream request failed',
        detail: json.message ?? json.details ?? text,
      })
      return
    }

    const normalizedResults = await normalizeResults(json.results ?? [], category, language)
    const responseNotice = buildResponseNotice(category, normalizedResults, language)

    sendJson(response, 200, {
      category,
      notice: responseNotice,
      results: normalizedResults,
      totalResults: normalizedResults.length,
    })
  } catch (error) {
    sendJson(response, 500, {
      error: 'Unexpected server error',
      detail: error instanceof Error ? error.message : '推論中に不明なエラーが発生しました。',
    })
  }
}

async function handleFieldGuideNote(request, response) {
  let payload

  try {
    payload = await readJsonBody(request)
  } catch (error) {
    sendJson(response, 400, {
      error: 'Invalid request body',
      detail: error instanceof Error ? error.message : 'JSON の読み取りに失敗しました。',
    })
    return
  }

  const category = categoryConfig[payload.categoryId]
  const language = payload.language === 'en' ? 'en' : 'ja'
  const approval = payload.approval === 'confirmed' ? 'confirmed' : 'rejected'

  if (!category) {
    sendJson(response, 400, {
      error: 'Unknown categoryId',
      detail: 'categoryId は flower, fungus, bird, insect のいずれかである必要があります。',
    })
    return
  }

  const fallbackNote = buildFallbackFieldGuideNote({
    approval,
    category,
    candidate: payload.candidate,
    language,
  })

  try {
    const generatedNote = await generateFieldGuideNote({
      approval,
      category,
      candidate: payload.candidate,
      language,
      fallbackNote,
    })

    sendJson(response, 200, {
      note: generatedNote.note,
      source: generatedNote.source,
    })
  } catch (error) {
    sendJson(response, 200, {
      note: fallbackNote,
      source: 'template',
      detail: error instanceof Error ? error.message : '説明生成に失敗しました。',
    })
  }
}

async function handleObservationQuestion(request, response) {
  let payload

  try {
    payload = await readJsonBody(request)
  } catch (error) {
    sendJson(response, 400, {
      error: 'Invalid request body',
      detail: error instanceof Error ? error.message : 'JSON の読み取りに失敗しました。',
    })
    return
  }

  const language = payload.language === 'en' ? 'en' : 'ja'
  const question = typeof payload.question === 'string' ? payload.question.trim() : ''
  const entry = payload.entry

  if (!entry || !question) {
    sendJson(response, 400, {
      error: 'entry and question are required',
    })
    return
  }

  const fallbackAnswer = buildObservationAnswerFallback(entry, question, language)

  try {
    const answer = await generateObservationAnswer(entry, question, language, fallbackAnswer)
    sendJson(response, 200, answer)
  } catch (error) {
    sendJson(response, 200, {
      answer: fallbackAnswer,
      source: 'template',
      detail: error instanceof Error ? error.message : '回答生成に失敗しました。',
    })
  }
}

async function normalizeResults(results, rankingConfig, language) {
  const parentIds = new Set(
    results
      .map((result) => result.parent_id)
      .filter((value) => Number.isFinite(value)),
  )

  const leafResults = results.filter((result) => !parentIds.has(result.taxon?.id))
  const pool = leafResults.length > 0 ? leafResults : results
  const rankedPool = pool
    .filter((result) => result.taxon)
    .map((result) => ({
      result,
      rawScore: getRawScore(result),
      weightedScore: getWeightedScore(result, rankingConfig),
    }))
    .filter(({ rawScore }) => rawScore >= rankingConfig.minScore)
    .sort((left, right) => right.weightedScore - left.weightedScore)

  if (rankedPool.length === 0) {
    return []
  }

  const topWeightedScore = rankedPool[0].weightedScore
  const filteredPool = rankedPool
    .filter(({ weightedScore, rawScore }) => {
      if (rawScore >= 0.08) {
        return true
      }

      return weightedScore >= topWeightedScore * 0.72
    })
    .slice(0, 3)

  const topRawScore = Math.max(...filteredPool.map(({ rawScore }) => rawScore), 0)
  const taxonomyLookup = await fetchTaxonomyLookup(
    filteredPool.map(({ result }) => result.taxon).filter(Boolean),
    language,
  )

  return filteredPool.map(({ result, rawScore }) =>
    normalizeResult(result, toDisplayConfidence(rawScore, topRawScore), language, taxonomyLookup),
  )
}

function normalizeResult(result, displayConfidence, language, taxonomyLookup) {
  const taxon = result.taxon
  const referenceImage =
    taxon.default_photo?.medium_url ??
    taxon.default_photo?.url ??
    null
  const localizedName = taxon.preferred_common_name ?? taxon.name

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
  }
}

async function fetchTaxonomyLookup(taxa, language) {
  const ids = Array.from(
    new Set(
      taxa.flatMap((taxon) => [taxon.id, ...(taxon.ancestor_ids ?? [])]).filter((value) => Number.isFinite(value)),
    ),
  )

  if (ids.length === 0) {
    return new Map()
  }

  const query = new URLSearchParams({ locale: language })

  if (language === 'ja') {
    query.set('preferred_place_id', String(JAPAN_PLACE_ID))
  }

  const response = await fetch(`https://api.inaturalist.org/v1/taxa/${ids.join(',')}?${query.toString()}`)
  const text = await response.text()
  const json = text ? JSON.parse(text) : {}

  if (!response.ok) {
    throw new Error(json.error ?? 'Failed to fetch taxonomy lineage.')
  }

  return new Map((json.results ?? []).map((taxon) => [taxon.id, taxon]))
}

function buildTaxonomy(taxon, taxonomyLookup) {
  const ranks = ['kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'species']
  const lineage = [...(taxon.ancestor_ids ?? []), taxon.id]
  const taxonomy = Object.fromEntries(ranks.map((rank) => [rank, null]))

  for (const id of lineage) {
    const lineageTaxon = taxonomyLookup.get(id)

    if (!lineageTaxon || !ranks.includes(lineageTaxon.rank)) {
      continue
    }

    taxonomy[lineageTaxon.rank] = formatTaxonLabel(lineageTaxon)
  }

  return taxonomy
}

function formatTaxonLabel(taxon) {
  const commonName = taxon.preferred_common_name

  if (commonName && commonName !== taxon.name) {
    return `${commonName} (${taxon.name})`
  }

  return commonName ?? taxon.name
}

function createSummary(taxon, displayConfidence, language) {
  const score = Math.round(displayConfidence * 100)
  const commonName = taxon.preferred_common_name

  if (language === 'en') {
    const label = commonName ? `${commonName} / ${taxon.name}` : taxon.name
    return `${label} is currently the top candidate. The iNaturalist score for this match is about ${score}%.`
  }

  const label = commonName ? `${commonName} / ${taxon.name}` : taxon.name
  return `${label} が上位候補です。iNaturalist の推論スコアでは ${score}% 程度の一致として返されています。`
}

function createCheckpoints(taxon, language) {
  const checkpoints = []

  if (taxon.name) {
    checkpoints.push(language === 'en' ? `Scientific name: ${taxon.name}` : `学名: ${taxon.name}`)
  }
  if (taxon.rank) {
    checkpoints.push(language === 'en' ? `Rank: ${taxon.rank}` : `分類ランク: ${taxon.rank}`)
  }
  if (typeof taxon.observations_count === 'number') {
    checkpoints.push(
      language === 'en'
        ? `iNaturalist observations: ${taxon.observations_count.toLocaleString('en-US')}`
        : `iNaturalist 観測数: ${taxon.observations_count.toLocaleString('ja-JP')}`,
    )
  }

  return checkpoints.slice(0, 3)
}

function getRawScore(result) {
  const value =
    result.normalized_combined_score ??
    result.combined_score ??
    result.vision_score ??
    0

  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.max(0, Number(value))
}

function getWeightedScore(result, rankingConfig) {
  const score = getRawScore(result)
  const rank = result.taxon?.rank ?? ''
  const observationsCount = result.taxon?.observations_count ?? 0

  let weightedScore = score

  if (rankingConfig.preferredRanks.includes(rank)) {
    weightedScore += 0.018
  }

  if (rankingConfig.suppressedRanks.includes(rank)) {
    weightedScore -= 0.03
  }

  if (observationsCount >= 10000) {
    weightedScore += 0.012
  } else if (observationsCount >= 1000) {
    weightedScore += 0.006
  }

  return weightedScore
}

function toDisplayConfidence(rawScore, topRawScore) {
  if (!Number.isFinite(rawScore) || rawScore <= 0 || topRawScore <= 0) {
    return 0
  }

  const ratio = Math.max(0, Math.min(1, rawScore / topRawScore))
  let topConfidence = 0.64

  if (topRawScore >= 0.85) {
    topConfidence = 0.94
  } else if (topRawScore >= 0.4) {
    topConfidence = 0.88
  } else if (topRawScore >= 0.15) {
    topConfidence = 0.78
  }

  return Math.max(0.14, Math.min(0.98, topConfidence * Math.sqrt(ratio)))
}

async function generateFieldGuideNote({ approval, category, candidate, language, fallbackNote }) {
  const ollamaModel = process.env.OLLAMA_MODEL
  const ollamaBaseUrl = (process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434').replace(/\/$/, '')

  if (ollamaModel) {
    try {
      const note = await generateFieldGuideNoteWithOllama({
        approval,
        category,
        candidate,
        language,
        baseUrl: ollamaBaseUrl,
        model: ollamaModel,
      })

      return {
        note,
        source: 'ollama',
      }
    } catch (error) {
      console.warn('Ollama note generation failed:', error)
    }
  }

  const apiKey = process.env.OPENAI_API_KEY ?? process.env.LLM_API_KEY

  if (!apiKey) {
    return {
      note: fallbackNote,
      source: 'template',
    }
  }

  const baseUrl = (process.env.OPENAI_BASE_URL ?? process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '')
  const model = process.env.OPENAI_MODEL ?? process.env.LLM_MODEL ?? 'gpt-4.1-mini'
  const prompt = buildFieldGuidePrompt({ approval, category, candidate, language })

  const upstreamResponse = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.6,
      max_tokens: 180,
      messages: [
        {
          role: 'system',
          content: language === 'en'
            ? 'You write short field guide notes for a nature observation app. Keep them concrete, natural, and under 4 lines.'
            : '自然観察アプリ向けの短い図鑑メモを書きます。4行以内で、具体的かつ自然な日本語にしてください。',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  })

  const text = await upstreamResponse.text()
  const json = text ? JSON.parse(text) : {}

  if (!upstreamResponse.ok) {
    throw new Error(json.error?.message ?? json.error ?? 'LLM request failed.')
  }

  const note = json.choices?.[0]?.message?.content?.trim()

  if (!note) {
    throw new Error('LLM response was empty.')
  }

  return {
    note,
    source: 'llm',
  }
}

async function generateFieldGuideNoteWithOllama({ approval, category, candidate, language, baseUrl, model }) {
  const prompt = buildFieldGuidePrompt({ approval, category, candidate, language })
  const upstreamResponse = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      options: {
        temperature: 0.6,
      },
      system: language === 'en'
        ? 'You write short field guide notes for a nature observation app. Keep them concrete, natural, and under 4 lines.'
        : '自然観察アプリ向けの短い図鑑メモを書きます。4行以内で、具体的かつ自然な日本語にしてください。',
    }),
  })

  const text = await upstreamResponse.text()
  const json = text ? JSON.parse(text) : {}

  if (!upstreamResponse.ok) {
    throw new Error(json.error ?? 'Ollama request failed.')
  }

  const note = json.response?.trim()

  if (!note) {
    throw new Error('Ollama response was empty.')
  }

  return note
}

async function generateObservationAnswer(entry, question, language, fallbackAnswer) {
  const ollamaModel = process.env.OLLAMA_MODEL
  const ollamaBaseUrl = (process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434').replace(/\/$/, '')

  if (!ollamaModel) {
    return {
      answer: fallbackAnswer,
      source: 'template',
    }
  }

  const prompt = buildObservationQuestionPrompt(entry, question, language)
  const upstreamResponse = await fetch(`${ollamaBaseUrl}/api/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: ollamaModel,
      prompt,
      stream: false,
      options: {
        temperature: 0.4,
      },
      system: language === 'en'
        ? 'Answer trivia-style questions about a saved nature observation. Use the identified taxon and taxonomy as grounding context, and you may use general background knowledge when it is relevant. Keep the answer concise, avoid dangerous advice, and clearly say when you are uncertain.'
        : '保存済みの自然観察について、豆知識寄りの質問に答えてください。識別された名前と分類情報を土台にしつつ、関連する一般知識を使ってかまいません。簡潔に答え、危険な断定は避け、不確かな点は不確かだと明記してください。',
    }),
  })

  const text = await upstreamResponse.text()
  const json = text ? JSON.parse(text) : {}

  if (!upstreamResponse.ok) {
    throw new Error(json.error ?? 'Ollama question request failed.')
  }

  const answer = json.response?.trim()

  if (!answer) {
    throw new Error('Ollama question response was empty.')
  }

  return {
    answer,
    source: 'ollama',
  }
}

function buildObservationQuestionPrompt(entry, question, language) {
  const taxonomyLines = [
    entry.taxonomy?.kingdom ? `${language === 'en' ? 'Kingdom' : '界'}: ${entry.taxonomy.kingdom}` : '',
    entry.taxonomy?.phylum ? `${language === 'en' ? 'Phylum' : '門'}: ${entry.taxonomy.phylum}` : '',
    entry.taxonomy?.class ? `${language === 'en' ? 'Class' : '綱'}: ${entry.taxonomy.class}` : '',
    entry.taxonomy?.order ? `${language === 'en' ? 'Order' : '目'}: ${entry.taxonomy.order}` : '',
    entry.taxonomy?.family ? `${language === 'en' ? 'Family' : '科'}: ${entry.taxonomy.family}` : '',
    entry.taxonomy?.genus ? `${language === 'en' ? 'Genus' : '属'}: ${entry.taxonomy.genus}` : '',
    entry.taxonomy?.species ? `${language === 'en' ? 'Species' : '種'}: ${entry.taxonomy.species}` : '',
  ].filter(Boolean)

  if (language === 'en') {
    return [
      `Observation title: ${entry.customTitle || entry.approvedName}`,
      `Approved name: ${entry.approvedName}`,
      entry.scientificName ? `Scientific name: ${entry.scientificName}` : '',
      ...taxonomyLines,
      entry.notes ? `User notes: ${entry.notes}` : '',
      entry.chatHistory?.length
        ? `Recent chat context:\n${entry.chatHistory.slice(-4).map((message) => `${message.role}: ${message.content}`).join('\n')}`
        : '',
      `Question: ${question}`,
      'Answer in 2 to 5 short sentences. General background knowledge is allowed, but stay relevant to the identified organism and avoid pretending uncertain claims are definite.',
    ].filter(Boolean).join('\n')
  }

  return [
    `記録名: ${entry.customTitle || entry.approvedName}`,
    `承認名: ${entry.approvedName}`,
    entry.scientificName ? `学名: ${entry.scientificName}` : '',
    ...taxonomyLines,
    entry.notes ? `メモ: ${entry.notes}` : '',
    entry.chatHistory?.length
      ? `直近の会話:\n${entry.chatHistory.slice(-4).map((message) => `${message.role}: ${message.content}`).join('\n')}`
      : '',
    `質問: ${question}`,
    '2〜5文で簡潔に答えてください。一般的な豆知識は使ってよいですが、この観察対象と無関係な話は避け、不確かなことは断定しないでください。',
  ].filter(Boolean).join('\n')
}

function buildObservationAnswerFallback(entry, question, language) {
  const taxonomy = entry.taxonomy ?? {}

  if (language === 'en') {
    return [
      `Saved name: ${entry.customTitle || entry.approvedName}`,
      entry.scientificName ? `Scientific name: ${entry.scientificName}` : '',
      taxonomy.family ? `Family: ${taxonomy.family}` : '',
      taxonomy.order ? `Order: ${taxonomy.order}` : '',
      taxonomy.class ? `Class: ${taxonomy.class}` : '',
      `Your question was: ${question}`,
      'Local trivia generation is unavailable right now, so this fallback only shows the identified taxonomy and saved details.',
    ].filter(Boolean).join('\n')
  }

  return [
    `記録名: ${entry.customTitle || entry.approvedName}`,
    entry.scientificName ? `学名: ${entry.scientificName}` : '',
    taxonomy.family ? `科: ${taxonomy.family}` : '',
    taxonomy.order ? `目: ${taxonomy.order}` : '',
    taxonomy.class ? `綱: ${taxonomy.class}` : '',
    `質問: ${question}`,
    'いまは豆知識生成が使えないため、保存済みの識別情報だけを返しています。',
  ].filter(Boolean).join('\n')
}

function buildFieldGuidePrompt({ approval, category, candidate, language }) {
  const confidence = typeof candidate?.confidence === 'number'
    ? Math.round(candidate.confidence * 100)
    : null
  const checkpoints = Array.isArray(candidate?.checkpoints)
    ? candidate.checkpoints.slice(0, 3).join(language === 'en' ? ', ' : '、')
    : ''

  if (language === 'en') {
    if (approval === 'confirmed' && candidate) {
      return [
        `Write a short field guide note in English for a confirmed observation.`,
        `Category: ${category.id}`,
        `Approved name: ${candidate.name}`,
        `Scientific name: ${candidate.scientificName}`,
        `Summary: ${candidate.summary}`,
        checkpoints ? `Checkpoints: ${checkpoints}` : '',
        confidence !== null ? `Estimated match confidence: ${confidence}%` : '',
        `Avoid hype. Sound like a useful observation note a user would keep.`,
      ].filter(Boolean).join('\n')
    }

    return [
      `Write a short English field note for an observation where no suggested candidate was approved.`,
      `Category: ${category.id}`,
      `Make it useful as a draft note for later review.`,
      `Mention that the current suggestions were not convincing and suggest what to observe next.`,
    ].join('\n')
  }

  if (approval === 'confirmed' && candidate) {
    return [
      '承認済みの観察メモを日本語で短く書いてください。',
      `カテゴリ: ${category.name}`,
      `承認名: ${candidate.name}`,
      `学名: ${candidate.scientificName}`,
      `要約: ${candidate.summary}`,
      checkpoints ? `注目点: ${checkpoints}` : '',
      confidence !== null ? `一致度目安: ${confidence}%` : '',
      '誇張せず、あとで見返しやすい自然な図鑑メモにしてください。',
    ].filter(Boolean).join('\n')
  }

  return [
    '候補を承認しなかった観察メモを日本語で短く書いてください。',
    `カテゴリ: ${category.name}`,
    '今の候補では決め手がなかったことを示しつつ、あとで再確認しやすい下書きメモにしてください。',
    '次に見るとよい特徴も軽く含めてください。',
  ].join('\n')
}

function buildFallbackFieldGuideNote({ approval, category, candidate, language }) {
  if (language === 'en') {
    if (approval === 'confirmed' && candidate) {
      const checkpoints = candidate.checkpoints?.slice(0, 2).join(', ') ?? ''
      const confidence = typeof candidate.confidence === 'number'
        ? Math.round(candidate.confidence * 100)
        : null

      return [
        `Saved as ${candidate.name} after analyzing it as ${category.id}.`,
        candidate.summary ?? '',
        checkpoints ? `Key traits to re-check: ${checkpoints}.` : '',
        confidence !== null ? `Estimated match confidence: ${confidence}%.` : '',
      ].filter(Boolean).join('\n')
    }

    return [
      `Analyzed as ${category.id}, but none of the suggested candidates looked convincing.`,
      'Add your own field notes here so the observation is still useful later.',
      'Examples: color, shape, smell, habitat, season.',
    ].join('\n')
  }

  if (approval === 'confirmed' && candidate) {
    const checkpoints = candidate.checkpoints?.slice(0, 2).join('、') ?? ''
    const confidence = typeof candidate.confidence === 'number'
      ? Math.round(candidate.confidence * 100)
      : null

    return [
      `${category.name}として解析した結果、${candidate.name} がもっとも近い候補として保存されました。`,
      candidate.summary ?? '',
      checkpoints ? `見分けるポイント: ${checkpoints}。` : '',
      confidence !== null ? `推定一致度の目安: ${confidence}%` : '',
    ].filter(Boolean).join('\n')
  }

  return [
    `${category.name}として解析したものの、今回は候補を承認しませんでした。`,
    '手元の印象や現地で見た特徴をここに追記しておくと、あとで見返しやすくなります。',
    '例: 色、形、におい、生えていた場所、季節',
  ].join('\n')
}

function dataUrlToFile(dataUrl) {
  const [meta, base64] = dataUrl.split(',')

  if (!meta || !base64) {
    throw new Error('data URL の形式が不正です。')
  }

  const match = meta.match(/^data:(.*?);base64$/)

  if (!match) {
    throw new Error('base64 data URL のみ対応しています。')
  }

  const mimeType = match[1]
  const extension = mimeToExtension(mimeType)
  const buffer = Buffer.from(base64, 'base64')
  const blob = new Blob([buffer], { type: mimeType })

  return new File([blob], `upload${extension}`, { type: mimeType })
}

function mimeToExtension(mimeType) {
  const known = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
  }

  return known[mimeType] ?? extname(mimeType.replace('/', '.')) ?? '.jpg'
}

function readJsonBody(request) {
  return new Promise((resolvePromise, rejectPromise) => {
    const chunks = []
    let totalLength = 0

    request.on('data', (chunk) => {
      totalLength += chunk.length

      if (totalLength > MAX_BODY_SIZE) {
        rejectPromise(new Error('送信サイズが大きすぎます。15MB 未満の画像で試してください。'))
        request.destroy()
        return
      }

      chunks.push(chunk)
    })

    request.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8')
        resolvePromise(JSON.parse(text))
      } catch (error) {
        rejectPromise(error)
      }
    })

    request.on('error', (error) => {
      rejectPromise(error)
    })
  })
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(payload))
}

function setCorsHeaders(response) {
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

function loadEnvFile(fileName) {
  const filePath = resolve(process.cwd(), fileName)

  if (!existsSync(filePath)) {
    return
  }

  const content = readFileSync(filePath, 'utf8')

  for (const line of content.split(/\r?\n/u)) {
    const trimmed = line.trim()

    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    const separatorIndex = trimmed.indexOf('=')

    if (separatorIndex === -1) {
      continue
    }

    const key = trimmed.slice(0, separatorIndex).trim()
    const value = trimmed.slice(separatorIndex + 1).trim()

    if (!process.env[key]) {
      process.env[key] = value
    }
  }
}

function buildResponseNotice(category, normalizedResults, language) {
  const baseNotice = translateNotice(category, language)

  if (normalizedResults.length === 0) {
    return language === 'en'
      ? `${baseNotice} No reliable candidates were strong enough, so the app intentionally avoided forcing unrelated suggestions.`
      : `${baseNotice} 今回の写真は信頼できる候補が絞れなかったため、無理に近くない候補は出していません。`
  }

  const topConfidence = normalizedResults[0]?.confidence ?? 0

  if (topConfidence < 0.08) {
    return language === 'en'
      ? `${baseNotice} Overall confidence is still low, so treat these candidates as rough references.`
      : `${baseNotice} 今回の候補は全体に信頼度が低めなので、参考程度に見てください。`
  }

  return baseNotice
}

function translateNotice(category, language) {
  if (language === 'en') {
    if (category.id === 'flower') {
      return 'The flower category restricts the search to flowering plants.'
    }
    if (category.id === 'fungus') {
      return 'The mushroom category restricts the search to fungi.'
    }
    if (category.id === 'bird') {
      return 'The bird category restricts the search to Aves.'
    }
    if (category.id === 'insect') {
      return 'The insect category restricts the search to Insecta.'
    }
  }

  return category.notice
}