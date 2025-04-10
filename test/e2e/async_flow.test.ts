import { expect, test, describe } from "bun:test"
import { 
  node,
  executor,
  retry
} from "../../"
import type { 
  Context
} from "../../types"

// Define a simple context type
interface SimpleContext extends Context {
  current?: number;
  results?: Record<string, unknown>;
  result?: unknown;
}

describe("Async Flow Tests", () => {
  test("Single async node execution", async () => {
    const context: SimpleContext = {};
    const numberToSet = 5;
    
    const numberNode = node.createAsync<SimpleContext, number, number>()
      .withPrepare(async () => numberToSet)
      .withExecuteLogic(async (value) => {
        console.log("[TEST] AsyncNumberNode.executeLogic called with", value);
        return value;
      })
      .withFinalize(async (ctx, value) => {
        console.log("[TEST] AsyncNumberNode.finalize called");
        // Update context immutably via return
        ctx.current = value;
        return "number_set";
      });
    
    const result = await executor.createAsync().execute(numberNode, context);
    
    expect(result.current).toBe(numberToSet);
  });
  
  test("Linear sequence async graph execution", async () => {
    const context: SimpleContext = {};
    const numberToSet = 5;
    const numberToAdd = 3;
    const numberToMultiply = 2;
    
    // Number Node
    const numberNode = node.createAsync<SimpleContext, number, number>()
      .withPrepare(async () => numberToSet)
      .withExecuteLogic(async (value) => value)
      .withFinalize(async (ctx, value) => {
        console.log("[TEST] AsyncNumberNode.finalize called");
        ctx.current = value;
        return "number_set";
      });
    
    // Add Node
    const addNode = node.createAsync<SimpleContext, number, number>()
      .withPrepare(async (ctx) => (ctx.current || 0) + numberToAdd)
      .withExecuteLogic(async (value) => value)
      .withFinalize(async (ctx, value) => {
        console.log("[TEST] AsyncAddNode.finalize called");
        ctx.current = value;
        return "addition_done";
      });
    
    // Multiply Node
    const multiplyNode = node.createAsync<SimpleContext, number, number>()
      .withPrepare(async (ctx) => (ctx.current || 0) * numberToMultiply)
      .withExecuteLogic(async (value) => value)
      .withFinalize(async (ctx, value) => {
        console.log("[TEST] AsyncMultiplyNode.finalize called");
        ctx.current = value;
        return "multiplication_done";
      });
    
    // Execute nodes sequentially
    console.log("[TEST] Before async execution, context =", JSON.stringify(context));
    let result = context;
    
    // Manual execution of the pipeline
    result = await executor.createAsync().execute(numberNode, result);
    result = await executor.createAsync().execute(addNode, result);
    result = await executor.createAsync().execute(multiplyNode, result);
    
    console.log("[TEST] After async execution, context =", JSON.stringify(result));
    
    // Verify results: (5 + 3) * 2 = 16
    expect(result.current).toBe(16);
  });
  
  test("Async with retry", async () => {
    const context: SimpleContext = {};
    let attempts = 0;
    
    // Create a node that fails initially but succeeds after retries
    const unreliableNode = node.createAsync<SimpleContext, number, string>()
      .withPrepare(async () => 10)
      .withExecuteLogic(async (value) => {
        attempts++;
        console.log(`[TEST] Attempt ${attempts} with value ${value}`);
        
        if (attempts < 3) {
          throw new Error("Simulated failure for retry testing");
        }
        
        return `Processed ${value} successfully after ${attempts} attempts`;
      })
      .withFinalize(async (ctx, _value, result) => {
        console.log("[TEST] Finalize called with result:", result);
        ctx.result = result;
        return "done";
      })
      .withRetry(retry.policy(3, 10)); // 3 attempts, 10ms delay
    
    // Execute with retry
    const result = await executor.createAsync().execute(unreliableNode, context);
    
    // Check the results
    expect(attempts).toBe(3); // Should have attempted 3 times
    expect(result.result).toContain("Processed 10 successfully after 3 attempts");
  });
}); 