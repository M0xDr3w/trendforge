import rawConfig from '../config.json'
import type { TrendForgeConfig } from './types'

export const config: TrendForgeConfig = rawConfig as TrendForgeConfig

export const KEYWORD_BUCKETS = config.keywordBuckets
