import { 
  node, 
  executor, 
  retry,
  fork,
  join
} from './core';
import type { Context } from './types';

// Define a type for our numeric context
interface NumericContext extends Context {
  value?: number;
  result?: number;
  addition?: number;
  multiplication?: number;
  subtraction?: number;
  average?: number;
}

// Basic example - similar to the one in the README
const basicExample = () => {
  console.log("\n--- Basic Example ---");
  
  // Create nodes with pure function factories
  const numberNode = node.create<NumericContext, number, number>()
    .withPrepare(() => 5)
    .withExecuteLogic(value => value)
    .withFinalize((ctx, _, result) => {
      console.log(`numberNode result: ${result}`);
      ctx.value = result;
      return "number_set"; // Return a transition outcome
    });

  const addNode = node.create<NumericContext, number, number>()
    .withPrepare(ctx => ctx.value || 0)
    .withExecuteLogic(value => value + 3)
    .withFinalize((ctx, _, result) => {
      console.log(`addNode result: ${result}`);
      ctx.value = result;
      return "addition_done"; // Return a transition outcome
    });

  const multiplyNode = node.create<NumericContext, number, number>()
    .withPrepare(ctx => ctx.value || 0)
    .withExecuteLogic(value => value * 2)
    .withFinalize((ctx, _, result) => {
      console.log(`multiplyNode result: ${result}`);
      ctx.value = result;
      return "complete"; // Return a transition outcome
    });

  // Execute the nodes sequentially
  const initialContext: NumericContext = {};
  const exec = executor.create();
  
  let result = exec.execute(numberNode, initialContext);
  result = exec.execute(addNode, result);
  result = exec.execute(multiplyNode, result);
  
  console.log("Basic example result:", result.value); // Should be 16 = (5+3)*2
};

// Retry example
const retryExample = async () => {
  console.log("\n--- Retry Example ---");
  
  // Create a retry policy
  const retryPolicy = retry.policy(
    3,                // maxAttempts
    10,               // delayMs (small for quick testing)
    'exponential',    // backoff
    (error: Error) => error.message.includes('retry')  // retryPredicate
  );

  let attempts = 0;
  
  // Node that fails the first two times
  const unreliableNode = node.createAsync<NumericContext, number, { success: boolean, attempts: number }>()
    .withPrepare(ctx => ctx.value || 0)
    .withExecuteLogic(async () => {
      attempts++;
      console.log(`Retry attempt: ${attempts}`);
      
      if (attempts < 3) {
        throw new Error('Please retry this operation');
      }
      
      return { success: true, attempts };
    })
    .withFinalize((ctx, _, result) => {
      // Store the result in the context
      ctx.result = result as unknown as number;
      return "retry_complete"; // Return a transition outcome
    })
    .withRetry(retryPolicy);

  // Execute with retry
  const asyncExec = executor.createAsync();
  const result = await asyncExec.execute(unreliableNode, { value: 10 });
  console.log("Retry example result:", result);
};

// Fork/Join example
const forkJoinExample = () => {
  console.log("\n--- Fork/Join Example ---");
  
  // Create nodes for parallel processing
  const addFiveNode = node.create<NumericContext, number, number>()
    .withPrepare(ctx => ctx.value || 0)
    .withExecuteLogic(value => {
      const result = value + 5;
      console.log(`addFiveNode: ${value} + 5 = ${result}`);
      return result;
    })
    .withFinalize((ctx, _, result) => {
      // Store the result in the context
      ctx.result = result;
      return "add_done"; // Return a transition outcome
    });
  
  const multiplyByTwoNode = node.create<NumericContext, number, number>()
    .withPrepare(ctx => ctx.value || 0)
    .withExecuteLogic(value => {
      const result = value * 2;
      console.log(`multiplyByTwoNode: ${value} * 2 = ${result}`);
      return result;
    })
    .withFinalize((ctx, _, result) => {
      // Store the result in the context
      ctx.result = result;
      return "multiply_done"; // Return a transition outcome
    });
  
  const subtractOneNode = node.create<NumericContext, number, number>()
    .withPrepare(ctx => ctx.value || 0)
    .withExecuteLogic(value => {
      const result = value - 1;
      console.log(`subtractOneNode: ${value} - 1 = ${result}`);
      return result; 
    })
    .withFinalize((ctx, _, result) => {
      // Store the result in the context
      ctx.result = result;
      return "subtract_done"; // Return a transition outcome
    });
  
  // Create a fork to run operations in parallel
  const operations = fork.create(addFiveNode, multiplyByTwoNode, subtractOneNode);
  
  // Create a join function that combines results
  const combineResults = join.create<NumericContext>()
    .withJoinFn(contexts => {
      console.log("Join contexts:", contexts);
      
      // Check that we have valid contexts
      if (!contexts || contexts.length < 3) {
        return {} as NumericContext; // Return empty if not enough contexts
      }
      
      const result: NumericContext = {
        value: contexts[0].value, // Original value
        addition: contexts[0].result,
        multiplication: contexts[1].result,
        subtraction: contexts[2].result
      };
      
      // Calculate average
      if (
        typeof result.addition === 'number' && 
        typeof result.multiplication === 'number' && 
        typeof result.subtraction === 'number'
      ) {
        result.average = (result.addition + result.multiplication + result.subtraction) / 3;
      }
      
      return result;
    });
  
  // Run the example
  const initialContext: NumericContext = { value: 10 };
  const forkedResults = operations.execute(initialContext);
  const result = combineResults.execute(forkedResults);
  
  console.log("Fork/Join example result:", result);
  // { value: 10, addition: 15, multiplication: 20, subtraction: 9, average: 14.67 }
};

// Run all examples
const runExamples = async () => {
  console.log("=== Running Agent Graph Examples ===");
  
  basicExample();
  await retryExample();
  forkJoinExample();
  
  console.log("\n=== Examples Complete ===");
};

// Run the examples
runExamples().catch(console.error);

export { runExamples }; 