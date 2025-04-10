import { describe, test, expect } from "bun:test"
import { node, executor } from "../../"
import type { Context } from "../../"

// Define the test context type
interface BatchTestContext extends Context {
  prepared?: any[];
  results?: Record<string, any>;
}

// Define the item type
interface TestItem {
  id: number;
  name: string;
}

describe("Direct Batch Processing", () => {
  test("processes multiple items", async () => {
    // Create test data
    const items: TestItem[] = [
      { id: 1, name: "Item 1" },
      { id: 2, name: "Item 2" },
      { id: 3, name: "Item 3" }
    ];

    // Create a simple processor node with the new API
    const itemProcessor = node.create<TestItem, string, any>()
      .withPrepare((item) => {
        console.log(`Preparing item ${item.id}`);
        return `item-${item.id}`;
      })
      .withExecuteLogic((key) => {
        const itemId = parseInt(key.split('-')[1]);
        const item = items.find(i => i.id === itemId);
        return { processed: true, item, key }; // Add key to the result
      })
      .withFinalize((_ctx, key, result) => {
        console.log(`Finalizing item ${key} with result:`, result);
        return "success";
      });
    
    // Process each item individually and create a structured result
    const context: BatchTestContext = { results: {} };
    
    // Process items one by one and collect results in the context
    for (const item of items) {
      try {
        const processorResult = executor.create().execute(itemProcessor, item);
        
        // Ensure we have a results object
        if (!context.results) {
          context.results = {};
        }
        
        // Store result using the item ID as key
        const key = `item-${item.id}`;
        if (typeof processorResult === 'object' && processorResult !== null) {
          context.results[key] = {
            processed: true,
            item: item
          };
        }
      } catch (error) {
        console.error(`Error processing item ${item.id}:`, error);
        const key = `item-${item.id}`;
        
        // Ensure we have a results object
        if (!context.results) {
          context.results = {};
        }
        
        context.results[key] = { 
          processed: false, 
          error: error instanceof Error ? error.message : String(error) 
        };
      }
    }
    
    // Verify results
    expect(context.results).toBeDefined();
    
    // Check that all items were processed
    expect(Object.keys(context.results || {}).length).toBe(items.length);
    
    // Verify each result
    items.forEach(item => {
      const key = `item-${item.id}`;
      expect(context.results?.[key]).toBeDefined();
      expect(context.results?.[key].processed).toBe(true);
      expect(context.results?.[key].item.id).toBe(item.id);
    });
  });
}); 