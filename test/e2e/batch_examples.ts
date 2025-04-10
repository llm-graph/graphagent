import { expect, test, describe } from "bun:test";
import { node, batch } from "../../";
import type { Context } from "../../";

// Simple batch processing examples
describe("Batch Examples", () => {
  // Define types
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

  // Basic batch processing test
  test("Basic batch processing", () => {
    // Create a processor for items
    const processor = node.create<SimpleItem, unknown, ProcessedItem>()
      .withPrepare(item => item)
      .withExecuteLogic(prepareResult => {
        const item = prepareResult as SimpleItem;
        return {
          id: item.id,
          result: item.value * 2
        };
      })
      .withFinalize(() => "processed");
    
    const extractItemsFromContext = (ctx: BatchContext): SimpleItem[] => 
      ctx.items || [];
    
    // Create batch processor
    const batchProcessor = batch.create<BatchContext, SimpleItem, ProcessedItem>(processor)
      .withItemsSelector(extractItemsFromContext);
    
    // Set up test items
    const testItems: SimpleItem[] = [
      { id: "1", value: 10 },
      { id: "2", value: 20 },
      { id: "3", value: 30 },
    ];
    
    const context: BatchContext = { items: testItems };
    
    // Execute batch processing
    const result = batchProcessor.execute(context);
    
    // Verify results
    expect(result.results).toBeDefined();
    expect(result.results?.length).toBe(3);
    
    // Verify each result
    const firstResult = result.results?.[0];
    expect(firstResult?.id).toBe("1");
    expect(firstResult?.result).toBe(20);
    
    const lastResult = result.results?.[2];
    expect(lastResult?.id).toBe("3");
    expect(lastResult?.result).toBe(60);
  });
  
  // Batch processing with filtering
  test("Batch processing with filtering", () => {
    // Create processor that filters out odd values
    const processor = node.create<SimpleItem, unknown, ProcessedItem | null>()
      .withPrepare(item => item)
      .withExecuteLogic(prepareResult => {
        const item = prepareResult as SimpleItem;
        if (item.value % 2 === 0) {
          return {
            id: item.id,
            result: item.value * 2
          };
        }
        return null;
      })
      .withFinalize(() => "processed");
    
    const extractItemsFromContext = (ctx: BatchContext): SimpleItem[] => 
      ctx.items || [];
    
    // Create batch processor with custom results collector
    const batchProcessor = batch.create<BatchContext, SimpleItem, ProcessedItem | null>(processor)
      .withItemsSelector(extractItemsFromContext)
      .withResultsCollector((ctx, results) => {
        const validResults = results.filter((result): result is ProcessedItem => result !== null);
        return {
          ...ctx,
          results: validResults
        };
      });
    
    // Set up test items (mix of even and odd values)
    const testItems: SimpleItem[] = [
      { id: "1", value: 11 }, // odd - will be filtered
      { id: "2", value: 20 }, // even
      { id: "3", value: 33 }, // odd - will be filtered
      { id: "4", value: 42 }, // even
    ];
    
    const context: BatchContext = { items: testItems };
    
    // Execute batch processing
    const result = batchProcessor.execute(context);
    
    // Verify results
    expect(result.results).toBeDefined();
    expect(result.results?.length).toBe(2);
    
    // Verify that only even values were processed
    const ids = result.results?.map((item: ProcessedItem) => item.id);
    expect(ids).toContain("2");
    expect(ids).toContain("4");
    expect(ids).not.toContain("1");
    expect(ids).not.toContain("3");
  });
  
  // Batch processing with error handling
  test("Batch processing with error handling", () => {
    // Create raw processor function that throws errors for certain inputs
    const processItem = (item: SimpleItem): ProcessedItem => {
      if (item.value === 0) {
        throw new Error("Cannot process item with zero value");
      }
      
      return {
        id: item.id,
        result: item.value * 2
      };
    };
    
    // Process a batch of items with manual error handling
    const processBatchWithErrorHandling = (items: SimpleItem[]): {
      successful: ProcessedItem[];
      failed: string[];
    } => {
      const successful: ProcessedItem[] = [];
      const failed: string[] = [];
      
      for (const item of items) {
        try {
          const result = processItem(item);
          successful.push(result);
        } catch (error) {
          failed.push(item.id);
        }
      }
      
      return { successful, failed };
    };
    
    // Set up test items (including one that will cause an error)
    const testItems: SimpleItem[] = [
      { id: "1", value: 10 },
      { id: "2", value: 0 },  // Will cause error
      { id: "3", value: 30 },
    ];
    
    // Process items
    const results = processBatchWithErrorHandling(testItems);
    
    // Verify successful items
    expect(results.successful.length).toBe(2);
    expect(results.successful[0].id).toBe("1");
    expect(results.successful[0].result).toBe(20);
    expect(results.successful[1].id).toBe("3");
    expect(results.successful[1].result).toBe(60);
    
    // Verify failed items
    expect(results.failed.length).toBe(1);
    expect(results.failed[0]).toBe("2");
  });
}); 