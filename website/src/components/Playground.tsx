import { useEffect, useRef, useState } from "react";
import type { Machine } from "@statepack/state-machine";
import { activeEvents, examples, stateLabel } from "../lib/examples";
import StateDiagram from "./StateDiagram";
import JsonHighlight from "./JsonHighlight";

type Snapshot = {
  state: unknown;
  context: Record<string, unknown>;
  done: boolean;
};
type LogEntry = {
  id: number;
  time: string;
  event: string;
  detail: string;
  kind?: string;
};
type Pending = {
  id: number;
  timer: ReturnType<typeof setTimeout>;
  resolve: (response: { snapshot: Snapshot; transitioned: boolean }) => void;
  reject: (error: Error) => void;
};

const initial = examples.toggle!.machine;
const initialText = JSON.stringify(initial, null, 2);

export default function Playground() {
  const [example, setExample] = useState("toggle");
  const [draft, setDraft] = useState(initialText);
  const [machine, setMachine] = useState<Machine>(initial);
  const [snapshot, setSnapshot] = useState<Snapshot>({
    state: initial.initial,
    context: {},
    done: false,
  });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [busy, setBusy] = useState(true);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("Starting runtime…");
  const [error, setError] = useState(false);
  const [toast, setToast] = useState("");
  const [payload, setPayload] = useState("");
  const [scrollTop, setScrollTop] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const worker = useRef<Worker | null>(null);
  const pending = useRef<Pending | null>(null);
  const requestId = useRef(0);
  const logId = useRef(0);
  const generation = useRef(0);
  const started = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const editor = useRef<HTMLTextAreaElement | null>(null);

  function addLog(event: string, detail: string, kind?: string) {
    const time = Math.max(0, performance.now() - started.current);
    const entry = {
      id: ++logId.current,
      time: `+${(time / 1000).toFixed(2)}s`,
      event,
      detail,
      kind,
    };
    setLogs((previous) => [entry, ...previous].slice(0, 80));
  }
  function notify(message: string) {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2200);
  }
  function request(type: string, data: object) {
    return new Promise<{ snapshot: Snapshot; transitioned: boolean }>(
      (resolve, reject) => {
        const id = ++requestId.current;
        const timer = setTimeout(
          () => {
            worker.current?.terminate();
            worker.current = null;
            pending.current = null;
            setReady(false);
            reject(
              new Error(
                "Execution timed out. Check the definition, then apply it again.",
              ),
            );
          },
          type === "init" ? 12000 : 4000,
        );
        pending.current = { id, resolve, reject, timer };
        worker.current?.postMessage({ id, type, ...data });
      },
    );
  }
  async function loadMachine(
    candidate: Machine,
    message = "Definition applied",
  ) {
    const currentGeneration = ++generation.current;
    if (pending.current) {
      clearTimeout(pending.current.timer);
      pending.current.reject(new Error("Runtime replaced"));
      pending.current = null;
    }
    worker.current?.terminate();
    setReady(false);
    setBusy(true);
    setError(false);
    setStatus("Compiling definition…");
    started.current = performance.now();
    setLogs([]);
    try {
      const nextWorker = new Worker(
        new URL("../lib/runtime.worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.current = nextWorker;
      nextWorker.onmessage = ({ data }) => {
        if (currentGeneration !== generation.current) return;
        if (data.type === "update") {
          setSnapshot(data.snapshot);
          addLog("INTERNAL", `→ ${stateLabel(data.snapshot.state)}`);
          return;
        }
        if (data.type === "effect") {
          addLog(
            "EFFECT",
            `${data.action?.type ?? "external"} · host callback required`,
          );
          return;
        }
        const waiting = pending.current;
        if (!waiting || waiting.id !== data.id) return;
        clearTimeout(waiting.timer);
        pending.current = null;
        if (data.type === "error") waiting.reject(new Error(data.message));
        else waiting.resolve(data);
      };
      nextWorker.onerror = () => {
        const waiting = pending.current;
        if (waiting) {
          clearTimeout(waiting.timer);
          pending.current = null;
          waiting.reject(
            new Error("Runtime could not start. Please reset the machine."),
          );
        }
      };
      const result = await request("init", { machine: candidate });
      if (currentGeneration !== generation.current) return;
      setMachine(candidate);
      setSnapshot(result.snapshot);
      setReady(true);
      setStatus(message);
      addLog("INIT", `→ ${stateLabel(result.snapshot.state)}`);
    } catch (cause) {
      if (currentGeneration !== generation.current) return;
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(true);
      setStatus(message);
      addLog("ERROR", message, "error");
    } finally {
      if (currentGeneration === generation.current) setBusy(false);
    }
  }
  useEffect(() => {
    void loadMachine(initial, "Definition valid");
    return () => {
      generation.current++;
      worker.current?.terminate();
      if (pending.current) {
        clearTimeout(pending.current.timer);
        pending.current.reject(new Error("Runtime closed"));
        pending.current = null;
      }
      clearTimeout(toastTimer.current);
    };
  }, []);

  async function send(event: string) {
    if (busy || !ready) return;
    let values: Record<string, unknown> = {};
    try {
      if (payload.trim()) {
        const parsed = JSON.parse(payload);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
          throw new Error("Use a JSON object for the event payload.");
        values = parsed;
      }
    } catch {
      notify("Event payload must be a valid JSON object.");
      return;
    }
    setBusy(true);
    try {
      const result = await request("send", {
        event: { ...values, type: event },
      });
      setSnapshot(result.snapshot);
      const context = Object.keys(result.snapshot.context).length
        ? ` · ${JSON.stringify(result.snapshot.context)}`
        : "";
      addLog(
        event,
        result.transitioned
          ? `→ ${stateLabel(result.snapshot.state)}${context}`
          : "no transition · guard blocked or no handler",
        result.transitioned ? undefined : "blocked",
      );
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(true);
      setStatus(message);
      addLog("ERROR", message, "error");
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    try {
      if (draft.length > 100000)
        throw new Error("Keep the playground definition under 100 KB.");
      const candidate = JSON.parse(draft);
      if (
        !candidate ||
        typeof candidate !== "object" ||
        Array.isArray(candidate)
      )
        throw new Error("A machine definition must be a JSON object.");
      setExample("custom");
      await loadMachine(candidate as Machine);
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Invalid JSON");
      setError(true);
    }
  }
  function changeExample(key: string) {
    const selected = examples[key];
    if (!selected) return;
    setExample(key);
    setDraft(JSON.stringify(selected.machine, null, 2));
    setPayload("");
    setScrollTop(0);
    setScrollLeft(0);
    if (editor.current) {
      editor.current.scrollTop = 0;
      editor.current.scrollLeft = 0;
    }
    void loadMachine(selected.machine, "Definition valid");
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(draft);
      notify("Definition copied.");
    } catch {
      editor.current?.focus();
      editor.current?.select();
      notify("Select and copy the definition.");
    }
  }
  function download() {
    try {
      const json = JSON.parse(draft);
      const blob = new Blob([JSON.stringify(json, null, 2) + "\n"], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${String(json.id ?? "machine").replace(/[^a-zA-Z0-9_-]/g, "-")}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify("JSON definition downloaded.");
    } catch {
      notify("Fix the JSON before downloading.");
    }
  }
  const events = activeEvents(machine, snapshot.state);
  return (
    <>
      <div className="workbench">
        <div className="workbench-toolbar">
          <div className="example-picker">
            <label className="sr-only" htmlFor="example">
              Example machine
            </label>
            <select
              id="example"
              value={example}
              onChange={(e) => changeExample(e.target.value)}
            >
              {example === "custom" && (
                <option value="custom">Custom definition</option>
              )}
              {Object.entries(examples).map(([key, value]) => (
                <option key={key} value={key}>
                  {value.label}
                </option>
              ))}
            </select>
          </div>
          <div className="workbench-controls">
            <button
              className="small-button"
              onClick={() => void loadMachine(machine, "Machine reset")}
              disabled={busy}
              aria-label="Reset machine"
            >
              <span aria-hidden="true">↺</span> Reset
            </button>
          </div>
        </div>
        <div className="workbench-body">
          <aside className="examples-sidebar" aria-label="Example machines">
            <span className="field-label">EXAMPLES</span>
            {Object.entries(examples).map(([key, value], i) => (
              <button
                key={key}
                className={`example-item ${example === key ? "selected" : ""}`}
                onClick={() => changeExample(key)}
                aria-pressed={example === key}
              >
                <span className="example-number">0{i + 1}</span>
                <span>
                  <strong>{value.label}</strong>
                  <small>
                    {
                      [
                        "Two states, one event",
                        "Guards & mutations",
                        "Branching transitions",
                      ][i]
                    }
                  </small>
                </span>
                <span className="example-arrow" aria-hidden="true">
                  →
                </span>
              </button>
            ))}
            <div className="sidebar-guide">
              <span className="field-label">TRY THIS</span>
              <ol>
                <li>Choose a machine</li>
                <li>Send an event on the right</li>
                <li>Edit its JSON definition</li>
                <li>Apply and run it again</li>
              </ol>
              <a
                href="https://github.com/cristianmartinez/statepack/blob/main/packages/state-machine/README.md"
                target="_blank"
                rel="noopener"
              >
                Definition reference ↗
              </a>
            </div>
          </aside>
          <div className="definition-pane">
            <div className="pane-heading">
              <span>
                <i className="file-icon" aria-hidden="true">
                  {"{ }"}
                </i>{" "}
                machine.json
              </span>
              <div className="definition-actions">
                <button className="icon-button" onClick={download}>
                  Download
                </button>
                <button
                  className="icon-button"
                  onClick={() => void copy()}
                  aria-label="Copy machine JSON"
                >
                  Copy <span aria-hidden="true">⧉</span>
                </button>
              </div>
            </div>
            <div className="editor-shell">
              <div className="line-numbers" aria-hidden="true">
                <div style={{ transform: `translateY(-${scrollTop}px)` }}>
                  {draft.split("\n").map((_, i) => (
                    <div key={i}>{i + 1}</div>
                  ))}
                </div>
              </div>
              <div className="editor-color" aria-hidden="true">
                <pre
                  style={{
                    transform: `translate(${-scrollLeft}px, ${-scrollTop}px)`,
                  }}
                >
                  <JsonHighlight value={draft} />
                </pre>
              </div>
              <label className="sr-only" htmlFor="definition">
                Machine JSON definition
              </label>
              <textarea
                id="definition"
                ref={editor}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setStatus("Unapplied changes");
                  setError(false);
                }}
                onScroll={(e) => {
                  setScrollTop(e.currentTarget.scrollTop);
                  setScrollLeft(e.currentTarget.scrollLeft);
                }}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    if (!busy) void apply();
                  }
                }}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
              />
            </div>
            <div className="editor-footer">
              <span
                id="definition-status"
                className={error ? "error" : ""}
                role="status"
              >
                {status}
              </span>
              <button
                className="apply-button"
                onClick={() => void apply()}
                disabled={busy}
              >
                Apply changes <span aria-hidden="true">↵</span>
              </button>
            </div>
          </div>
          <div className="runtime-pane">
            <div className="pane-heading">
              <span>State graph</span>
            </div>
            <div className="machine-diagram">
              <StateDiagram machine={machine} state={snapshot.state} />
            </div>
            <div className="machine-details">
              <div className="current-state">
                <span className="field-label">CURRENT STATE</span>
                <strong id="current-state" aria-live="polite">
                  {stateLabel(snapshot.state)}
                </strong>
              </div>
              <div className="context-values">
                <span className="field-label">CONTEXT</span>
                <code id="context-output">
                  {JSON.stringify(snapshot.context)}
                </code>
              </div>
            </div>
            <div className="event-panel">
              <span className="field-label">EVENTS</span>
              <div className="event-buttons">
                {events.length ? (
                  events.map((event) => (
                    <button
                      key={event}
                      className="event-button"
                      onClick={() => void send(event)}
                      disabled={busy || !ready}
                    >
                      <span aria-hidden="true">↗</span>
                      {event}
                    </button>
                  ))
                ) : (
                  <span className="event-hint">
                    {snapshot.done
                      ? "Final state reached. Reset to start again."
                      : "No events in the current state."}
                  </span>
                )}
              </div>
              <p className="event-hint">
                {examples[example]?.hint ??
                  "Events come from your definition. External effects need a host callback."}
              </p>
              <details className="event-payload">
                <summary>
                  Event payload <span>optional</span>
                </summary>
                <label className="sr-only" htmlFor="payload">
                  Event payload (JSON)
                </label>
                <input
                  id="payload"
                  value={payload}
                  onChange={(e) => setPayload(e.target.value)}
                  placeholder={'{ "amount": 1 }'}
                  spellCheck={false}
                />
              </details>
            </div>
            <div className="event-log">
              <div className="log-heading">
                <span className="field-label">TRANSITION LOG</span>
                <button className="icon-button" onClick={() => setLogs([])}>
                  Clear
                </button>
              </div>
              <div
                id="event-log"
                role="log"
                aria-label="Machine event history"
                aria-live="polite"
              >
                {logs.map((entry) => (
                  <div className={`log-row ${entry.kind ?? ""}`} key={entry.id}>
                    <span className="time">{entry.time}</span>
                    <span>
                      <strong>{entry.event}</strong> {entry.detail}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className={`toast ${toast ? "visible" : ""}`} role="status">
        {toast}
      </div>
    </>
  );
}
