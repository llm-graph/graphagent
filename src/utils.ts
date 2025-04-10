import type { BackoffStrategy, Context, NodeId } from "./types"
import { DEFAULT_NODE_PREFIX } from "./constants"

// Time and delay utilities
export const sleep = (ms: number): Promise<void> => 
  new Promise(resolve => setTimeout(resolve, ms))

// UUID generator for node IDs
export const generateId = (): NodeId => 
  `${DEFAULT_NODE_PREFIX}_${Math.random().toString(36).substring(2, 11)}`

// Immutable state management
export const deepCopy = <T>(obj: T): T => 
  JSON.parse(JSON.stringify(obj))

// Logging utilities
export const log = (level: number, message: string, data?: any): void => {
  const currentLevel = process.env.LOG_LEVEL ? parseInt(process.env.LOG_LEVEL) : 1
  if (level <= currentLevel) {
    console.log(`[Agent-Graph] ${message}`, data ? data : '')
  }
}

export const warnMessage = (message: string): void => 
  log(2, `WARNING: ${message}`)

export const errorMessage = (message: string, error?: Error): void => {
  log(1, `ERROR: ${message}`, error)
  if (error && error.stack) log(1, error.stack)
}

// Retry and backoff utilities
export const calculateBackoff = (attempt: number, baseDelayMs: number, strategy: BackoffStrategy): number => {
  switch (strategy) {
    case 'linear':
      return baseDelayMs * attempt
    case 'exponential':
      return baseDelayMs * Math.pow(2, attempt - 1)
    case 'fixed':
    default:
      return baseDelayMs
  }
}

// Batch processing utilities
export const executeParallel = async <T, R>(
  items: T[],
  processFn: (item: T) => Promise<R>,
  concurrency = Infinity
): Promise<R[]> => {
  if (concurrency === Infinity) {
    return Promise.all(items.map(item => processFn(item)))
  }

  const results: R[] = []
  const chunks = chunkArray(items, concurrency)
  
  for (const chunk of chunks) {
    const chunkResults = await Promise.all(chunk.map(item => processFn(item)))
    results.push(...chunkResults)
  }
  
  return results
}

export const chunkArray = <T>(array: T[], chunkSize: number): T[][] => {
  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, Math.min(i + chunkSize, array.length)))
  }
  return chunks
}

// Functional composition utilities
export const pipe = <T>(...fns: Array<(arg: T) => T>): ((arg: T) => T) => 
  (arg: T) => fns.reduce((result, fn) => fn(result), arg)

export const compose = <T>(...fns: Array<(arg: T) => T>): ((arg: T) => T) => 
  (arg: T) => fns.reduceRight((result, fn) => fn(result), arg)

// Context manipulation utilities
export const setInContext = <T extends Context>(context: T, key: string, value: any): T => 
  ({ ...context, [key]: value })

export const getFromContext = <T extends Context, R>(context: T, key: string, defaultValue?: R): R => 
  key in context ? context[key] : defaultValue as R

// For backward compatibility - will be removed in future versions
export const mergeConfigs = <T extends Record<string, any>>(base: T, override?: T): T => 
  override ? { ...base, ...override } : { ...base } 