import type { Machine } from "@statepack/state-machine";
import { stateLabel } from "../lib/examples";

type Edge = { from: string; to: string; event: string };

export default function StateDiagram({
  machine,
  state,
}: {
  machine: Machine;
  state: unknown;
}) {
  const names = Object.keys(machine.states).slice(0, 8);
  const active = stateLabel(state)
    .split(" / ")
    .map((name) => name.split(".")[0]);
  const positions = new Map(
    names.map((name, i) => {
      if (names.length === 1) return [name, { x: 250, y: 115 }] as const;
      if (names.length === 2)
        return [name, { x: i === 0 ? 135 : 365, y: 108 }] as const;
      if (names.length === 3)
        return [name, { x: 82 + i * 168, y: 115 }] as const;
      const angle = -Math.PI / 2 + (i / names.length) * 2 * Math.PI;
      return [
        name,
        { x: 250 + Math.cos(angle) * 165, y: 106 + Math.sin(angle) * 65 },
      ] as const;
    }),
  );
  const edges: Edge[] = [];
  for (const from of names) {
    const on = { ...machine.on, ...machine.states[from]?.on };
    for (const [event, transitions] of Object.entries(on)) {
      const options = Array.isArray(transitions) ? transitions : [transitions];
      for (const transition of options) {
        const target =
          typeof transition === "string" ? transition : transition.target;
        const to =
          typeof target === "string"
            ? target.replace(/^\./, "").split(".")[0]
            : from;
        if (positions.has(to)) edges.push({ from, to, event });
      }
    }
  }
  return (
    <svg
      viewBox="0 0 500 210"
      role="img"
      aria-label={`States: ${names.join(", ")}. Active: ${stateLabel(state)}`}
    >
      <defs>
        <marker
          id="graph-arrow"
          markerWidth="7"
          markerHeight="7"
          refX="6"
          refY="3.5"
          orient="auto"
        >
          <path
            d="M0 0 7 3.5 0 7"
            fill="none"
            stroke="#96a389"
            strokeWidth="1"
          />
        </marker>
      </defs>
      {edges.slice(0, 18).map((edge, i) => {
        const from = positions.get(edge.from)!;
        const to = positions.get(edge.to)!;
        const self = edge.from === edge.to;
        const side = from.x < to.x ? -1 : 1;
        let d: string;
        let tx: number;
        let ty: number;
        if (self) {
          d = `M${from.x - 19} ${from.y - 25} C${from.x - 68} ${from.y - 91}, ${from.x + 68} ${from.y - 91}, ${from.x + 19} ${from.y - 25}`;
          tx = from.x;
          ty = from.y - 70;
        } else if (names.length === 2) {
          const dx = to.x > from.x ? 1 : -1;
          d = `M${from.x + dx * 31} ${from.y + side * 16} Q250 ${from.y + side * 92} ${to.x - dx * 31} ${to.y + side * 16}`;
          tx = 250;
          ty = from.y + side * 62;
        } else {
          const dx = to.x - from.x;
          const dy = to.y - from.y;
          const dist = Math.hypot(dx, dy);
          const ux = dx / dist;
          const uy = dy / dist;
          const offset = 18;
          const cx = (from.x + to.x) / 2 - uy * offset;
          const cy = (from.y + to.y) / 2 + ux * offset;
          d = `M${from.x + ux * 37} ${from.y + uy * 37} Q${cx} ${cy} ${to.x - ux * 39} ${to.y - uy * 39}`;
          tx = cx;
          ty = cy - 8;
        }
        return (
          <g key={`${edge.from}-${edge.event}-${i}`}>
            <path
              className={`diagram-link ${active.includes(edge.from) ? "is-active" : ""}`}
              d={d}
              markerEnd="url(#graph-arrow)"
            />
            <text className="diagram-label" x={tx} y={ty} textAnchor="middle">
              {edge.event.length > 14
                ? edge.event.slice(0, 13) + "…"
                : edge.event}
            </text>
          </g>
        );
      })}
      {names.map((name) => {
        const p = positions.get(name)!;
        const isActive = active.includes(name);
        return (
          <g key={name}>
            <circle
              cx={p.x}
              cy={p.y}
              r="35"
              className={`diagram-node ${isActive ? "is-active" : ""} ${machine.states[name]?.type === "final" ? "final-node" : ""}`}
            />
            <text
              x={p.x}
              y={p.y + 4}
              textAnchor="middle"
              className={`diagram-node-text ${isActive ? "is-active" : ""}`}
            >
              {name.length > 10 ? name.slice(0, 9) + "…" : name}
            </text>
            {isActive && (
              <>
                <circle cx={p.x} cy={p.y + 48} r="2" fill="#bd5735" />
                <text
                  x={p.x}
                  y={p.y + 64}
                  className="diagram-entry"
                  textAnchor="middle"
                >
                  CURRENT
                </text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}
