import type { TransformRegistry } from "../types";
import { stringTransforms } from "./string";
import { numberTransforms } from "./number";
import { formatTransforms } from "./format";
import { arrayTransforms } from "./array";
import { objectTransforms } from "./object";
import { booleanTransforms } from "./boolean";
import { predicateTransforms } from "./predicate";

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
