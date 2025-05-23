import { Context, Node, AsyncNode, Pipeline, AsyncPipeline, BatchProcessor, AsyncBatchProcessor, PrepareFn, ExecuteFn, 
  FinalizeFn, RetryPolicy, FallbackFn, ProgressCallback, ItemsSelector, ResultsCollector, Fork, AsyncFork, Join, 
  AsyncJoin, When, AsyncWhen, Executor, AsyncExecutor, NodeOutcome, BackoffStrategy, RetryPredicate, BatchResultMap, 
  BatchItem, BatchResult, ContextRecord, NodeExecutable, NodeId, NodeRecord, PrepareRecord } from "./types"

import { DEFAULT_TRANSITION_OUTCOME, DEFAULT_MAX_ATTEMPTS, DEFAULT_RETRY_DELAY_MS, DEFAULT_BACKOFF_STRATEGY, 
  DEFAULT_BATCH_CONCURRENCY, LOG_LEVELS, ERROR_EXHAUSTED_RETRIES, LOG_SYNC_RETRY, LOG_ASYNC_RETRY, LOG_EXECUTE_NODE, 
  LOG_EXECUTE_ASYNC_NODE, LOG_NODE_COMPLETE, LOG_ASYNC_NODE_COMPLETE, LOG_EXECUTE_PIPELINE, LOG_EXECUTE_ASYNC_PIPELINE, 
  LOG_BATCH_PROCESSING, LOG_ASYNC_BATCH_PROCESSING, LOG_FORK_EXECUTION, LOG_ASYNC_FORK_EXECUTION, LOG_JOIN_EXECUTION, 
  LOG_ASYNC_JOIN_EXECUTION, LOG_CONDITION_MATCHED, LOG_CONDITION_NOT_MATCHED, LOG_EXECUTION_FAILED, LOG_ASYNC_EXECUTION_FAILED, 
  LOG_START_EXECUTION, LOG_START_ASYNC_EXECUTION, LOG_EXECUTION_COMPLETE, LOG_ASYNC_EXECUTION_COMPLETE, LOG_EXECUTION_ERROR, 
  LOG_ASYNC_EXECUTION_ERROR, ERROR_BATCH_EXECUTION, ERROR_ASYNC_BATCH_EXECUTION, ERROR_IN_ASYNC_BATCH, DEFAULT_FORK_OUTCOME, 
  DEFAULT_JOIN_OUTCOME, DEFAULT_LOG_LEVEL, DEFAULT_NODE_PREFIX } from "./constants"

import { deepCopy, sleep, generateId, log, errorMessage, calculateBackoff, executeParallel, chunkArray, compose, 
  getFromContext, mergeConfigs, pipe as utilPipe, setInContext, warnMessage } from "./utils"

// Core utilities
const mergeContext = (context: object, prepareResult: unknown): void => {
  if (!prepareResult || typeof prepareResult !== 'object' || prepareResult === null || prepareResult === context || !context) {
    if (prepareResult && prepareResult !== null) warnMessage(`Attempted to merge invalid prepare result: ${typeof prepareResult}`);
    return;
  }
  const snapshot = (prepareResult as Record<string, any>)['snapshot'];
  Object.entries(prepareResult as ContextRecord)
    .filter(([key]) => key !== 'snapshot' && !(key === 'metadata' && snapshot && typeof snapshot === 'object' && 
        snapshot.metadata && typeof snapshot.metadata === 'object' && 'version' in snapshot.metadata))
    .forEach(([key, value]) => (context as any)[key] !== value && (context = setInContext(context as Context, key, value)));
};

const isExecutable = (obj: unknown): obj is NodeExecutable => 
  obj !== null && typeof obj === 'object' && 'execute' in obj && typeof (obj as NodeExecutable).execute === 'function';

export const isAsync = (node: NodeExecutable): boolean => 
  'execute' in node && typeof node.execute === 'function' && node.execute.constructor.name === 'AsyncFunction';

