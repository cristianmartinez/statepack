import type { TransformRegistry } from "../types";

/**
 * Utility transforms for common operations
 */
export const utilityTransforms: TransformRegistry = {
  /**
   * Get current timestamp in milliseconds
   * Usage: '' | now
   * Returns: number (current timestamp)
   */
  now: () => Date.now(),

  /**
   * Generate unique ID based on timestamp
   * Usage: '' | id
   * Returns: string (timestamp-based ID)
   */
  id: () => Date.now().toString(),

  /**
   * Generate random UUID-like string
   * Usage: '' | uuid
   * Returns: string (random ID)
   */
  uuid: () => {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  },
};
