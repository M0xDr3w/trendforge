// Shared parser for bookmark posts read back from KV.
// @vercel/kv auto-deserializes JSON on read, so values arrive either as
// objects (hash fields written via hset) or as raw JSON strings. Anything
// else is dropped as corrupt rather than crashing the route.

export function parseStoredPost(value) {
  try {
    const post = typeof value === 'string' ? JSON.parse(value) : value
    if (!post || typeof post.id === 'undefined' || post.id === null) return null
    return { ...post, id: String(post.id) }
  } catch {
    return null
  }
}
