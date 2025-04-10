import { expect, test, describe } from "bun:test"
import { 
  node,
  join
} from "../../"
import type { 
  Context,
  NodeOutcome
} from "../../"

// Define our context type
interface BattleContext extends Context {
  value?: number;
  paths?: string[];
  joinedValues?: number[];
  results?: string[];
  conditions?: string[];
  aggregate?: {
    sum?: number;
    average?: number;
    values?: number[];
    operationCount?: number;
  };
}

describe("Fork Join Tests", () => {
  test("Manual fork-join with complex state merging", () => {
    console.log("Starting manual fork-join test");
    const initialContext: BattleContext = { value: 10, paths: [] };
    
    // Create pure functions that return new contexts
    const doubleFn = (ctx: BattleContext): BattleContext => {
      console.log("Double function called with:", ctx);
      return {
        ...ctx,
        value: (ctx.value || 0) * 2,
        paths: [...(ctx.paths || []), "double"]
      };
    };
    
    const squareFn = (ctx: BattleContext): BattleContext => {
      console.log("Square function called with:", ctx);
      return {
        ...ctx,
        value: (ctx.value || 0) ** 2,
        paths: [...(ctx.paths || []), "square"]
      };
    };
    
    const addFn = (ctx: BattleContext): BattleContext => {
      console.log("Add function called with:", ctx);
      return {
        ...ctx,
        value: (ctx.value || 0) + 5,
        paths: [...(ctx.paths || []), "add"]
      };
    };
    
    console.log("Processing in parallel");
    const doubleResult = doubleFn({...initialContext, paths: [...initialContext.paths || []]});
    const squareResult = squareFn({...initialContext, paths: [...initialContext.paths || []]});
    const addResult = addFn({...initialContext, paths: [...initialContext.paths || []]});
    
    console.log("Double result:", doubleResult);
    console.log("Square result:", squareResult);
    console.log("Add result:", addResult);
    
    // Join the results with null checking
    const doubleValue = doubleResult.value || 0;
    const squareValue = squareResult.value || 0;
    const addValue = addResult.value || 0;
    
    const joinedResult: BattleContext = {
      value: doubleValue + squareValue + addValue,
      paths: [
        ...(doubleResult.paths || []),
        ...(squareResult.paths || []),
        ...(addResult.paths || [])
      ],
      joinedValues: [
        doubleValue,
        squareValue,
        addValue
      ]
    };
    
    console.log("Joined result:", joinedResult);
    
    // Verify results
    expect(joinedResult.paths?.length).toBe(3);
    expect(joinedResult.paths).toContain("double");
    expect(joinedResult.paths).toContain("square");
    expect(joinedResult.paths).toContain("add");
    expect(joinedResult.joinedValues?.length).toBe(3);
    expect(joinedResult.value).toBe(135);
    console.log("Manual fork-join test complete");
  });
  
  test("Conditional forking based on context value", () => {
    // Create initial context
    const initialContext: BattleContext = { 
      value: 10, 
      paths: [], 
      conditions: [] 
    };
    
    // Define operation nodes for different value ranges
    const smallValueNode = node.create<BattleContext, BattleContext, { operation: string; factor: number }>()
      .withPrepare((ctx) => ctx)
      .withExecuteLogic((ctx) => {
        if ((ctx.value || 0) <= 10) {
          return { operation: "small_value_operation", factor: 1.5 };
        }
        return { operation: "skip", factor: 0 };
      })
      .withFinalize((ctx, _prep, execResult) => {
        if (execResult.operation === "small_value_operation") {
          const newValue = (ctx.value || 0) * execResult.factor;
          ctx.value = newValue;
          ctx.paths = [...(ctx.paths || []), "small_value"];
          ctx.conditions = [...(ctx.conditions || []), "value <= 10"];
        }
        return "small_value_processed" as NodeOutcome;
      });
    
    const mediumValueNode = node.create<BattleContext, BattleContext, { operation: string; factor: number }>()
      .withPrepare((ctx) => ctx)
      .withExecuteLogic((ctx) => {
        if ((ctx.value || 0) > 10 && (ctx.value || 0) <= 50) {
          return { operation: "medium_value_operation", factor: 2 };
        }
        return { operation: "skip", factor: 0 };
      })
      .withFinalize((ctx, _prep, execResult) => {
        if (execResult.operation === "medium_value_operation") {
          const newValue = (ctx.value || 0) * execResult.factor;
          ctx.value = newValue;
          ctx.paths = [...(ctx.paths || []), "medium_value"];
          ctx.conditions = [...(ctx.conditions || []), "10 < value <= 50"];
        }
        return "medium_value_processed" as NodeOutcome;
      });
    
    const largeValueNode = node.create<BattleContext, BattleContext, { operation: string; factor: number }>()
      .withPrepare((ctx) => ctx)
      .withExecuteLogic((ctx) => {
        if ((ctx.value || 0) > 50) {
          return { operation: "large_value_operation", factor: 0.5 };
        }
        return { operation: "skip", factor: 0 };
      })
      .withFinalize((ctx, _prep, execResult) => {
        if (execResult.operation === "large_value_operation") {
          const newValue = (ctx.value || 0) * execResult.factor;
          ctx.value = newValue;
          ctx.paths = [...(ctx.paths || []), "large_value"];
          ctx.conditions = [...(ctx.conditions || []), "value > 50"];
        }
        return "large_value_processed" as NodeOutcome;
      });
    
    // Execute initial fork - each node gets a deep copy
    const createDeepCopy = <T>(obj: T): T => JSON.parse(JSON.stringify(obj));
    
    const smallResult = smallValueNode.execute(createDeepCopy(initialContext));
    const mediumResult = mediumValueNode.execute(createDeepCopy(initialContext));
    const largeResult = largeValueNode.execute(createDeepCopy(initialContext));
    
    // Verify initial results
    expect(smallResult.value).toBe(15); // 10 * 1.5
    expect(smallResult.paths).toContain("small_value");
    expect(smallResult.conditions).toContain("value <= 10");
    
    expect(mediumResult.value).toBe(10); // No change since condition not met
    expect(mediumResult.paths?.length).toBe(0);
    expect(mediumResult.conditions?.length).toBe(0);
    
    expect(largeResult.value).toBe(10); // No change since condition not met
    expect(largeResult.paths?.length).toBe(0);
    expect(largeResult.conditions?.length).toBe(0);
    
    // Test with a medium value
    const mediumContext: BattleContext = { value: 25, paths: [], conditions: [] };
    
    const mediumSmallResult = smallValueNode.execute(createDeepCopy(mediumContext));
    const mediumMediumResult = mediumValueNode.execute(createDeepCopy(mediumContext));
    const mediumLargeResult = largeValueNode.execute(createDeepCopy(mediumContext));
    
    // Verify medium results
    expect(mediumSmallResult.value).toBe(25); // No change
    expect(mediumSmallResult.paths?.length).toBe(0);
    
    expect(mediumMediumResult.value).toBe(50); // 25 * 2
    expect(mediumMediumResult.paths).toContain("medium_value");
    expect(mediumMediumResult.conditions).toContain("10 < value <= 50");
    
    expect(mediumLargeResult.value).toBe(25); // No change
    expect(mediumLargeResult.paths?.length).toBe(0);
    
    // Test with a large value
    const largeContext: BattleContext = { value: 100, paths: [], conditions: [] };
    
    const largeSmallResult = smallValueNode.execute(createDeepCopy(largeContext));
    const largeMediumResult = mediumValueNode.execute(createDeepCopy(largeContext));
    const largeLargeResult = largeValueNode.execute(createDeepCopy(largeContext));
    
    // Verify large results
    expect(largeSmallResult.value).toBe(100); // No change
    expect(largeSmallResult.paths?.length).toBe(0);
    
    expect(largeMediumResult.value).toBe(100); // No change
    expect(largeMediumResult.paths?.length).toBe(0);
    
    expect(largeLargeResult.value).toBe(50); // 100 * 0.5
    expect(largeLargeResult.paths).toContain("large_value");
    expect(largeLargeResult.conditions).toContain("value > 50");
    
    // Join all results manually using the fork and join utilities
    const customJoin = join.create<BattleContext>().withJoinFn((contexts) => {
      // Create a new joined context
      const joined: BattleContext = {
        paths: [],
        conditions: [],
        results: [],
        aggregate: {
          values: [],
          operationCount: 0
        }
      };
      
      // Collect all non-empty paths and conditions
      contexts.forEach(ctx => {
        if (ctx.paths && ctx.paths.length > 0) {
          joined.paths = [...(joined.paths || []), ...ctx.paths];
        }
        
        if (ctx.conditions && ctx.conditions.length > 0) {
          joined.conditions = [...(joined.conditions || []), ...ctx.conditions];
        }
        
        // Track which condition executed successfully
        if (ctx.value !== initialContext.value && 
            ctx.value !== mediumContext.value && 
            ctx.value !== largeContext.value) {
          joined.results = [...(joined.results || []), `Value ${ctx.value} processed`];
        }
      });
      
      return joined;
    });
    
    // Join the small value results
    const smallJoined = customJoin.execute([smallResult, mediumResult, largeResult]);
    expect(smallJoined.paths?.length).toBe(1);
    expect(smallJoined.paths).toContain("small_value");
    expect(smallJoined.conditions?.length).toBe(1);
    expect(smallJoined.results?.length).toBe(1);
    
    // Join the medium value results
    const mediumJoined = customJoin.execute([mediumSmallResult, mediumMediumResult, mediumLargeResult]);
    expect(mediumJoined.paths?.length).toBe(1);
    expect(mediumJoined.paths).toContain("medium_value");
    expect(mediumJoined.conditions?.length).toBe(1);
    expect(mediumJoined.results?.length).toBe(1);
    
    // Join the large value results
    const largeJoined = customJoin.execute([largeSmallResult, largeMediumResult, largeLargeResult]);
    expect(largeJoined.paths?.length).toBe(1);
    expect(largeJoined.paths).toContain("large_value");
    expect(largeJoined.conditions?.length).toBe(1);
    expect(largeJoined.results?.length).toBe(1);
  });
  
  test("Hierarchical fork-join with aggregation", () => {
    // Define initial context
    const initialContext: BattleContext = { 
      value: 10,
      aggregate: {
        values: []
      }
    };
    
    // Define leaf operation nodes
    const multiplyNode = node.create<BattleContext, BattleContext, { operation: string; value: number }>()
      .withPrepare((ctx) => ctx)
      .withExecuteLogic((ctx) => {
        return { operation: "multiply", value: (ctx.value || 0) * 2 };
      })
      .withFinalize((ctx, _prep, execResult) => {
        ctx.value = execResult.value;
        ctx.aggregate = {
          ...ctx.aggregate,
          values: [...(ctx.aggregate?.values || []), execResult.value],
          operationCount: (ctx.aggregate?.operationCount || 0) + 1
        };
        return "multiply_done" as NodeOutcome;
      });
    
    const squareNode = node.create<BattleContext, BattleContext, { operation: string; value: number }>()
      .withPrepare((ctx) => ctx)
      .withExecuteLogic((ctx) => {
        return { operation: "square", value: (ctx.value || 0) ** 2 };
      })
      .withFinalize((ctx, _prep, execResult) => {
        ctx.value = execResult.value;
        ctx.aggregate = {
          ...ctx.aggregate,
          values: [...(ctx.aggregate?.values || []), execResult.value],
          operationCount: (ctx.aggregate?.operationCount || 0) + 1
        };
        return "square_done" as NodeOutcome;
      });
    
    const addNode = node.create<BattleContext, BattleContext, { operation: string; value: number }>()
      .withPrepare((ctx) => ctx)
      .withExecuteLogic((ctx) => {
        return { operation: "add", value: (ctx.value || 0) + 5 };
      })
      .withFinalize((ctx, _prep, execResult) => {
        ctx.value = execResult.value;
        ctx.aggregate = {
          ...ctx.aggregate,
          values: [...(ctx.aggregate?.values || []), execResult.value],
          operationCount: (ctx.aggregate?.operationCount || 0) + 1
        };
        return "add_done" as NodeOutcome;
      });
    
    // Define composite nodes that perform multiple operations
    const mathCompositeNode = node.create<BattleContext, BattleContext, BattleContext>()
      .withPrepare((ctx) => ctx)
      .withExecuteLogic((ctx) => {
        // Create deep copies for each branch
        const createDeepCopy = <T>(obj: T): T => JSON.parse(JSON.stringify(obj));
        
        // Execute branches
        const multiplyResult = multiplyNode.execute(createDeepCopy(ctx));
        const squareResult = squareNode.execute(createDeepCopy(ctx));
        
        // Join the results
        const mathJoin = join.create<BattleContext>().withJoinFn((contexts) => {
          const joined: BattleContext = {
            aggregate: {
              values: [],
              operationCount: 0
            }
          };
          
          // Collect values and compute statistics
          const allValues: number[] = [];
          contexts.forEach(ctx => {
            if (ctx.aggregate?.values) {
              allValues.push(...ctx.aggregate.values);
            }
            
            if (joined.aggregate) {
              joined.aggregate = {
                ...joined.aggregate,
                operationCount: (joined.aggregate.operationCount || 0) + 
                               (ctx.aggregate?.operationCount || 0)
              };
            }
          });
          
          if (joined.aggregate) {
            joined.aggregate.values = allValues;
            
            // Compute statistics on the values
            if (allValues.length > 0) {
              const sum = allValues.reduce((total, val) => total + val, 0);
              joined.aggregate.sum = sum;
              joined.aggregate.average = sum / allValues.length;
            }
          }
          
          return joined;
        });
        
        // Join the math results
        return mathJoin.execute([multiplyResult, squareResult]);
      })
      .withFinalize((ctx, _prep, execResult) => {
        // Merge the aggregate data from the execution result
        ctx.aggregate = {
          ...ctx.aggregate,
          ...(execResult.aggregate || {}),
          values: [
            ...(ctx.aggregate?.values || []),
            ...(execResult.aggregate?.values || [])
          ],
          operationCount: (ctx.aggregate?.operationCount || 0) + 
                         (execResult.aggregate?.operationCount || 0)
        };
        
        return "math_composite_done" as NodeOutcome;
      });
    
    // Execute first level fork
    const mathResult = mathCompositeNode.execute(JSON.parse(JSON.stringify(initialContext)));
    const addResult = addNode.execute(JSON.parse(JSON.stringify(initialContext)));
    
    // Verify the individual results
    expect(mathResult.aggregate?.values?.length).toBe(2);
    expect(mathResult.aggregate?.operationCount).toBe(2);
    expect(mathResult.aggregate?.sum).toBe(120); // 20 + 100
    expect(mathResult.aggregate?.average).toBe(60); // (20 + 100) / 2
    
    expect(addResult.aggregate?.values?.length).toBe(1);
    expect(addResult.aggregate?.values?.[0]).toBe(15); // 10 + 5
    expect(addResult.aggregate?.operationCount).toBe(1);
    
    // Second level join
    const rootJoin = join.create<BattleContext>().withJoinFn((contexts) => {
      const joined: BattleContext = {
        aggregate: {
          values: [],
          operationCount: 0
        }
      };
      
      // Collect values and compute statistics across all operations
      const allValues: number[] = [];
      contexts.forEach(ctx => {
        if (ctx.aggregate?.values) {
          allValues.push(...ctx.aggregate.values);
        }
        
        if (joined.aggregate) {
          joined.aggregate = {
            ...joined.aggregate,
            operationCount: (joined.aggregate.operationCount || 0) + 
                           (ctx.aggregate?.operationCount || 0)
          };
        }
      });
      
      if (joined.aggregate) {
        joined.aggregate.values = allValues;
        
        // Compute statistics on the values
        if (allValues.length > 0) {
          const sum = allValues.reduce((total, val) => total + val, 0);
          joined.aggregate.sum = sum;
          joined.aggregate.average = sum / allValues.length;
        }
      }
      
      return joined;
    });
    
    // Join everything
    const finalResult = rootJoin.execute([mathResult, addResult]);
    
    // Verify final results
    expect(finalResult.aggregate?.values?.length).toBe(3);
    expect(finalResult.aggregate?.operationCount).toBe(3);
    expect(finalResult.aggregate?.sum).toBe(135); // 20 + 100 + 15
    expect(finalResult.aggregate?.average).toBe(45); // (20 + 100 + 15) / 3
  });
}); 