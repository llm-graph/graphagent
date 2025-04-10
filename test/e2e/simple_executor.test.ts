import { expect, test, describe } from "bun:test"
import { node, executor } from "../../" 
import type { 
  Context,
  NodeOutcome
} from "../../"

// Define a simple context type
interface SimpleContext extends Context {
  value?: number;
  branch?: string;
  calculations?: number[];
  errors?: string[];
}

describe("Simple GraphExecutor Tests", () => {
  test("Simple graph execution", () => {
    // Create context
    const context: SimpleContext = {};
    
    // Create nodes with the new API
    const node1 = node.create<SimpleContext>()
      .withPrepare((ctx) => {
        console.log("node1.prepare called");
        return ctx;
      })
      .withExecuteLogic(() => {
        return "processed";
      })
      .withFinalize((ctx) => {
        console.log("node1.finalize called, ctx:", ctx);
        // Update context immutably
        ctx.value = 10;
        return "next";
      });
    
    const node2 = node.create<SimpleContext>()
      .withPrepare((ctx) => {
        console.log("node2.prepare called");
        return ctx;
      })
      .withExecuteLogic(() => {
        return "processed";
      })
      .withFinalize((ctx) => {
        console.log("node2.finalize called, ctx:", ctx);
        // Update context immutably
        ctx.value = (ctx.value || 0) + 5;
        return "done";
      });
    
    // Create executor for each node and chain them manually
    console.log("Before execution");
    
    // Execute node1
    const intermediateResult = executor.create().execute(node1, context);
    
    // Execute node2 with the result from node1
    const finalResult = executor.create().execute(node2, intermediateResult);
    
    console.log("After execution, result:", finalResult);
    
    // Check results
    expect(finalResult.value).toBe(15);
  });
  
  test("Conditional execution based on context value", () => {
    // Create initial contexts for different conditions
    const positiveContext: SimpleContext = { value: 10 };
    const negativeContext: SimpleContext = { value: -5 };
    const zeroContext: SimpleContext = { value: 0 };
    
    // Create conditional processor node
    const conditionalProcessor = node.create<SimpleContext, SimpleContext, { result: string; value: number }>()
      .withPrepare((ctx) => {
        // Prepare phase just passes the context through
        return ctx;
      })
      .withExecuteLogic((ctx) => {
        // Execute different logic based on value
        if ((ctx.value || 0) > 0) {
          return { result: "positive", value: ctx.value || 0 };
        } else if ((ctx.value || 0) < 0) {
          return { result: "negative", value: ctx.value || 0 };
        } else {
          return { result: "zero", value: 0 };
        }
      })
      .withFinalize((ctx, _prep, execResult) => {
        // Update context based on result
        ctx.branch = execResult.result;
        
        // Apply different transformations based on branch
        if (execResult.result === "positive") {
          ctx.value = (ctx.value || 0) * 2; // Double positive values
        } else if (execResult.result === "negative") {
          ctx.value = Math.abs(ctx.value || 0); // Convert negative to positive
        } else {
          ctx.value = 1; // Initialize zero values to 1
        }
        
        return execResult.result as NodeOutcome;
      });
    
    // Execute with positive context
    const positiveResult = executor.create().execute(conditionalProcessor, positiveContext);
    expect(positiveResult.branch).toBe("positive");
    expect(positiveResult.value).toBe(20); // 10 * 2
    
    // Execute with negative context
    const negativeResult = executor.create().execute(conditionalProcessor, negativeContext);
    expect(negativeResult.branch).toBe("negative");
    expect(negativeResult.value).toBe(5); // abs(-5)
    
    // Execute with zero context
    const zeroResult = executor.create().execute(conditionalProcessor, zeroContext);
    expect(zeroResult.branch).toBe("zero");
    expect(zeroResult.value).toBe(1); // Initialize to 1
  });
  
  test("Sequential execution with error handling", () => {
    // Create an initial context
    const initialContext: SimpleContext = { 
      value: 10,
      calculations: []
    };
    
    // Create a series of calculation nodes
    const doubleNode = node.create<SimpleContext, SimpleContext, { operation: string; value: number }>()
      .withPrepare((ctx) => ctx)
      .withExecuteLogic((ctx) => {
        const result = (ctx.value || 0) * 2;
        return { operation: "double", value: result };
      })
      .withFinalize((ctx, _prep, execResult) => {
        ctx.value = execResult.value;
        ctx.calculations = [...(ctx.calculations || []), execResult.value];
        return "doubled" as NodeOutcome;
      });
      
    const squareNode = node.create<SimpleContext, SimpleContext, { operation: string; value: number }>()
      .withPrepare((ctx) => ctx)
      .withExecuteLogic((ctx) => {
        // Check for potential overflow
        if ((ctx.value || 0) > 1000) {
          throw new Error("Value too large to square safely");
        }
        const result = (ctx.value || 0) ** 2;
        return { operation: "square", value: result };
      })
      .withFinalize((ctx, _prep, execResult) => {
        ctx.value = execResult.value;
        ctx.calculations = [...(ctx.calculations || []), execResult.value];
        return "squared" as NodeOutcome;
      });
    
    const divideByTwoNode = node.create<SimpleContext, SimpleContext, { operation: string; value: number }>()
      .withPrepare((ctx) => ctx)
      .withExecuteLogic((ctx) => {
        if ((ctx.value || 0) === 0) {
          throw new Error("Cannot divide by zero");
        }
        const result = (ctx.value || 0) / 2;
        return { operation: "divide", value: result };
      })
      .withFinalize((ctx, _prep, execResult) => {
        ctx.value = execResult.value;
        ctx.calculations = [...(ctx.calculations || []), execResult.value];
        return "divided" as NodeOutcome;
      });
    
    // Execute a successful calculation chain
    // 10 -> double -> 20 -> square -> 400 -> divide by 2 -> 200
    let result = executor.create().execute(doubleNode, JSON.parse(JSON.stringify(initialContext)));
    result = executor.create().execute(squareNode, result);
    result = executor.create().execute(divideByTwoNode, result);
    
    // Verify successful execution
    expect(result.value).toBe(200);
    expect(result.calculations).toEqual([20, 400, 200]);
    
    // Test error handling by creating a scenario where an error occurs
    // Start with a larger number that will cause the square operation to fail
    const largeContext: SimpleContext = { 
      value: 1001, 
      calculations: [],
      errors: []
    };
    
    try {
      // First double the value
      let errorResult = executor.create().execute(doubleNode, JSON.parse(JSON.stringify(largeContext)));
      // Then try to square it, which should throw an error
      errorResult = executor.create().execute(squareNode, errorResult);
      // Should not reach here
      expect(true).toBe(false); // Force failure if we get here
    } catch (error) {
      // Catch the error and verify it's what we expected
      const errorMessage = error instanceof Error ? error.message : String(error);
      expect(errorMessage).toBe("Value too large to square safely");
    }
    
    // Demonstrate recovery from error by using a modified chain
    // Create a context with errors array to track issues
    const recoveryContext: SimpleContext = {
      value: 1001,
      calculations: [],
      errors: []
    };
    
    // Execute double
    let recoveryResult = executor.create().execute(doubleNode, JSON.parse(JSON.stringify(recoveryContext)));
    
    // Try to execute square, but handle the error
    try {
      recoveryResult = executor.create().execute(squareNode, recoveryResult);
    } catch (error) {
      // Record the error but continue with a capped value
      recoveryResult.errors = [...(recoveryResult.errors || []), error instanceof Error ? error.message : String(error)];
      // Cap the value at 1000 to allow continued processing
      recoveryResult.value = 1000;
      recoveryResult.calculations = [...(recoveryResult.calculations || []), 1000];
    }
    
    // Continue with divide operation
    recoveryResult = executor.create().execute(divideByTwoNode, recoveryResult);
    
    // Verify recovery execution
    expect(recoveryResult.value).toBe(500); // 1000 / 2
    expect(recoveryResult.calculations).toEqual([2002, 1000, 500]);
    expect(recoveryResult.errors?.length).toBe(1);
    expect(recoveryResult.errors?.[0]).toBe("Value too large to square safely");
  });
}); 