export interface XPost {
  id: number
  text: string
  username: string
  timestamp: string
  likes: number
  retweets: number
  sentiment: number
}

export interface Cluster {
  id: string
  name: string
  keywords: string[]
  posts: XPost[]
  volume: number
  avgSentiment: number
  shift: number
}

export interface Insight {
  type: 'shift' | 'gap' | 'opportunity'
  title: string
  detail: string
  cluster?: string
  action: string
}

export interface TrendForgeConfig {
  keywordBuckets: Record<string, string[]>
  mockFeedIntervalMs: number
  liveRealPollMs: number
  liveRealQuery: string
  maxPosts: number
  allowClientBearer: boolean
  defaultSyncQuery: string
}
