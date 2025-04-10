import { expect, test, describe } from "bun:test"
import { node, executor } from "../../"
import type { Context, Node } from "../../"

// Define a simple context type
interface SimpleContext extends Context {
  current?: number;
  outcome?: string;
}

// Utility function to create a node with logging
const createLoggingNode = (name: string, logic: (ctx: SimpleContext) => SimpleContext): Node<SimpleContext> => {
  return node.create<SimpleContext>()
    .withPrepare((ctx) => {
      console.log(`[TEST] ${name}.prepare called with`, ctx);
      return ctx;
    })
    .withExecuteLogic((ctx) => {
      console.log(`[TEST] ${name}.execute called with`, ctx);
      return ctx;
    })
    .withFinalize((ctx) => {
      // Apply the changes from logic function to the context
      const newCtx = logic(ctx);
      console.log(`[TEST] ${name}.finalize called`);
      
      // Copy all properties from newCtx to the original context
      Object.keys(newCtx).forEach(key => {
        (ctx as any)[key] = (newCtx as any)[key];
      });
      
      return newCtx.outcome || "next";
    });
};

// Basic Flow Tests

describe("Basic Flow Tests", () => {
  test("Single node execution", () => {
    const context: SimpleContext = {};
    const numberToSet = 5;

    const numberNode = createLoggingNode("SingleNumberNode", (ctx) => ({ ...ctx, current: numberToSet }));

    const result = executor.create().execute(numberNode, context);

    expect(result.current).toBe(numberToSet);
  });

  test("Linear sequence graph execution", () => {
    const context: SimpleContext = {};
    const numberToSet = 5;
    const numberToAdd = 3;
    const numberToMultiply = 2;

    const numberNode = createLoggingNode("NumberNode", (ctx) => ({ ...ctx, current: numberToSet }));
    const addNode = createLoggingNode("AddNode", (ctx) => ({ ...ctx, current: (ctx.current || 0) + numberToAdd }));
    const multiplyNode = createLoggingNode("MultiplyNode", (ctx) => ({ ...ctx, current: (ctx.current || 0) * numberToMultiply }));

    // Execute nodes sequentially instead of using pipe
    let result = executor.create().execute(numberNode, context);
    result = executor.create().execute(addNode, result);
    result = executor.create().execute(multiplyNode, result);

    expect(result.current).toBe(16); // (5 + 3) * 2 = 16
  });

  test("Conditional branching", () => {
    const context: SimpleContext = {};

    const numberNode = createLoggingNode("NumberNode", (ctx) => ({ ...ctx, current: 10 }));
    const checkPositiveNode = createLoggingNode("CheckPositiveNode", (ctx) => {
      if ((ctx.current || 0) >= 0) {
        console.log("[TEST] Positive number detected");
        return { ...ctx, outcome: "positive" };
      } else {
        console.log("[TEST] Negative number detected");
        return { ...ctx, outcome: "negative" };
      }
    });

    // Execute nodes sequentially
    let result = executor.create().execute(numberNode, context);
    result = executor.create().execute(checkPositiveNode, result);

    expect(result.outcome).toBe("positive");
  });
});