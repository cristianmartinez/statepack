import {
  compileMachine,
  interpretWithSignals,
  validateMachine,
} from "@statepack/state-machine";
import type { Machine, SignalInterpreter } from "@statepack/state-machine";

let interpreter: SignalInterpreter | undefined;
let handling = false;
let transitioned = false;
let queue = Promise.resolve();
const snapshot = () => ({
  state: interpreter?.state.value,
  context: interpreter?.context ?? {},
  done: interpreter?.done.value ?? false,
});

self.onmessage = ({ data }) => {
  queue = queue.then(async () => {
    handling = true;
    transitioned = false;
    try {
      if (data.type === "init") {
        const validation = validateMachine(data.machine);
        if (!validation.valid)
          throw new Error(validation.errors.slice(0, 3).join("; "));
        const compiled = compileMachine(data.machine as Machine);
        interpreter?.stop();
        interpreter = interpretWithSignals(compiled, {
          onTransition: () => {
            transitioned = true;
            if (!handling)
              self.postMessage({ type: "update", snapshot: snapshot() });
          },
          execute: async (effect) => {
            self.postMessage({ type: "effect", action: effect });
          },
        });
        await interpreter.start();
      } else if (data.type === "send") {
        if (!interpreter) throw new Error("Apply a machine definition first.");
        await interpreter.send(data.event);
      }
      self.postMessage({
        type: "result",
        id: data.id,
        snapshot: snapshot(),
        transitioned,
      });
    } catch (error) {
      self.postMessage({
        type: "error",
        id: data.id,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      handling = false;
    }
  });
};
