// Data-driven theme discovery for Bookmark Forge.
//
// The owner's saves are one big unsorted, mixed-topic pile, so the old
// hard-coded keyword buckets can't work here. Instead: deterministic local
// clustering over post text (free, offline, stable) + Grok naming for
// cluster labels (one batched call, cached in KV so re-syncs only pay for
// new/changed clusters). Heuristic keyword names keep every path working
// when Grok is unavailable.

const STOPWORDS = new Set(
  'a,about,after,again,against,all,also,am,an,and,any,are,as,at,be,because,been,before,being,below,but,by,can,could,did,do,does,doing,down,each,few,for,from,further,get,got,had,has,have,having,he,her,here,hers,his,how,i,if,in,into,is,it,its,itself,just,like,make,me,more,most,my,no,nor,not,now,of,off,on,once,only,or,other,our,out,over,own,really,s,say,says,see,she,should,so,some,such,t,than,that,the,their,them,then,there,these,they,this,those,through,to,too,under,until,up,very,via,was,we,were,what,when,where,which,while,who,will,with,you,your,htt,https,com,www'.split(
    ',',
  ),
)

/** Lowercase alphanumeric tokens, minus stopwords and stubs. */
export function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .split(/[^a-z0-9]+/)
    .map(t => t.replace(/(ing|ed|s)$/, ''))
    .filter(t => t.length >= 3 && !STOPWORDS.has(t))
}

function termCounts(tokens) {
  const counts = new Map()
  for (const t of tokens) counts.set(t, (counts.get(t) || 0) + 1)
  return counts
}

function cosine(a, b) {
  let dot = 0
  let na = 0
  let nb = 0
  for (const [t, ca] of a) {
    na += ca * ca
    const cb = b.get(t)
    if (cb) dot += ca * cb
  }
  for (const cb of b.values()) nb += cb * cb
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

function centroid(members) {
  const acc = new Map()
  for (const m of members) {
    for (const [t, c] of m.counts) acc.set(t, (acc.get(t) || 0) + c)
  }
  const n = members.length
  for (const [t, c] of acc) acc.set(t, c / n)
  return acc
}

/**
 * Greedy agglomerative clustering over short texts. Returns clusters of
 * post ids (singletons collected separately). Deterministic for one input
 * order — callers pass newest-first for stable results.
 */
export function clusterPosts(posts, { threshold = 0.2, minSize = 2 } = {}) {
  const docs = posts
    .map(p => ({ id: String(p.id), counts: termCounts(tokenize(p.text)) }))
    .filter(d => d.counts.size > 0)
  const clusters = []
  for (const doc of docs) {
    let best = null
    let bestSim = 0
    for (const c of clusters) {
      const sim = cosine(centroid(c.members), doc.counts)
      if (sim > bestSim) {
        bestSim = sim
        best = c
      }
    }
    if (best && bestSim >= threshold) {
      best.members.push(doc)
    } else {
      clusters.push({ members: [doc] })
    }
  }
  const kept = []
  const singletons = []
  for (const c of clusters) {
    if (c.members.length >= minSize) kept.push(c)
    else singletons.push(...c.members)
  }
  return { clusters: kept, singletons }
}

/** Top distinctive terms for a cluster vs the whole pile (simple TF-IDF). */
export function distinctiveTerms(clusterCounts, docFreq, totalDocs, top = 5) {
  const scored = []
  for (const [t, tf] of clusterCounts) {
    const df = docFreq.get(t) || 1
    scored.push([t, tf * Math.log(1 + totalDocs / df)])
  }
  scored.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
  return scored.slice(0, top).map(([t]) => t)
}

export function docFrequencies(allCounts) {
  const df = new Map()
  for (const counts of allCounts) {
    for (const t of counts.keys()) df.set(t, (df.get(t) || 0) + 1)
  }
  return df
}

/** Stable signature for a cluster: sorted top terms. Cache key for labels. */
export function clusterSignature(topTerms) {
  return [...topTerms].sort().join('|')
}

/** Label-cache entries may come back as objects or JSON strings. */
export function normalizeLabelMap(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out = {}
  for (const [sig, value] of Object.entries(raw)) {
    if (!value) continue
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value)
        if (parsed && typeof parsed.name === 'string') out[sig] = parsed
      } catch {
        // Corrupt entry: treated as a cache miss below.
      }
    } else if (typeof value === 'object' && typeof value.name === 'string') {
      out[sig] = value
    }
  }
  return out
}

export function heuristicName(topTerms) {
  const words = topTerms.slice(0, 3).map(w => w.charAt(0).toUpperCase() + w.slice(1))
  return words.join(' · ') || 'Saves'
}

/**
 * Full pass: cluster posts, attach signatures + heuristic names.
 * Returns { themes: [{ sig, postIds, topTerms, name }], leftoverIds }.
 */
export function discoverThemes(posts, options) {
  const ordered = [...posts].sort((a, b) =>
    String(b.createdAt || '').localeCompare(String(a.createdAt || '')),
  )
  const { clusters, singletons } = clusterPosts(ordered, options)
  const allCounts = ordered.map(p => termCounts(tokenize(p.text)))
  const df = docFrequencies(allCounts)
  const byId = new Map(ordered.map(p => [String(p.id), p]))
  const themes = clusters.map(c => {
    const agg = new Map()
    for (const m of c.members) {
      for (const [t, n] of m.counts) agg.set(t, (agg.get(t) || 0) + n)
    }
    const topTerms = distinctiveTerms(agg, df, ordered.length)
    return {
      sig: clusterSignature(topTerms),
      postIds: c.members.map(m => m.id).sort((a, b) =>
        String(byId.get(b)?.createdAt || '').localeCompare(String(byId.get(a)?.createdAt || '')),
      ),
      topTerms,
      name: heuristicName(topTerms),
    }
  })
  // Largest themes first for a stable UI order.
  themes.sort((a, b) => b.postIds.length - a.postIds.length)
  return { themes, leftoverIds: singletons.map(s => s.id) }
}

/**
 * Diff current clusters against the cached label map.
 * Returns { labeled, needsLabeling } — only genuinely new signatures cost
 * a Grok call. A cluster keeps its cached name even as members shift.
 */
export function diffThemeLabels(cachedLabels, themes) {
  const labeled = []
  const needsLabeling = []
  const seen = new Set()
  for (const t of themes) {
    if (seen.has(t.sig)) continue
    seen.add(t.sig)
    const hit = cachedLabels?.[t.sig]
    if (hit?.name) labeled.push({ ...t, name: hit.name, cached: true })
    else needsLabeling.push(t)
  }
  return { labeled, needsLabeling }
}
