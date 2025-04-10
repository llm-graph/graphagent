import { expect, test, describe } from "bun:test"
import { 
  node, 
  executor
} from "../../"
import type { 
  Context,
  Node,
  NodeOutcome
} from "../../"

// Define the debug context type
interface DebugContext extends Context {
  value?: number;
  events?: string[];
  timestamps?: Record<string, number>;
  duration?: number;
  operations?: string[];
  errors?: string[];
  debugInfo?: {
    debuggingEnabled: boolean;
    timestamp: number;
    message: string;
    secondaryMessage?: string;
    detailedTimestamp?: string;
  };
}

// Log directly to stdout
function log(...args: any[]) {
  console.log("DEBUG:", ...args);
}

// Create a simplified graph executor for testing
function executeSimpleGraph<T extends Context>(entry: Node<T>, context: T): T {
  log("Starting simplified graph execution");
  
  // Execute the node directly - in functional approach, we don't need traversal
  const result = entry.execute(context);
  
  log("Node execution completed, result:", result);
  return result;
}

describe("Debug Tests", () => {
  test("Graph execution with manual traversal", () => {
    log("Starting test");
    
    // Create a new context
    const context: DebugContext = {};
    
    // Create nodes with the new API
    const node1 = node.create<DebugContext>()
      .withPrepare((ctx) => {
        log("node1.prepare called");
        return ctx;
      })
      .withExecuteLogic(() => {
        return "processed";
      })
      .withFinalize((ctx) => {
        log("node1.finalize called, ctx:", ctx);
        ctx.value = 10;
        return "next";
      });
    
    const node2 = node.create<DebugContext>()
      .withPrepare((ctx) => {
        log("node2.prepare called");
        return ctx;
      })
      .withExecuteLogic(() => {
        return "processed";
      })
      .withFinalize((ctx) => {
        log("node2.finalize called, ctx:", ctx);
        ctx.value = (ctx.value || 0) + 5;
        return "done";
      });
    
    // Execute node1
    log("Before executing node1");
    const intermediateResult = executeSimpleGraph(node1, context);
    
    // Execute node2 with the result from node1
    log("Before executing node2");
    const result = executeSimpleGraph(node2, intermediateResult);
    
    log("After executing both nodes, result:", result);
    
    // Check results
    expect(result.value).toBe(15);
  });
  
  test("GraphExecutor implementation", () => {
    console.log("Starting GraphExecutor test");
    
    // Create a new context
    const context: DebugContext = {};
    console.log("Initial context:", context);
    
    // Create nodes with more debugging
    const node1 = node.create<DebugContext>()
      .withPrepare((ctx) => {
        console.log("EXEC: node1.prepare called with context:", ctx);
        return ctx;
      })
      .withExecuteLogic((ctx) => {
        console.log("EXEC: node1.executeLogic called with:", ctx);
        return ctx;
      })
      .withFinalize((ctx) => {
        console.log("EXEC: node1.finalize called with context:", ctx);
        ctx.value = 10;
        console.log("EXEC: context.value =", ctx.value);
        return "next";
      });
    
    const node2 = node.create<DebugContext>()
      .withPrepare((ctx) => {
        console.log("EXEC: node2.prepare called with context:", ctx);
        return ctx;
      })
      .withExecuteLogic((ctx) => {
        console.log("EXEC: node2.executeLogic called with:", ctx);
        return ctx;
      })
      .withFinalize((ctx) => {
        console.log("EXEC: node2.finalize called with context:", ctx);
        ctx.value = (ctx.value || 0) + 5;
        console.log("EXEC: context.value =", ctx.value);
        return "done";
      });
    
    // Create executor
    const exec = executor.create();
    console.log("EXEC: Created executor");
    
    // Execute nodes sequentially
    console.log("Before executing GraphExecutor");
    
    // Execute node1
    const intermediateResult = exec.execute(node1, context);
    console.log("EXEC: After node1 execution, result:", intermediateResult);
    
    // Execute node2 with the result from node1
    const finalResult = exec.execute(node2, intermediateResult);
    console.log("After executing GraphExecutor, result:", finalResult);
    
    // Check results
    expect(finalResult.value).toBe(15);
  });
  
  test("Execution with debugging callbacks", () => {
    // Create a context that will capture execution events
    const context: DebugContext = {
      value: 0,
      events: []  // To track execution flow
    };
    
    // Create a test node that will log each lifecycle phase
    const loggingNode = node.create<DebugContext>()
      .withPrepare((ctx) => {
        // Record the prepare event
        ctx.events = [...(ctx.events || []), "prepare called"];
        log("Prepare phase executed");
        
        // Return a simple prepare object
        return { initialValue: ctx.value };
      })
      .withExecuteLogic((_ctx) => {
        // Return a simple result
        return { success: true, message: "Debug operation succeeded!" };
      })
      .withFinalize((ctx, _prep, _execResult) => {
        // Store debug info
        ctx.debugInfo = {
          debuggingEnabled: true,
          timestamp: Date.now(),
          message: "Debug operation was performed"
        };
        return "debug_complete" as NodeOutcome;
      });
    
    // Execute the logging node
    const result = executor.create().execute(loggingNode, context);
    
    // Verify debug information was captured
    expect(result.debugInfo).toBeDefined();
    expect(result.debugInfo?.debuggingEnabled).toBe(true);
    expect(result.debugInfo?.message).toBe("Debug operation was performed");
  });
  
  test("Execution with timing information", () => {
    // Create a context to track timing information
    const context: DebugContext = {
      value: 0,
      timestamps: {},
      operations: []
    };
    
    // Create nodes that simulate operations with different durations
    const fastOperation = node.create<DebugContext>()
      .withPrepare((ctx) => {
        // Record start time
        ctx.timestamps = {
          ...(ctx.timestamps || {}),
          fastStart: Date.now()
        };
        ctx.operations = [...(ctx.operations || []), "fast_started"];
        return ctx;
      })
      .withExecuteLogic((_ctx) => {
        // Simulate a fast operation (10ms)
        const start = Date.now();
        while (Date.now() - start < 10) {
          // Busy wait to simulate work
        }
        return { operation: "fast" };
      })
      .withFinalize((ctx, _prep, _execResult) => {
        // Record end time and duration
        const endTime = Date.now();
        const startTime = ctx.timestamps?.fastStart || 0;
        
        ctx.duration = (ctx.duration || 0) + (endTime - startTime);
        ctx.operations = [...(ctx.operations || []), "fast_completed"];
        ctx.value = (ctx.value || 0) + 1;
        
        return "fast_done" as NodeOutcome;
      });
    
    const slowOperation = node.create<DebugContext>()
      .withPrepare((ctx) => {
        // Record start time
        ctx.timestamps = {
          ...(ctx.timestamps || {}),
          slowStart: Date.now()
        };
        ctx.operations = [...(ctx.operations || []), "slow_started"];
        return ctx;
      })
      .withExecuteLogic((_ctx) => {
        // Simulate a slow operation (50ms)
        const start = Date.now();
        while (Date.now() - start < 50) {
          // Busy wait to simulate work
        }
        return { operation: "slow" };
      })
      .withFinalize((ctx, _prep, _execResult) => {
        // Record end time and duration
        const endTime = Date.now();
        const startTime = ctx.timestamps?.slowStart || 0;
        
        ctx.duration = (ctx.duration || 0) + (endTime - startTime);
        ctx.operations = [...(ctx.operations || []), "slow_completed"];
        ctx.value = (ctx.value || 0) + 5;
        
        return "slow_done" as NodeOutcome;
      });
    
    // Execute operations in sequence and measure performance
    log("Starting timed execution");
    
    // Start with the fast operation
    const afterFast = executor.create().execute(fastOperation, context);
    log("Fast operation completed in:", afterFast.duration, "ms");
    
    // Then execute the slow operation
    const afterSlow = executor.create().execute(slowOperation, afterFast);
    log("Both operations completed in total:", afterSlow.duration, "ms");
    
    // Check results for timing and operations
    expect(afterSlow.operations).toEqual([
      "fast_completed", 
      "slow_completed"
    ]);
    
    // The total duration should be at least the sum of the simulated wait times
    expect(afterSlow.duration).toBeGreaterThanOrEqual(60); // At least 10ms + 50ms
    
    // Value should be updated correctly
    expect(afterSlow.value).toBe(6); // 0 + 1 + 5
    
    // Demonstrate parallel execution simulation
    const parallelContext: DebugContext = {
      value: 0,
      timestamps: {
        parallelStart: Date.now()
      },
      operations: []
    };
    
    // Execute both operations "in parallel" (actually just recording the total time differently)
    const fastResult = executor.create().execute(fastOperation, JSON.parse(JSON.stringify(parallelContext)));
    const slowResult = executor.create().execute(slowOperation, JSON.parse(JSON.stringify(parallelContext)));
    
    // Now combine the results to simulate parallel execution
    const parallelEndTime = Date.now();
    const combinedContext: DebugContext = {
      value: (fastResult.value || 0) + (slowResult.value || 0),
      operations: [
        ...(fastResult.operations || []),
        ...(slowResult.operations || [])
      ],
      // In true parallel execution, duration would be the max of individual operations
      // Here we're calculating it directly
      duration: parallelEndTime - (parallelContext.timestamps?.parallelStart || 0)
    };
    
    log("Parallel simulation completed in:", combinedContext.duration, "ms");
    
    // Check combined context
    expect(combinedContext.value).toBe(6); // 1 + 5
    expect(combinedContext.operations?.length).toBe(2); // Only has fast_completed and slow_completed
    
    // The main point is to verify that we tracked the operations correctly
    // and that the operations run the right way. The exact timing will vary,
    // so we avoid making strict timing assertions that could cause flaky tests.
  });
}); 