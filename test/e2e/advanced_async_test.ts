import { expect, test, describe } from "bun:test"
import { 
  node,
  executor,
  retry,
  join,
  whenAsync,
  parallelAsync
} from "../../"
import type { 
  Context, 
  NodeOutcome
} from "../../"

// Define the context type
interface AsyncContext extends Context {
  values?: number[];
  results?: string[];
  processedBy?: string[];
  errors?: string[];
  condition?: string;
  transformations?: string[];
  finalValue?: number;
  winner?: string;
  completionOrder?: string[];
}

// Define additional types for the test cases
interface PrepValue {
  value: number;
}

describe("Advanced Async Operations Tests", () => {
  // Test parallel async execution with multiple nodes
  test("Parallel async execution with result aggregation", async () => {
    const context: AsyncContext = { values: [10, 20, 30] };
    
    // Create async processor nodes
    const doubleNode = node.createAsync<AsyncContext, PrepValue, number>()
      .withPrepare(async (ctx) => {
        await new Promise(resolve => setTimeout(resolve, 5)); // Small delay
        return { value: ctx.values?.[0] || 0 };
      })
      .withExecuteLogic(async (prepResult: PrepValue) => {
        await new Promise(resolve => setTimeout(resolve, 5)); // Small delay
        return prepResult.value * 2;
      })
      .withFinalize(async (ctx, _prep, result) => {
        ctx.results = [...(ctx.results || []), `Doubled: ${result}`];
        ctx.processedBy = [...(ctx.processedBy || []), "double"];
        return "doubled" as NodeOutcome;
      });
    
    const squareNode = node.createAsync<AsyncContext, PrepValue, number>()
      .withPrepare(async (ctx) => {
        await new Promise(resolve => setTimeout(resolve, 10)); // Medium delay
        return { value: ctx.values?.[1] || 0 };
      })
      .withExecuteLogic(async (prepResult: PrepValue) => {
        await new Promise(resolve => setTimeout(resolve, 10)); // Medium delay
        return prepResult.value ** 2;
      })
      .withFinalize(async (ctx, _prep, result) => {
        ctx.results = [...(ctx.results || []), `Squared: ${result}`];
        ctx.processedBy = [...(ctx.processedBy || []), "square"];
        return "squared" as NodeOutcome;
      });
    
    const halfNode = node.createAsync<AsyncContext, PrepValue, number>()
      .withPrepare(async (ctx) => {
        await new Promise(resolve => setTimeout(resolve, 15)); // Longer delay
        return { value: ctx.values?.[2] || 0 };
      })
      .withExecuteLogic(async (prepResult: PrepValue) => {
        await new Promise(resolve => setTimeout(resolve, 15)); // Longer delay
        return prepResult.value / 2;
      })
      .withFinalize(async (ctx, _prep, result) => {
        ctx.results = [...(ctx.results || []), `Halved: ${result}`];
        ctx.processedBy = [...(ctx.processedBy || []), "half"];
        return "halved" as NodeOutcome;
      });
    
    // Create a parallel execution with the three nodes
    const parallelOperation = parallelAsync(doubleNode, squareNode, halfNode);
    
    // Execute the parallel operation
    const results = await parallelOperation.execute(context);
    
    // Create a custom join function
    const customJoin = join.createAsync<AsyncContext>().withJoinFn(async (contexts) => {
      const joinedContext: AsyncContext = {
        results: [],
        processedBy: []
      };
      
      // Aggregate results from all contexts
      contexts.forEach(ctx => {
        if (ctx.results) {
          joinedContext.results = [...(joinedContext.results || []), ...(ctx.results || [])];
        }
        if (ctx.processedBy) {
          joinedContext.processedBy = [...(joinedContext.processedBy || []), ...(ctx.processedBy || [])];
        }
      });
      
      return joinedContext;
    });
    
    // Join the results
    const joinedResult = await customJoin.execute(results);
    
    // Verify the results
    expect(joinedResult.results?.length).toBe(3);
    expect(joinedResult.results).toContain("Doubled: 20");
    expect(joinedResult.results).toContain("Squared: 400");
    expect(joinedResult.results).toContain("Halved: 15");
    expect(joinedResult.processedBy?.length).toBe(3);
    expect(joinedResult.processedBy).toEqual(expect.arrayContaining(["double", "square", "half"]));
  });
  
  // Test async conditional execution with whenAsync
  test("Complex async conditional branching", async () => {
    // Define condition functions
    const isPositive = async (ctx: AsyncContext): Promise<boolean> => {
      await new Promise(resolve => setTimeout(resolve, 5)); // Small delay
      return (ctx.values?.[0] || 0) > 0;
    };
    
    const isEven = async (ctx: AsyncContext): Promise<boolean> => {
      await new Promise(resolve => setTimeout(resolve, 5)); // Small delay
      return ((ctx.values?.[0] || 0) % 2) === 0;
    };
    
    // Define processing nodes
    const positiveProcessor = node.createAsync<AsyncContext>()
      .withPrepare(async (ctx) => ctx)
      .withExecuteLogic(async () => "processed positive")
      .withFinalize(async (ctx) => {
        ctx.condition = "positive";
        return "positive_processed" as NodeOutcome;
      });
    
    const negativeProcessor = node.createAsync<AsyncContext>()
      .withPrepare(async (ctx) => ctx)
      .withExecuteLogic(async () => "processed negative")
      .withFinalize(async (ctx) => {
        ctx.condition = "negative";
        return "negative_processed" as NodeOutcome;
      });
    
    const evenProcessor = node.createAsync<AsyncContext>()
      .withPrepare(async (ctx) => ctx)
      .withExecuteLogic(async () => "processed even")
      .withFinalize(async (ctx) => {
        ctx.condition = "even";
        return "even_processed" as NodeOutcome;
      });
    
    const oddProcessor = node.createAsync<AsyncContext>()
      .withPrepare(async (ctx) => ctx)
      .withExecuteLogic(async () => "processed odd")
      .withFinalize(async (ctx) => {
        ctx.condition = "odd";
        return "odd_processed" as NodeOutcome;
      });
    
    // Create conditional branches
    const positiveCondition = whenAsync<AsyncContext>("positive", positiveProcessor).withCondition(isPositive);
    const negativeCondition = whenAsync<AsyncContext>("negative", negativeProcessor).withCondition(async (ctx) => {
      // Need to explicitly await the isPositive result and negate it
      const result = await isPositive(ctx);
      return !result;
    });
    const evenCondition = whenAsync<AsyncContext>("even", evenProcessor).withCondition(isEven);
    const oddCondition = whenAsync<AsyncContext>("odd", oddProcessor).withCondition(async (ctx) => {
      // We need to explicitly await the isEven result and negate it
      return !(await isEven(ctx));
    });
    
    // Test with positive and even value (10)
    let context: AsyncContext = { values: [10] };
    let result = await positiveCondition.execute(context);
    expect(result.condition).toBe("positive");
    
    result = await evenCondition.execute(context);
    expect(result.condition).toBe("even");
    
    // Test with positive and odd value (5)
    context = { values: [5] };
    result = await positiveCondition.execute(context);
    expect(result.condition).toBe("positive");
    
    result = await oddCondition.execute(context);
    expect(result.condition).toBe("odd");
    
    // Test with negative and even value (-6)
    context = { values: [-6] };
    result = await negativeCondition.execute(context);
    expect(result.condition).toBe("negative");
    
    result = await evenCondition.execute(context);
    expect(result.condition).toBe("even");
    
    // Test with negative and odd value (-3)
    context = { values: [-3] };
    result = await negativeCondition.execute(context);
    expect(result.condition).toBe("negative");
    
    result = await oddCondition.execute(context);
    expect(result.condition).toBe("odd");
  });
  
  // Test async pipeline with multiple stages and error handling
  test("Complex async pipeline with error recovery", async () => {
    const context: AsyncContext = { values: [42] };
    
    // Create a pipeline of nodes
    const firstNode = node.createAsync<AsyncContext>()
      .withPrepare(async (ctx) => ctx)
      .withExecuteLogic(async () => "first stage")
      .withFinalize(async (ctx) => {
        ctx.processedBy = [...(ctx.processedBy || []), "first"];
        return "first_done" as NodeOutcome;
      });
    
    const errorNode = node.createAsync<AsyncContext>()
      .withPrepare(async (ctx) => ctx)
      .withExecuteLogic(async () => {
        throw new Error("Simulated pipeline error");
      })
      .withFinalize(async (ctx) => {
        ctx.processedBy = [...(ctx.processedBy || []), "error"];
        return "error_done" as NodeOutcome;
      });
    
    const recoveryNode = node.createAsync<AsyncContext>()
      .withPrepare(async (ctx) => ctx)
      .withExecuteLogic(async () => "recovery")
      .withFinalize(async (ctx) => {
        ctx.processedBy = [...(ctx.processedBy || []), "recovery"];
        return "recovery_done" as NodeOutcome;
      });
    
    const lastNode = node.createAsync<AsyncContext>()
      .withPrepare(async (ctx) => ctx)
      .withExecuteLogic(async () => "last stage")
      .withFinalize(async (ctx) => {
        ctx.processedBy = [...(ctx.processedBy || []), "last"];
        return "last_done" as NodeOutcome;
      });
    
    // Execute with fallback to handle errors
    try {
      // Execute each node in sequence to simulate a pipeline
      let result = await firstNode.execute(context);
      result = await errorNode.execute(result); // This will throw an error
      result = await lastNode.execute(result);
      
      // We should never reach here due to the error
      expect(true).toBe(false); 
    } catch (error) {
      // When error occurs, use recovery node
      let ctx = context;
      ctx = await firstNode.execute(ctx); // Re-execute first node
      ctx.errors = [...(ctx.errors || []), (error as Error).message];
      ctx = await recoveryNode.execute(ctx);
      
      // Verify results
      expect(ctx.processedBy?.length).toBe(3); // Two first node calls + recovery node
      expect(ctx.processedBy?.[0]).toBe("first");
      expect(ctx.processedBy?.[1]).toBe("first");
      expect(ctx.processedBy?.[2]).toBe("recovery");
      expect(ctx.errors?.length).toBe(1);
      expect(ctx.errors?.[0]).toContain("Simulated pipeline error");
    }
  });
  
  // Test async retry with different backoff strategies
  test("Async operation with advanced retry strategies", async () => {
    let attempts = 0;
    
    // Create a node that fails on first attempts
    const unreliableNode = node.createAsync<AsyncContext>()
      .withPrepare(async (ctx) => ctx)
      .withExecuteLogic(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error(`Failure on attempt ${attempts}`);
        }
        return `Success on attempt ${attempts}`;
      })
      .withFinalize(async (ctx, _prep, result) => {
        ctx.results = [...(ctx.results || []), result as string];
        return "done" as NodeOutcome;
      })
      .withRetry(retry.policy(
        4, // Max attempts
        50, // Base delay
        "exponential", // Backoff strategy
        (error) => error.message.includes("Failure") // Only retry specific errors
      ));
    
    // Reset attempts counter
    attempts = 0;
    
    // Execute with retry
    const context: AsyncContext = { results: [] };
    const result = await executor.createAsync().execute(unreliableNode, context);
    
    // Verify results
    expect(attempts).toBe(3); // Should have taken 3 attempts
    expect(result.results?.length).toBe(1);
    expect(result.results?.[0]).toBe("Success on attempt 3");
  });
  
  // Test dynamic pipeline construction based on context
  test("Dynamic pipeline construction based on context values", async () => {
    // Define a set of transformation nodes
    const doubleNode = node.createAsync<AsyncContext, PrepValue, number>()
      .withPrepare(async (ctx) => ({ value: ctx.finalValue || 1 }))
      .withExecuteLogic(async (prepResult: PrepValue) => {
        const result = prepResult.value * 2;
        await new Promise(resolve => setTimeout(resolve, 5));
        return result;
      })
      .withFinalize(async (ctx, _prep, result) => {
        ctx.transformations = [...(ctx.transformations || []), "double"];
        ctx.finalValue = result;
        return "doubled" as NodeOutcome;
      });
    
    const squareNode = node.createAsync<AsyncContext, PrepValue, number>()
      .withPrepare(async (ctx) => ({ value: ctx.finalValue || 1 }))
      .withExecuteLogic(async (prepResult: PrepValue) => {
        const result = prepResult.value ** 2;
        await new Promise(resolve => setTimeout(resolve, 5));
        return result;
      })
      .withFinalize(async (ctx, _prep, result) => {
        ctx.transformations = [...(ctx.transformations || []), "square"];
        ctx.finalValue = result;
        return "squared" as NodeOutcome;
      });
    
    const addTenNode = node.createAsync<AsyncContext, PrepValue, number>()
      .withPrepare(async (ctx) => ({ value: ctx.finalValue || 0 }))
      .withExecuteLogic(async (prepResult: PrepValue) => {
        const result = prepResult.value + 10;
        await new Promise(resolve => setTimeout(resolve, 5));
        return result;
      })
      .withFinalize(async (ctx, _prep, result) => {
        ctx.transformations = [...(ctx.transformations || []), "add10"];
        ctx.finalValue = result;
        return "added10" as NodeOutcome;
      });
    
    const subtractFiveNode = node.createAsync<AsyncContext, PrepValue, number>()
      .withPrepare(async (ctx) => ({ value: ctx.finalValue || 0 }))
      .withExecuteLogic(async (prepResult: PrepValue) => {
        const result = prepResult.value - 5;
        await new Promise(resolve => setTimeout(resolve, 5));
        return result;
      })
      .withFinalize(async (ctx, _prep, result) => {
        ctx.transformations = [...(ctx.transformations || []), "subtract5"];
        ctx.finalValue = result;
        return "subtracted5" as NodeOutcome;
      });
    
    // Test case 1: Processing for even numbers: Double -> Square -> Add 10
    const evenStartValue = 4;
    let evenContext: AsyncContext = { 
      finalValue: evenStartValue, 
      transformations: [] 
    };
    
    // Execute each step sequentially
    evenContext = await doubleNode.execute(evenContext);
    evenContext = await squareNode.execute(evenContext);
    evenContext = await addTenNode.execute(evenContext);
    
    // Verify even number transformation: 4 -> 8 -> 64 -> 74
    expect(evenContext.finalValue).toBe(74);
    expect(evenContext.transformations).toEqual(["double", "square", "add10"]);
    
    // Test case 2: Processing for odd numbers: Square -> Double -> Subtract 5
    const oddStartValue = 5;
    let oddContext: AsyncContext = { 
      finalValue: oddStartValue, 
      transformations: [] 
    };
    
    // Execute each step sequentially
    oddContext = await squareNode.execute(oddContext);
    oddContext = await doubleNode.execute(oddContext);
    oddContext = await subtractFiveNode.execute(oddContext);
    
    // Verify odd number transformation: 5 -> 25 -> 50 -> 45
    expect(oddContext.finalValue).toBe(45);
    expect(oddContext.transformations).toEqual(["square", "double", "subtract5"]);
  });
  
  // Test handling race conditions with parallel operations
  test("Race condition handling with parallel operations", async () => {
    // Create nodes with different completion times
    const fastNode = node.createAsync<AsyncContext>()
      .withPrepare(async (ctx) => ctx)
      .withExecuteLogic(async () => {
        await new Promise(resolve => setTimeout(resolve, 20));
        return "fast";
      })
      .withFinalize(async (ctx, _prep) => {
        if (!ctx.winner) {
          ctx.winner = "fast";
        }
        ctx.completionOrder = [...(ctx.completionOrder || []), "fast"];
        return "fast_done" as NodeOutcome;
      });
    
    const mediumNode = node.createAsync<AsyncContext>()
      .withPrepare(async (ctx) => ctx)
      .withExecuteLogic(async () => {
        await new Promise(resolve => setTimeout(resolve, 40));
        return "medium";
      })
      .withFinalize(async (ctx, _prep) => {
        if (!ctx.winner) {
          ctx.winner = "medium";
        }
        ctx.completionOrder = [...(ctx.completionOrder || []), "medium"];
        return "medium_done" as NodeOutcome;
      });
    
    const slowNode = node.createAsync<AsyncContext>()
      .withPrepare(async (ctx) => ctx)
      .withExecuteLogic(async () => {
        await new Promise(resolve => setTimeout(resolve, 60));
        return "slow";
      })
      .withFinalize(async (ctx, _prep) => {
        if (!ctx.winner) {
          ctx.winner = "slow";
        }
        ctx.completionOrder = [...(ctx.completionOrder || []), "slow"];
        return "slow_done" as NodeOutcome;
      });
    
    // Test parallel race
    const context: AsyncContext = { completionOrder: [] };
    const parallelNodes = parallelAsync(fastNode, mediumNode, slowNode);
    const results = await parallelNodes.execute(context);
    
    // Define a special join that preserves race information
    const raceJoin = join.createAsync<AsyncContext>().withJoinFn(async (contexts) => {
      const winnerInfo = contexts.find(ctx => ctx.winner);
      const completionOrders = contexts
        .filter(ctx => ctx.completionOrder && ctx.completionOrder.length > 0)
        .map(ctx => ctx.completionOrder || [])
        .flat();
      
      const joinedContext: AsyncContext = {
        winner: winnerInfo?.winner,
        completionOrder: completionOrders
      };
      
      return joinedContext;
    });
    
    // Join results
    const joinedResult = await raceJoin.execute(results);
    
    // Verify expected winner and completion order
    expect(joinedResult.winner).toBe("fast");
    expect(joinedResult.completionOrder?.length).toBe(3);
    expect(joinedResult.completionOrder?.[0]).toBe("fast");
    expect(joinedResult.completionOrder?.[1]).toBe("medium");
    expect(joinedResult.completionOrder?.[2]).toBe("slow");
    
    // Test Promise.race implementation using executor
    const firstToCompleteContext: AsyncContext = {};
    const raceResult = await Promise.race([
      fastNode.execute(firstToCompleteContext),
      mediumNode.execute(firstToCompleteContext),
      slowNode.execute(firstToCompleteContext)
    ]);
    
    // Should have the winner property set to "fast"
    expect(raceResult.winner).toBe("fast");
    expect(raceResult.completionOrder).toEqual(["fast"]);
  });
}); 