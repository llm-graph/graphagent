// Type definitions for the Agent Graph framework

// Basic types
export type Context = Record<string, any>
export type NodeId = string
export type NodeOutcome = string
export type ProgressCallback = (completed: number, total: number) => void

// Additional types for context manipulation
export type ContextRecord = Record<string, unknown>
export type PrepareRecord = Record<string, unknown>
export type BatchItem = unknown
export type BatchResult = unknown
export type BatchResultMap<TResult> = Record<string, TResult>
export type NodeRecord = Record<string, unknown>
export type NodeExecutable = { execute: Function } & Record<string, unknown>

// Function types
export type PrepareFn<T = Context, R = any> = (context: T) => R
export type ExecuteFn<T = any, R = any> = (prepareResult: T) => R
export type FinalizeFn<T = Context, P = any, E = any> = (context: T, prepareResult: P, executeResult: E) => NodeOutcome
export type FallbackFn<T = Context> = (error: Error, context: T) => T
export type ItemsSelector<T = Context, R = any[]> = (context: T) => R
export type ResultsCollector<T = Context, R = any[]> = (context: T, results: R) => T
export type RetryPredicate = (error: Error) => boolean

// Retry policy
export type BackoffStrategy = 'linear' | 'exponential' | 'fixed'

export interface RetryPolicy {
  maxAttempts: number
  delayMs: number
  backoff: BackoffStrategy
  retryPredicate?: RetryPredicate
}

// Node interfaces
export interface Node<TContext = Context, TPrepare = any, TExecute = any> {
  readonly id: NodeId
  withPrepare: (fn: PrepareFn<TContext, TPrepare>) => Node<TContext, TPrepare, TExecute>
  withExecuteLogic: (fn: ExecuteFn<TPrepare, TExecute>) => Node<TContext, TPrepare, TExecute>
  withFinalize: (fn: FinalizeFn<TContext, TPrepare, TExecute>) => Node<TContext, TPrepare, TExecute>
  withRetry: (policy: RetryPolicy) => Node<TContext, TPrepare, TExecute>
  execute: (context: TContext) => TContext
}

export interface AsyncNode<TContext = Context, TPrepare = any, TExecute = any> {
  readonly id: NodeId
  withPrepare: (fn: (context: TContext) => Promise<TPrepare> | TPrepare) => AsyncNode<TContext, TPrepare, TExecute>
  withExecuteLogic: (fn: (prepareResult: TPrepare) => Promise<TExecute> | TExecute) => AsyncNode<TContext, TPrepare, TExecute>
  withFinalize: (fn: (context: TContext, prepareResult: TPrepare, executeResult: TExecute) => Promise<NodeOutcome> | NodeOutcome) => AsyncNode<TContext, TPrepare, TExecute>
  withRetry: (policy: RetryPolicy) => AsyncNode<TContext, TPrepare, TExecute>
  execute: (context: TContext) => Promise<TContext>
}

// Composable pipeline interfaces
export interface Pipeline<TContext = Context> {
  execute: (context: TContext) => TContext
  withNode: (node: Node<TContext>) => Pipeline<TContext>
}

export interface AsyncPipeline<TContext = Context> {
  execute: (context: TContext) => Promise<TContext>
  withNode: (node: AsyncNode<TContext> | Node<TContext>) => AsyncPipeline<TContext>
}

// Batch processing interfaces
export interface BatchProcessor<TContext = Context, TItem = any, TResult = any> {
  withConcurrency: (concurrency: number) => BatchProcessor<TContext, TItem, TResult>
  withItemsSelector: (selector: ItemsSelector<TContext, TItem[]>) => BatchProcessor<TContext, TItem, TResult>
  withResultsCollector: (collector: ResultsCollector<TContext, TResult[]>) => BatchProcessor<TContext, TItem, TResult>
  execute: (context: TContext) => TContext
}

export interface AsyncBatchProcessor<TContext = Context, TItem = any, TResult = any> {
  withConcurrency: (concurrency: number) => AsyncBatchProcessor<TContext, TItem, TResult>
  withItemsSelector: (selector: ItemsSelector<TContext, TItem[]>) => AsyncBatchProcessor<TContext, TItem, TResult>
  withResultsCollector: (collector: ResultsCollector<TContext, TResult[]>) => AsyncBatchProcessor<TContext, TItem, TResult>
  execute: (context: TContext) => Promise<TContext>
}

// Fork-Join interfaces
export interface Fork<TContext = Context> {
  execute: (context: TContext) => TContext[]
}

export interface AsyncFork<TContext = Context> {
  execute: (context: TContext) => Promise<TContext[]>
}

export interface Join<TContext = Context> {
  execute: (contexts: TContext[]) => TContext
  withJoinFn: (fn: (contexts: TContext[]) => TContext) => Join<TContext>
}

export interface AsyncJoin<TContext = Context> {
  execute: (contexts: TContext[]) => Promise<TContext>
  withJoinFn: (fn: (contexts: TContext[]) => Promise<TContext> | TContext) => AsyncJoin<TContext>
}

// Conditional execution
export interface When<TContext = Context> {
  execute: (context: TContext) => TContext
  withCondition: (fn: (context: TContext) => boolean) => When<TContext>
}

export interface AsyncWhen<TContext = Context> {
  execute: (context: TContext) => Promise<TContext>
  withCondition: (fn: (context: TContext) => Promise<boolean> | boolean) => AsyncWhen<TContext>
}

// Executor interfaces with extra features
export interface Executor {
  execute: <T>(node: Node<T>, context: T) => T
  executeWithFallback: <T>(node: Node<T>, context: T, fallback: FallbackFn<T>) => T
  executeWithLogging: <T>(node: Node<T>, context: T) => T
  executeWithProgress: <T>(node: Node<T>, context: T, progressCallback: ProgressCallback) => T
}

export interface AsyncExecutor {
  execute: <T>(node: AsyncNode<T> | Node<T>, context: T) => Promise<T>
  executeWithFallback: <T>(node: AsyncNode<T> | Node<T>, context: T, fallback: FallbackFn<T>) => Promise<T>
  executeWithLogging: <T>(node: AsyncNode<T> | Node<T>, context: T) => Promise<T>
  executeWithProgress: <T>(node: AsyncNode<T> | Node<T>, context: T, progressCallback: ProgressCallback) => Promise<T>
} 