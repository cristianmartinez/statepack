import type { TransformRegistry } from "../types";
import { arrayTransforms } from "./array";
import { booleanTransforms } from "./boolean";
import { formatTransforms } from "./format";
import { numberTransforms } from "./number";
import { objectTransforms } from "./object";
import { predicateTransforms } from "./predicate";
import { stringTransforms } from "./string";

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
