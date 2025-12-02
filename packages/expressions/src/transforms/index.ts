import type { TransformRegistry } from "../types.ts";
import { stringTransforms } from "./string.ts";
import { numberTransforms } from "./number.ts";
import { formatTransforms } from "./format.ts";
import { arrayTransforms } from "./array.ts";
import { objectTransforms } from "./object.ts";
import { booleanTransforms } from "./boolean.ts";
import { predicateTransforms } from "./predicate.ts";

/**
 * All built-in transforms
 */
export const builtinTransforms: TransformRegistry = {
  ...stringTransforms,
  ...numberTransforms,
  ...formatTransforms,
  ...arrayTransforms,
  ...objectTransforms,
  ...booleanTransforms,
  ...predicateTransforms,
};

export {
  stringTransforms,
  numberTransforms,
  formatTransforms,
  arrayTransforms,
  objectTransforms,
  booleanTransforms,
  predicateTransforms,
};
