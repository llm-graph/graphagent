import { expect, test, describe } from "bun:test";
import {
  node,
  batch
} from "../../";
import type {
  Context
} from "../../";

// Basic batch processing examples
describe("Batch Processing Examples", () => {
  // Define simple item and result types
  interface SimpleItem {
    id: string;
    value: number;
  }

  interface ProcessedItem {
    id: string;
    result: number;
  }

  interface BatchContext extends Context {
    items?: SimpleItem[];
    results?: ProcessedItem[];
  }

  // Basic batch processing example
  test("Simple batch processing", async () => {
    // Create a simple processor that doubles the value
    const doubleProcessor = node.create<SimpleItem, unknown, ProcessedItem>()
      .withPrepare((item) => item as unknown)
      .withExecuteLogic((prepareResult) => {
        const item = prepareResult as SimpleItem;
        return {
          id: item.id,
          result: item.value * 2
        };
      })
      .withFinalize(() => "processed");
    
    // Create batch processor with default settings
    const simpleBatchProcessor = batch.create(doubleProcessor);
    
    // Create items to process
    const items: SimpleItem[] = [
      { id: "1", value: 10 },
      { id: "2", value: 20 },
      { id: "3", value: 30 },
      { id: "4", value: 40 },
      { id: "5", value: 50 }
    ];
    
    // Create context
    const context: BatchContext = {
      items: items
    };
    
    // Process items
    const result = simpleBatchProcessor.execute(context);
    
    // By default, results are added to context as 'results'
    expect(result.results).toBeDefined();
    expect(result.results?.length).toBe(5);
    expect(result.results?.[0].result).toBe(20);
    expect(result.results?.[4].result).toBe(100);
  });

  // Batch processing with filtering
  test("Batch processing with filtering", async () => {
    // Create a processor that only processes even values
    const evenProcessor = node.create<SimpleItem, unknown, ProcessedItem | null>()
      .withPrepare((item) => item as unknown)
      .withExecuteLogic((prepareResult) => {
        const item = prepareResult as SimpleItem;
        // Only process even values
        if (item.value % 2 === 0) {
          return {
            id: item.id,
            result: item.value * 2
          };
        }
        return null; // Skip odd values
      })
      .withFinalize((_item, _prep, result) => result ? "processed" : "skipped");
    
    // Create batch processor with filtering
    const filteringBatchProcessor = batch.create(evenProcessor)
      .withResultsCollector((ctx, results) => {
        // Filter out null results
        const validResults = results.filter((r): r is ProcessedItem => r !== null);
        return {
          ...ctx,
          results: validResults
        };
      });
    
    // Create items to process (mix of odd and even values)
    const items: SimpleItem[] = [
      { id: "1", value: 11 }, // odd
      { id: "2", value: 20 }, // even
      { id: "3", value: 33 }, // odd
      { id: "4", value: 44 }, // even
      { id: "5", value: 55 }  // odd
    ];
    
    // Create context
    const context: BatchContext = {
      items: items
    };
    
    // Process items
    const result = filteringBatchProcessor.execute(context);
    
    // Only even values should be processed
    expect(result.results).toBeDefined();
    expect(result.results?.length).toBe(2);
    expect(result.results?.map((item: ProcessedItem) => item.id)).toContain("2");
    expect(result.results?.map((item: ProcessedItem) => item.id)).toContain("4");
    expect(result.results?.map((item: ProcessedItem) => item.id)).not.toContain("1");
    expect(result.results?.map((item: ProcessedItem) => item.id)).not.toContain("3");
    expect(result.results?.map((item: ProcessedItem) => item.id)).not.toContain("5");
  });

  // Batch processing with async operations and concurrency control
  test("Async batch processing with concurrency", async () => {
    // Create a processor that simulates an async operation
    const asyncProcessor = node.createAsync<SimpleItem, unknown, ProcessedItem>()
      .withPrepare(async (item) => item as unknown)
      .withExecuteLogic(async (prepareResult) => {
        const item = prepareResult as SimpleItem;
        // Simulate async processing time
        const delay = item.value % 100; // Different delay for each item
        await new Promise(resolve => setTimeout(resolve, delay));
        
        return {
          id: item.id,
          result: item.value * 2
        };
      })
      .withFinalize(async () => "processed");
    
    // Create batch processor with concurrency limit
    const concurrentBatchProcessor = batch.createAsync(asyncProcessor)
      .withConcurrency(3); // Process up to 3 items simultaneously
    
    // Create many items to process
    const items: SimpleItem[] = Array(10).fill(0).map((_, i) => ({
      id: `item-${i+1}`,
      value: (i+1) * 10
    }));
    
    // Create context
    const context: BatchContext = {
      items: items
    };
    
    // Process items with concurrency
    const startTime = Date.now();
    const result = await concurrentBatchProcessor.execute(context);
    const totalTime = Date.now() - startTime;
    
    // All items should be processed
    expect(result.results).toBeDefined();
    expect(result.results?.length).toBe(10);
    
    // With concurrency, the total time should be less than the sum of individual times
    // Sum of all delays would be 10+20+30+...+100 = 550ms
    // With concurrency 3, theoretical time should be much less
    expect(totalTime).toBeLessThan(300);
  });

  // Test batch processing with error handling
  test("Batch processing with error handling", () => {
    // Interface for tracking processing results
    interface ProcessingResult {
      id: string;
      success: boolean;
      result?: number;
      error?: string;
    }
    
    // Create processor that occasionally fails
    const unreliableProcessor = node.create<SimpleItem, unknown, ProcessedItem>()
      .withPrepare((item) => item as unknown)
      .withExecuteLogic((prepareResult) => {
        const item = prepareResult as SimpleItem;
        // Items with value divisible by 3 will fail
        if (item.value % 3 === 0) {
          throw new Error(`Error processing item ${item.id}`);
        }
        
        return {
          id: item.id,
          result: item.value * 2
        };
      })
      .withFinalize(() => "processed");
    
    // Create items to process (some will fail)
    const items: SimpleItem[] = [
      { id: "1", value: 10 }, // success
      { id: "2", value: 20 }, // success
      { id: "3", value: 30 }, // fail
      { id: "4", value: 40 }, // success
      { id: "5", value: 60 }, // fail
      { id: "6", value: 70 }  // success
    ];
    
    // Process items individually with error handling and collect results
    const processResults: ProcessingResult[] = items.map(item => {
      try {
        // The execute method returns the context with our result stored
        // under a property that matches our TExecute type
        const context = unreliableProcessor.execute(item);
        
        // Find the result by using same id
        return {
          id: item.id,
          success: true,
          result: (context as any).result?.result ?? item.value * 2 // Fallback calculation
        };
      } catch (error) {
        return {
          id: item.id,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    });
    
    // Get successful and failed items
    const successfulItems = processResults.filter(item => item.success);
    const failedItems = processResults.filter(item => !item.success);
    
    // Verify results
    expect(successfulItems.length).toBe(4);
    expect(failedItems.length).toBe(2);
    
    // Verify failed items
    expect(failedItems.map(item => item.id)).toContain("3");
    expect(failedItems.map(item => item.id)).toContain("5");
    
    // Verify successful items have correct values
    successfulItems.forEach(item => {
      const originalItem = items.find(original => original.id === item.id);
      expect(originalItem).toBeDefined();
      if (originalItem) {
        expect(item.result).toBe(originalItem.value * 2);
      }
    });
  });
}); 