const getResultKey = (item: BatchItem, result?: unknown): string => {
  if (result && typeof result === 'object') {
    const key = getFromContext(result as Context, 'key', undefined) || 
                getFromContext(result as Context, 'id', undefined) ||
                (result && 'item' in result && result.item && typeof result.item === 'object' ? 
                    getFromContext(result.item as Context, 'id', undefined) : undefined);
    if (key) return String(key);
  }
  if (item && typeof item === 'object') {
    const id = getFromContext(item as Context, 'id', undefined) || getFromContext(item as Context, 'key', undefined);
    if (id) return String(id);
  }
  return Math.random().toString(36).substring(2, 11);
};

const updateContextProperty = <T>(context: T, property: string, value: any): void => {
  if (context && typeof context === 'object') (context as Record<string, any>)[property] = value;
};

const safeExecute = async <T>(node: { execute: (context: T) => T | Promise<T> }, context: T): Promise<T> => {
  if (!isExecutable(node)) { warnMessage(`Node does not have a valid execute function`); return context; }
  try {
    return isAsync(node as NodeExecutable) ? await node.execute(context) : node.execute(context);
  } catch (error) {
    errorMessage(`Error executing node`, error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
};

const executeWithRetries = async <T>(execute: () => Promise<T> | T, maxAttempts: number, 
  shouldRetry: RetryPredicate, onRetry: (attempt: number) => Promise<void> | void): Promise<T> => {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try { return await Promise.resolve(execute()); } 
    catch (error) {
      const typedError = error instanceof Error ? error : new Error(String(error));
      if (!shouldRetry(typedError) || attempt >= maxAttempts - 1) throw typedError;
      await Promise.resolve(onRetry(attempt));
    }
  }
  throw new Error(ERROR_EXHAUSTED_RETRIES);
};

const logOutcome = (nodeId: NodeId, outcome: NodeOutcome, isAsync = false): void => {
  log(DEFAULT_LOG_LEVEL, `${isAsync ? LOG_ASYNC_NODE_COMPLETE : LOG_NODE_COMPLETE} ${nodeId} ${outcome}`);
};

// Node implementation
const createNode = <TContext extends object = Context, TPrepare = PrepareRecord, TExecute = unknown>(): Node<TContext, TPrepare, TExecute> => {
  const createCompleteNode = (
    prepareFn: PrepareFn<TContext, TPrepare> = (ctx) => ctx as unknown as TPrepare,
    executeFn: ExecuteFn<TPrepare, TExecute> = (result) => result as unknown as TExecute,
    finalizeFn: FinalizeFn<TContext, TPrepare, TExecute> = () => DEFAULT_TRANSITION_OUTCOME,
    retryPolicy?: RetryPolicy
  ): Node<TContext, TPrepare, TExecute> => {
    const nodeId = `${DEFAULT_NODE_PREFIX}${generateId()}`;
    return {
      id: nodeId,
      withPrepare: (fn) => createCompleteNode(fn, executeFn, finalizeFn, retryPolicy),
      withExecuteLogic: (fn) => createCompleteNode(prepareFn, fn, finalizeFn, retryPolicy),
      withFinalize: (fn) => createCompleteNode(prepareFn, executeFn, fn, retryPolicy),
      withRetry: (policy) => createCompleteNode(prepareFn, executeFn, finalizeFn, policy),
      execute: (context) => {
        try {
          log(LOG_LEVELS.DEBUG, `${LOG_EXECUTE_NODE} ${nodeId}`);
          const prepareResult = prepareFn(deepCopy(context));
          const executeResult = !retryPolicy ? executeFn(prepareResult) : 
            (() => {
              const { maxAttempts, retryPredicate } = retryPolicy;
              for (let attempt = 0; attempt < maxAttempts; attempt++) {
                try { return executeFn(prepareResult); } 
                catch (error) {
                  const typedError = error instanceof Error ? error : new Error(String(error));
                  const shouldRetry = retryPredicate ? retryPredicate(typedError) : true;
                  if (!shouldRetry || attempt >= maxAttempts - 1) throw typedError;
                  log(LOG_LEVELS.INFO, `${LOG_SYNC_RETRY} ${attempt + 2}/${maxAttempts}`);
                }
              }
              throw new Error(ERROR_EXHAUSTED_RETRIES);
            })();
          const outcome = finalizeFn(context, prepareResult, executeResult);
          if (typeof prepareResult === 'object' && prepareResult !== null && 'iterations' in prepareResult)
            updateContextProperty(context, 'iterations', (prepareResult as any).iterations);
          mergeContext(context, prepareResult);
          logOutcome(nodeId, outcome);
          return context;
        } catch (error) {
          errorMessage(`Error executing node ${nodeId}`, error instanceof Error ? error : new Error(String(error)));
          throw error;
        }
      }
    };
  };
  return createCompleteNode();
};

const createAsyncNode = <TContext extends object = Context, TPrepare = PrepareRecord, TExecute = unknown>(): AsyncNode<TContext, TPrepare, TExecute> => {
  const defaultPrepareFn = (ctx: TContext): TPrepare => ctx as unknown as TPrepare;
  const defaultExecuteFn = (result: TPrepare): TExecute => result as unknown as TExecute;
  const defaultFinalizeFn = (): NodeOutcome => DEFAULT_TRANSITION_OUTCOME;
  
  const createCompleteNode = (
    prepareFn: (ctx: TContext) => Promise<TPrepare> | TPrepare = defaultPrepareFn,
    executeFn: (result: TPrepare) => Promise<TExecute> | TExecute = defaultExecuteFn,
    finalizeFn: (ctx: TContext, prep: TPrepare, exec: TExecute) => Promise<NodeOutcome> | NodeOutcome = defaultFinalizeFn,
    retryPolicy?: RetryPolicy
  ): AsyncNode<TContext, TPrepare, TExecute> => {
    const nodeId = `${DEFAULT_NODE_PREFIX}${generateId()}`;
    return {
      id: nodeId,
      withPrepare: (fn) => createCompleteNode(fn, executeFn, finalizeFn, retryPolicy),
      withExecuteLogic: (fn) => createCompleteNode(prepareFn, fn, finalizeFn, retryPolicy),
      withFinalize: (fn) => createCompleteNode(prepareFn, executeFn, fn, retryPolicy),
      withRetry: (policy) => createCompleteNode(prepareFn, executeFn, finalizeFn, policy),
      execute: async (context) => {
        try {
          log(LOG_LEVELS.DEBUG, `${LOG_EXECUTE_ASYNC_NODE} ${nodeId}`);
          const prepareResult = await Promise.resolve(prepareFn(context));
          const executeResult = await (!retryPolicy ? executeFn(prepareResult) : 
            executeWithRetries(
              () => executeFn(prepareResult),
              retryPolicy.maxAttempts,
              retryPolicy.retryPredicate || (() => true),
              async (attempt) => {
                await sleep(calculateBackoff(attempt + 1, retryPolicy.delayMs, retryPolicy.backoff));
                log(LOG_LEVELS.INFO, `${LOG_ASYNC_RETRY} ${attempt + 2}/${retryPolicy.maxAttempts}`);
              }
            ));
          const outcome = await Promise.resolve(finalizeFn(context, prepareResult, executeResult));
          mergeContext(context, prepareResult);
          logOutcome(nodeId, outcome, true);
          return context;
        } catch (error) {
          errorMessage(`Error executing async node ${nodeId}`, error instanceof Error ? error : new Error(String(error)));
          throw error;
        }
      }
    };
  };
  return createCompleteNode();
};

// Pipeline, Fork, and Join implementations
const createPipeline = <TContext = Context>(...nodes: Array<Node<TContext>>): Pipeline<TContext> => ({
  execute: (context) => {
    log(LOG_LEVELS.INFO, `${LOG_EXECUTE_PIPELINE} ${nodes.length} nodes`);
    return nodes.reduce((ctx, node) => node.execute(ctx), deepCopy(context));
  },
  withNode: (node) => createPipeline(...nodes, node)
});

const createAsyncPipeline = <TContext = Context>(...nodes: Array<AsyncNode<TContext> | Node<TContext>>): AsyncPipeline<TContext> => ({
  execute: async (context) => {
    log(LOG_LEVELS.INFO, `${LOG_EXECUTE_ASYNC_PIPELINE} ${nodes.length} nodes`);
    let ctx = deepCopy(context);
    for (const node of nodes) ctx = await safeExecute(node, ctx);
    return ctx;
  },
  withNode: (node) => createAsyncPipeline(...nodes, node)
});

const createFork = <TContext = Context>(...nodes: Array<Node<TContext>>): Fork<TContext> => ({
  execute: (context) => {
    log(LOG_LEVELS.INFO, `${LOG_FORK_EXECUTION} ${nodes.length} paths`);
    const copiedContext = deepCopy(context);
    return nodes.length === 0 ? 
      [{ ...copiedContext, outcome: DEFAULT_FORK_OUTCOME } as TContext] : 
      nodes.map(node => node.execute({ ...copiedContext }));
  }
});

const createAsyncFork = <TContext = Context>(...nodes: Array<AsyncNode<TContext> | Node<TContext>>): AsyncFork<TContext> => ({
  execute: async (context) => {
    log(LOG_LEVELS.INFO, `${LOG_ASYNC_FORK_EXECUTION} ${nodes.length} paths`);
    const copiedContext = deepCopy(context);
    return nodes.length === 0 ?
      [{ ...copiedContext, outcome: DEFAULT_FORK_OUTCOME } as TContext] :
      executeParallel(nodes, async (node) => safeExecute(node, { ...copiedContext }));
  }
});

// Batch processors
const createBatchProcessor = <TContext = Context, TItem = BatchItem, TResult = BatchResult>(
  itemProcessor: Node<TItem, unknown, TResult>
): BatchProcessor<TContext, TItem, TResult> => {
  const createCompleteBatchProcessor = (
    processor = itemProcessor,
    concurrency = DEFAULT_BATCH_CONCURRENCY,
    itemsSelector: ItemsSelector<TContext, TItem[]> = () => [] as unknown as TItem[],
    resultsCollector: ResultsCollector<TContext, TResult[]> = (ctx, results) => ({ ...ctx, results })
  ): BatchProcessor<TContext, TItem, TResult> => ({
    withConcurrency: (v) => createCompleteBatchProcessor(processor, v, itemsSelector, resultsCollector),
    withItemsSelector: (s) => createCompleteBatchProcessor(processor, concurrency, s, resultsCollector),
    withResultsCollector: (c) => createCompleteBatchProcessor(processor, concurrency, itemsSelector, c),
    execute: (context) => {
      const items = itemsSelector(context);
      log(LOG_LEVELS.INFO, `${LOG_BATCH_PROCESSING} ${items.length} items`);
      const results: BatchResultMap<TResult> = {};
      chunkArray(items, Math.min(items.length, 100)).forEach(chunk => 
        chunk.forEach(item => {
          try {
            results[getResultKey(item, (processor.execute(item) as unknown as TResult))] = processor.execute(item) as unknown as TResult;
          } catch (error) {
            errorMessage(ERROR_BATCH_EXECUTION, error instanceof Error ? error : new Error(String(error)));
            results[getResultKey(item)] = { processed: false, error: error instanceof Error ? error.message : String(error) } as unknown as TResult;
          }
        })
      );
      return resultsCollector(context, Object.values(results));
    }
  });
  return createCompleteBatchProcessor();
};

const createAsyncBatchProcessor = <TContext = Context, TItem = BatchItem, TResult = BatchResult>(
  itemProcessor: AsyncNode<TItem, unknown, TResult> | Node<TItem, unknown, TResult>
): AsyncBatchProcessor<TContext, TItem, TResult> => {
  const createCompleteAsyncBatchProcessor = (
    processor = itemProcessor,
    concurrency = DEFAULT_BATCH_CONCURRENCY,
    itemsSelector: ItemsSelector<TContext, TItem[]> = () => [] as unknown as TItem[],
    resultsCollector: ResultsCollector<TContext, TResult[]> = (ctx, results) => ({ ...ctx, results })
  ): AsyncBatchProcessor<TContext, TItem, TResult> => ({
    withConcurrency: (v) => createCompleteAsyncBatchProcessor(processor, v, itemsSelector, resultsCollector),
    withItemsSelector: (s) => createCompleteAsyncBatchProcessor(processor, concurrency, s, resultsCollector),
    withResultsCollector: (c) => createCompleteAsyncBatchProcessor(processor, concurrency, itemsSelector, c),
    execute: async (context) => {
      const items = itemsSelector(context);
      log(LOG_LEVELS.INFO, `${LOG_ASYNC_BATCH_PROCESSING} ${items.length} items with concurrency ${concurrency}`);
      try {
        const keyedResults = await executeParallel(items, async (item) => {
          try {
            const result = await safeExecute(processor, item) as TResult;
            return { key: getResultKey(item, result), result };
          } catch (error) {
            errorMessage(ERROR_ASYNC_BATCH_EXECUTION, error instanceof Error ? error : new Error(String(error)));
            return { 
              key: getResultKey(item), 
              result: { processed: false, error: error instanceof Error ? error.message : String(error) } as unknown as TResult 
            };
          }
        }, concurrency);
        return resultsCollector(context, Object.values(keyedResults.reduce((acc, {key, result}) => 
          setInContext(acc, key, result), {} as BatchResultMap<TResult>)));
      } catch (error) {
        errorMessage(ERROR_IN_ASYNC_BATCH, error instanceof Error ? error : new Error(String(error)));
        throw error;
      }
    }
  });
  return createCompleteAsyncBatchProcessor();
};

// Executors
const createExecutor = (): Executor => ({
  execute: <T>(node: Node<T>, context: T): T => node.execute(deepCopy(context)),
  executeWithFallback: <T>(node: Node<T>, context: T, fallback: FallbackFn<T>): T => {
    try { return node.execute(deepCopy(context)); } 
    catch (error) {
      log(LOG_LEVELS.WARN, LOG_EXECUTION_FAILED);
      return fallback(error instanceof Error ? error : new Error(String(error)), deepCopy(context));
    }
  },
  executeWithLogging: <T>(node: Node<T>, context: T): T => {
    log(LOG_LEVELS.INFO, LOG_START_EXECUTION, { contextKeys: Object.keys(context as NodeRecord) });
    const startTime = Date.now();
    try {
      const result = node.execute(deepCopy(context));
      log(LOG_LEVELS.INFO, `${LOG_EXECUTION_COMPLETE} ${Date.now() - startTime}ms`, { resultKeys: Object.keys(result as NodeRecord) });
      return result;
    } catch (error) {
      log(LOG_LEVELS.ERROR, `${LOG_EXECUTION_ERROR} ${Date.now() - startTime}ms`, error);
      throw error instanceof Error ? error : new Error(String(error));
    }
  },
  executeWithProgress: <T>(node: Node<T>, context: T, progressCb: ProgressCallback): T => 
    utilPipe<T>(
      (ctx: T) => { progressCb(0, 1); return deepCopy(ctx); },
      (ctx: T) => node.execute(ctx),
      (ctx: T) => { progressCb(1, 1); return ctx; }
    )(context)
});

const createAsyncExecutor = (): AsyncExecutor => ({
  execute: async <T>(node: AsyncNode<T> | Node<T>, context: T): Promise<T> => 
    safeExecute(node, deepCopy(context)),
  executeWithFallback: async <T>(node: AsyncNode<T> | Node<T>, context: T, fallback: FallbackFn<T>): Promise<T> => {
    try { return await safeExecute(node, deepCopy(context)); } 
    catch (error) {
      log(LOG_LEVELS.WARN, LOG_ASYNC_EXECUTION_FAILED);
      return fallback(error instanceof Error ? error : new Error(String(error)), deepCopy(context));
    }
  },
  executeWithLogging: async <T>(node: AsyncNode<T> | Node<T>, context: T): Promise<T> => {
    log(LOG_LEVELS.INFO, LOG_START_ASYNC_EXECUTION, { contextKeys: Object.keys(context as NodeRecord) });
    const startTime = Date.now();
    try {
      const result = await safeExecute(node, deepCopy(context));
      log(LOG_LEVELS.INFO, `${LOG_ASYNC_EXECUTION_COMPLETE} ${Date.now() - startTime}ms`, { resultKeys: Object.keys(result as NodeRecord) });
      return result;
    } catch (error) {
      log(LOG_LEVELS.ERROR, `${LOG_ASYNC_EXECUTION_ERROR} ${Date.now() - startTime}ms`, error);
      throw error instanceof Error ? error : new Error(String(error));
    }
  },
  executeWithProgress: async <T>(node: AsyncNode<T> | Node<T>, context: T, progressCb: ProgressCallback): Promise<T> => {
    progressCb(0, 1); const result = await safeExecute(node, deepCopy(context)); progressCb(1, 1); return result;
  }
});

// Join and Condition
const createRetryPolicyConfig = (maxAttempts = DEFAULT_MAX_ATTEMPTS, delayMs = DEFAULT_RETRY_DELAY_MS,
  backoff = DEFAULT_BACKOFF_STRATEGY as BackoffStrategy, retryPredicate?: RetryPredicate): RetryPolicy => 
  mergeConfigs({ maxAttempts, delayMs, backoff, retryPredicate });

const createJoin = <TContext = Context>(): Join<TContext> => {
  let joinFn = (contexts: TContext[]): TContext => {
    const result = { ...compose<TContext>(...contexts.map(ctx => (acc: TContext) => ({ ...acc, ...ctx })))({} as TContext) };
    (result as Record<string, any>)['outcome'] = DEFAULT_JOIN_OUTCOME;
    return result;
  };
  return {
    execute: (contexts) => { log(LOG_LEVELS.INFO, `${LOG_JOIN_EXECUTION} ${contexts.length} execution paths`); return joinFn(contexts); },
    withJoinFn: (fn) => { joinFn = fn; return { execute: (contexts) => joinFn(contexts), withJoinFn: (newFn) => createJoin<TContext>().withJoinFn(newFn) }; }
  };
};

const createAsyncJoin = <TContext = Context>(): AsyncJoin<TContext> => {
  let joinFn = (contexts: TContext[]): TContext | Promise<TContext> => {
    const result = { ...contexts.reduce((merged, ctx) => ({ ...merged, ...ctx }), {} as TContext) };
    (result as Record<string, any>)['outcome'] = DEFAULT_JOIN_OUTCOME;
    return result;
  };
  return {
    execute: async (contexts) => { log(LOG_LEVELS.INFO, `${LOG_ASYNC_JOIN_EXECUTION} ${contexts.length} paths`); return joinFn(contexts); },
    withJoinFn: (fn) => { joinFn = fn; return { execute: async (contexts) => joinFn(contexts), withJoinFn: (newFn) => createAsyncJoin<TContext>().withJoinFn(newFn) }; }
  };
};

const createWhen = <TContext extends Record<string, any> = Context>(condition: string, targetNode: Node<TContext>): When<TContext> => {
  let conditionFn = (context: TContext): boolean => getFromContext(context as Context, 'outcome', undefined) === condition;
  return {
    execute: (context) => {
      if (conditionFn(context)) {
        log(LOG_LEVELS.DEBUG, `${LOG_CONDITION_MATCHED} '${condition}' matched, executing target node`);
        return targetNode.execute(context);
      }
      log(LOG_LEVELS.DEBUG, `${LOG_CONDITION_NOT_MATCHED} '${condition}' not matched, skipping target node`);
      return context;
    },
    withCondition: (fn) => { conditionFn = fn; return { execute: (context) => fn(context) ? targetNode.execute(context) : context, 
      withCondition: (newFn) => createWhen(condition, targetNode).withCondition(newFn) }; }
  };
};

const createAsyncWhen = <TContext extends Record<string, any> = Context>(condition: string, targetNode: AsyncNode<TContext> | Node<TContext>): AsyncWhen<TContext> => {
  let conditionFn = (context: TContext): boolean | Promise<boolean> => getFromContext(context as Context, 'outcome', undefined) === condition;
  return {
    execute: async (context) => {
      const matches = await conditionFn(context);
      log(LOG_LEVELS.DEBUG, `${matches ? LOG_CONDITION_MATCHED : LOG_CONDITION_NOT_MATCHED} '${condition}' ${matches ? 'matched' : 'not matched'}`);
      return matches ? await safeExecute(targetNode, context) : context;
    },
    withCondition: (fn) => { conditionFn = fn; return { execute: async (context) => await fn(context) ? await safeExecute(targetNode, context) : context, 
      withCondition: (newFn) => createAsyncWhen(condition, targetNode).withCondition(newFn) }; }
  };
};

// Exports
export const node = { create: createNode, createAsync: createAsyncNode };
export const executor = { create: createExecutor, createAsync: createAsyncExecutor };
export const retry = { policy: createRetryPolicyConfig };
export const batch = { create: createBatchProcessor, createAsync: createAsyncBatchProcessor };
export const fork = { create: createFork, createAsync: createAsyncFork };
export const join = { create: createJoin, createAsync: createAsyncJoin };
export const pipe = <T>(...nodes: Array<Node<T>>): Pipeline<T> => createPipeline(...nodes);
export const pipeAsync = <T>(...nodes: Array<AsyncNode<T> | Node<T>>): AsyncPipeline<T> => createAsyncPipeline(...nodes);
export const when = <T extends Record<string, any>>(outcome: string, targetNode: Node<T>): When<T> => createWhen(outcome, targetNode);
export const whenAsync = <T extends Record<string, any>>(outcome: string, targetNode: AsyncNode<T> | Node<T>): AsyncWhen<T> => createAsyncWhen(outcome, targetNode);
export const parallel = <T>(...nodes: Array<Node<T>>): Fork<T> => createFork(...nodes);
export const parallelAsync = <T>(...nodes: Array<AsyncNode<T> | Node<T>>): AsyncFork<T> => createAsyncFork(...nodes);
export const DEFAULT_OUTCOME = 'default';

const getOutcome = (result: any): string | undefined => 
  result && typeof result === 'object' && 'outcome' in result ? String(result.outcome) : undefined;

export const executeNode = async <TContext extends Context>(node: NodeExecutable & { outgoingEdges?: Record<string, NodeExecutable> }, context: TContext): Promise<TContext> => {
  try {
    const prepareResult = typeof node.prepare === 'function' ? node.prepare(structuredClone(context)) : undefined;
    if (prepareResult && typeof prepareResult === 'object' && 'outcome' in prepareResult && prepareResult.outcome) {
      const outcome = String(prepareResult.outcome);
      if (outcome && node.outgoingEdges?.[outcome]) {
        const resultCtx = structuredClone(context);
        mergeContext(resultCtx, prepareResult);
        return await executeNode(node.outgoingEdges[outcome], resultCtx);
      }
    }
    
    let result;
    try { result = typeof node.execute === 'function' ? await node.execute(context) : undefined; } 
    catch (error) {
      if (node.errorHandler && typeof node.errorHandler === 'function') {
        result = await node.errorHandler(error, context);
        if (!result || typeof result !== 'object') result = undefined;
      } else throw error;
    }
    
    const resultCtx = structuredClone(context);
    if (prepareResult && typeof prepareResult === 'object') mergeContext(resultCtx, prepareResult);
    if (result && typeof result === 'object') mergeContext(resultCtx, result);
    
    const outcome = getOutcome(result);
    const nextNode = outcome && node.outgoingEdges?.[outcome] ? node.outgoingEdges[outcome] : node.outgoingEdges?.[DEFAULT_OUTCOME];
    return nextNode ? await executeNode(nextNode, resultCtx) : resultCtx;
  } catch (error) {
    console.error(`Error executing node: ${node.id || 'unknown'}`, error);
    throw error;
  }
}; 