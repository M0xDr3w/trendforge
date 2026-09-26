import { describe, expect, it } from 'vitest'
import { parseStoredPost } from './posts.js'

describe('parseStoredPost', () => {
  it('passes through auto-deserialized objects with string ids', () => {
    expect(parseStoredPost({ id: '7', text: 'hi' })).toEqual({ id: '7', text: 'hi' })
  })

  it('parses raw JSON strings (numeric ids become strings)', () => {
    expect(parseStoredPost('{"id":7,"text":"hi"}')).toEqual({ id: '7', text: 'hi' })
  })

  it('drops corrupt or id-less values instead of throwing', () => {
    expect(parseStoredPost('{nope')).toBeNull()
    expect(parseStoredPost(null)).toBeNull()
    expect(parseStoredPost(undefined)).toBeNull()
    expect(parseStoredPost(42)).toBeNull()
    expect(parseStoredPost({ text: 'no id' })).toBeNull()
    expect(parseStoredPost([{ id: '1' }])).toBeNull()
  })
})
