import { expect, test, describe } from "bun:test"

// Define our custom context type
interface SimpleContext {
  value?: number;
  paths?: string[];
  joinedValues?: number[];
}

// Create direct worker functions
const doubleValue = (ctx: SimpleContext): SimpleContext => {
  console.log("Double function called with:", ctx);
  return {
    value: (ctx.value || 0) * 2,
    paths: [...(ctx.paths || []), "double"]
  };
};

const squareValue = (ctx: SimpleContext): SimpleContext => {
  console.log("Square function called with:", ctx);
  return {
    value: (ctx.value || 0) ** 2,
    paths: [...(ctx.paths || []), "square"]
  };
};

const addFive = (ctx: SimpleContext): SimpleContext => {
  console.log("Add function called with:", ctx);
  return {
    value: (ctx.value || 0) + 5,
    paths: [...(ctx.paths || []), "add"]
  };
};

// Manual join function
const joinResults = (contexts: SimpleContext[]): SimpleContext => {
  const joinedContext: SimpleContext = {
    value: 0,
    paths: [],
    joinedValues: []
  };
  
  // Collect all values and paths
  contexts.forEach(ctx => {
    if (ctx.paths) {
      joinedContext.paths = [...(joinedContext.paths || []), ...(ctx.paths || [])];
    }
    
    if (ctx.value !== undefined) {
      joinedContext.joinedValues = [...(joinedContext.joinedValues || []), ctx.value];
    }
  });
  
  // Sum the values
  joinedContext.value = (joinedContext.joinedValues || []).reduce((sum, val) => sum + val, 0);
  
  return joinedContext;
};

describe("Manual Fork Join Tests", () => {
  test("Simple manual fork-join with pure functions", () => {
    console.log("Starting manual fork-join test");
    const initialContext: SimpleContext = { value: 10, paths: [] };
    
    // Process in parallel (simulated)
    console.log("Processing in parallel");
    const doubleResult = doubleValue({ ...initialContext });
    const squareResult = squareValue({ ...initialContext });
    const addResult = addFive({ ...initialContext });
    
    console.log("Double result:", doubleResult);
    console.log("Square result:", squareResult);
    console.log("Add result:", addResult);
    
    // Join results
    const joinedResult = joinResults([doubleResult, squareResult, addResult]);
    console.log("Joined result:", joinedResult);
    
    // Verify results
    expect(joinedResult.paths?.length).toBe(3);
    expect(joinedResult.paths).toContain("double");
    expect(joinedResult.paths).toContain("square");
    expect(joinedResult.paths).toContain("add");
    expect(joinedResult.joinedValues?.length).toBe(3);
    // Values should be: 20 (doubled), 100 (squared), 15 (added)
    expect(joinedResult.value).toBe(135);
    console.log("Manual fork-join test complete");
  });
}); 