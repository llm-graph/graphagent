// Default values for the Agent Graph framework
export const DEFAULT_TRANSITION_OUTCOME = "default"
export const DEFAULT_MAX_ATTEMPTS = 3
export const DEFAULT_RETRY_DELAY_MS = 1000
export const DEFAULT_BACKOFF_STRATEGY = "exponential"
export const DEFAULT_BATCH_CONCURRENCY = 5
export const DEFAULT_NODE_PREFIX = "node"
export const DEFAULT_JOIN_OUTCOME = "joined"
export const DEFAULT_FORK_OUTCOME = "forked"

// Error and log messages
export const ERROR_EXHAUSTED_RETRIES = "Exhausted all retry attempts"
export const LOG_SYNC_RETRY = "Retrying node (sync), attempt"
export const LOG_ASYNC_RETRY = "Retrying async node, attempt"
export const LOG_EXECUTE_NODE = "Executing node"
export const LOG_EXECUTE_ASYNC_NODE = "Executing async node"
export const LOG_NODE_COMPLETE = "node execution complete with outcome:"
export const LOG_ASYNC_NODE_COMPLETE = "Async node execution complete with outcome:"
export const LOG_EXECUTE_PIPELINE = "Executing pipeline with"
export const LOG_EXECUTE_ASYNC_PIPELINE = "Executing async pipeline with"
export const LOG_BATCH_PROCESSING = "Batch processing"
export const LOG_ASYNC_BATCH_PROCESSING = "Async batch processing"
export const LOG_FORK_EXECUTION = "Forking execution to"
export const LOG_ASYNC_FORK_EXECUTION = "Async forking execution to"
export const LOG_JOIN_EXECUTION = "Joining"
export const LOG_ASYNC_JOIN_EXECUTION = "Async joining"
export const LOG_CONDITION_MATCHED = "Condition"
export const LOG_CONDITION_NOT_MATCHED = "Condition"
export const LOG_EXECUTION_FAILED = "Execution failed, using fallback handler"
export const LOG_ASYNC_EXECUTION_FAILED = "Async execution failed, using fallback handler"
export const LOG_START_EXECUTION = "Starting execution with logging"
export const LOG_START_ASYNC_EXECUTION = "Starting async execution with logging"
export const LOG_EXECUTION_COMPLETE = "Execution completed in"
export const LOG_ASYNC_EXECUTION_COMPLETE = "Async execution completed in"
export const LOG_EXECUTION_ERROR = "Execution failed after"
export const LOG_ASYNC_EXECUTION_ERROR = "Async execution failed after"
export const ERROR_BATCH_EXECUTION = "Error processing batch item"
export const ERROR_ASYNC_BATCH_EXECUTION = "Error processing async batch item"
export const ERROR_IN_ASYNC_BATCH = "Error in async batch execution"

// Log levels
export enum LOG_LEVELS {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4
}

export const DEFAULT_LOG_LEVEL = LOG_LEVELS.ERROR 