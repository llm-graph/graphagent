import { expect, test, describe } from "bun:test"
import { node } from "../../"
import type { 
  Context,
  Node
} from "../../"

// Define the test context type
interface TestContext extends Context {
  value?: number;
}

// Define an inline functional executor
class InlineFunctionalExecutor<T extends Context> {
  constructor(private entryNode: Node<T>) {}
  
  execute(context: T): T {
    console.log("InlineFunctionalExecutor.execute called with context:", context);
    
    // In the functional approach, we directly execute the entry node
    const result = this.entryNode.execute(context);
    console.log("Execution completed, result:", result);
    
    return result;
  }
}

describe("Direct Tests", () => {
  test("Inline functional execution", () => {
    // Create context
    const context: TestContext = {};
    console.log("Initial context:", context);
    
    // Create nodes with the new API
    const node1 = node.create<TestContext>()
      .withPrepare((ctx) => {
        console.log("node1.prepare called", ctx);
        return ctx;
      })
      .withExecuteLogic((ctx) => {
        return ctx;
      })
      .withFinalize((ctx) => {
        console.log("node1.finalize called", ctx);
        ctx.value = 10;
        console.log("after node1.finalize:", ctx);
        return "next";
      });
    
    const node2 = node.create<TestContext>()
      .withPrepare((ctx) => {
        console.log("node2.prepare called", ctx);
        return ctx;
      })
      .withExecuteLogic((ctx) => {
        return ctx;
      })
      .withFinalize((ctx) => {
        console.log("node2.finalize called", ctx);
        ctx.value = (ctx.value || 0) + 5;
        console.log("after node2.finalize:", ctx);
        return "done";
      });
    
    // Create executors for each node
    const executor1 = new InlineFunctionalExecutor(node1);
    const executor2 = new InlineFunctionalExecutor(node2);
    
    // Execute nodes sequentially
    console.log("Before execution");
    const intermediateResult = executor1.execute(context);
    console.log("After node1 execution, result:", intermediateResult);
    
    const finalResult = executor2.execute(intermediateResult);
    console.log("After node2 execution, result:", finalResult);
    
    // Check results
    expect(finalResult.value).toBe(15);
  });

  test("Process complex data transformation with validation", () => {
    // Define data types
    interface RawUserData {
      id: string;
      name?: string;
      email?: string;
      preferences?: {
        theme?: string;
        notifications?: boolean;
      };
      lastLogin?: string;
    }

    interface ValidatedUserData {
      id: string;
      name: string;
      email: string;
      preferences: {
        theme: string;
        notifications: boolean;
      };
      lastLoginDate: Date | null;
      isValid: boolean;
      validationErrors: string[];
    }

    // Create a validation and transformation node
    const validateAndTransform = node.create<TestContext & RawUserData, RawUserData, ValidatedUserData>()
      .withPrepare((ctx: TestContext & RawUserData) => {
        // Simply return the input context as the prepare result
        return ctx;
      })
      .withExecuteLogic((ctx: RawUserData) => {
        // Initialize result with default values
        const result: ValidatedUserData = {
          id: ctx.id,
          name: ctx.name || "",
          email: ctx.email || "",
          preferences: {
            theme: ctx.preferences?.theme || "default",
            notifications: ctx.preferences?.notifications ?? true
          },
          lastLoginDate: ctx.lastLogin ? new Date(ctx.lastLogin) : null,
          isValid: true,
          validationErrors: []
        };

        // Validate required fields and format
        if (!ctx.id || ctx.id.trim() === "") {
          result.validationErrors.push("ID is required");
          result.isValid = false;
        }

        if (!ctx.name || ctx.name.trim() === "") {
          result.validationErrors.push("Name is required");
          result.isValid = false;
        }

        if (!ctx.email) {
          result.validationErrors.push("Email is required");
          result.isValid = false;
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ctx.email)) {
          result.validationErrors.push("Email format is invalid");
          result.isValid = false;
        }

        if (ctx.lastLogin && isNaN(new Date(ctx.lastLogin).getTime())) {
          result.validationErrors.push("Last login date is invalid");
          result.isValid = false;
        }

        // Return the result
        return result;
      })
      .withFinalize((ctx: TestContext & RawUserData, _prepResult: RawUserData, executeResult: ValidatedUserData) => {
        // Store the validation result directly in the context
        (ctx as any).result = executeResult;
        
        return "validated";
      });

    // Create executor
    const executor1 = new InlineFunctionalExecutor(validateAndTransform);

    // Test with valid data
    const validContext: TestContext & RawUserData = {
      id: "user123",
      name: "Alice Smith",
      email: "alice@example.com",
      preferences: {
        theme: "dark",
        notifications: true
      },
      lastLogin: "2023-05-15T14:30:00Z"
    };

    const validResult = executor1.execute(validContext);
    expect(validResult.result.isValid).toBe(true);
    expect(validResult.result.validationErrors).toHaveLength(0);
    expect(validResult.result.name).toBe("Alice Smith");
    expect(validResult.result.preferences.theme).toBe("dark");
    expect(validResult.result.lastLoginDate).toBeInstanceOf(Date);

    // Test with invalid data
    const invalidContext: TestContext & RawUserData = {
      id: "user456",
      email: "invalid-email",
      lastLogin: "not-a-date"
    };

    const invalidResult = executor1.execute(invalidContext);
    expect(invalidResult.result.isValid).toBe(false);
    expect(invalidResult.result.validationErrors).toContain("Name is required");
    expect(invalidResult.result.validationErrors).toContain("Email format is invalid");
    expect(invalidResult.result.validationErrors).toContain("Last login date is invalid");
    expect(invalidResult.result.name).toBe("");
    expect(invalidResult.result.preferences.theme).toBe("default");
    expect(invalidResult.result.preferences.notifications).toBe(true);
  });
}); 