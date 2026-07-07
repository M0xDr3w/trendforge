import type { XPost } from './types'

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'is', 'are',
  'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
  'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'this', 'that',
  'these', 'those', 'it', 'its', 'they', 'them', 'their', 'we', 'our', 'you', 'your',
  'i', 'me', 'my', 'with', 'from', 'by', 'as', 'if', 'so', 'not', 'no', 'just', 'about',
  'into', 'over', 'after', 'before', 'than', 'then', 'now', 'new', 'get', 'got', 'all',
  'how', 'what', 'when', 'where', 'who', 'why', 'which', 'up', 'out', 'still', 'really',
])

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[@#]\w+/g, '')
    .split(/\W+/)
    .filter(t => t.length > 2 && !STOP_WORDS.has(t))
}

function buildTfIdf(docs: string[][]): Map<string, number>[] {
  const n = docs.length
  const df = new Map<string, number>()

  docs.forEach(tokens => {
    const seen = new Set(tokens)
    seen.forEach(t => df.set(t, (df.get(t) || 0) + 1))
  })

  return docs.map(tokens => {
    const tf = new Map<string, number>()
    tokens.forEach(t => tf.set(t, (tf.get(t) || 0) + 1))
    const vec = new Map<string, number>()
    const len = Math.max(1, tokens.length)
    tf.forEach((count, term) => {
      const idf = Math.log((n + 1) / ((df.get(term) || 0) + 1)) + 1
      vec.set(term, (count / len) * idf)
    })
    return vec
  })
}

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0
  let normA = 0
  let normB = 0
  a.forEach((v, k) => {
    normA += v * v
    if (b.has(k)) dot += v * (b.get(k) || 0)
  })
  b.forEach(v => { normB += v * v })
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom > 0 ? dot / denom : 0
}

export interface SemanticGroup {
  label: string
  posts: XPost[]
  topTerms: string[]
}

export function clusterPostsSemantically(posts: XPost[], threshold = 0.22): SemanticGroup[] {
  if (posts.length === 0) return []
  if (posts.length === 1) {
    const terms = tokenize(posts[0].text).slice(0, 3)
    return [{ label: terms[0] || 'Signal', posts, topTerms: terms }]
  }

  const tokenized = posts.map(p => tokenize(p.text))
  const vectors = buildTfIdf(tokenized)
  const assigned = new Set<number>()
  const groups: SemanticGroup[] = []

  for (let i = 0; i < posts.length; i++) {
    if (assigned.has(i)) continue

    const groupIndices = [i]
    assigned.add(i)

    for (let j = i + 1; j < posts.length; j++) {
      if (assigned.has(j)) continue
      if (cosineSimilarity(vectors[i], vectors[j]) >= threshold) {
        groupIndices.push(j)
        assigned.add(j)
      }
    }

    const groupPosts = groupIndices.map(idx => posts[idx])
    const termCounts = new Map<string, number>()
    groupIndices.forEach(idx => {
      tokenized[idx].forEach(t => termCounts.set(t, (termCounts.get(t) || 0) + 1))
    })
    const topTerms = [...termCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([t]) => t)

    const label = topTerms.length > 0
      ? topTerms.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(' · ')
      : 'Emerging Signal'

    groups.push({ label, posts: groupPosts, topTerms })
  }

  return groups.sort((a, b) => b.posts.length - a.posts.length)
}