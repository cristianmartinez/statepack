import { useEffect, useRef, useState, type ReactNode } from "react";
import gsap from "gsap";
import { SplitText } from "gsap/SplitText";
import type { Machine, SignalInterpreter } from "@statepack/state-machine";
import { activeEvents, examples, stateLabel } from "../lib/examples";

gsap.registerPlugin(SplitText);

const machine = examples.request!.machine;
// Each pane of the mark is one state: left, top, right, bottom.
const panes = ["idle", "loading", "success", "error"];
const centers = [
  [-0.3929, 0],
  [0, 0.3929],
  [0.3929, 0],
  [0, -0.3929],
] as const;
const script = [
  "FETCH",
  "RESOLVE",
  "RETRY",
  "FETCH",
  "REJECT",
  "RETRY",
  "REJECT",
  "RETRY",
  "RESOLVE",
  "RETRY",
];

const vertex = `
attribute vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;

// The statepack mark turned on its corner and rendered as frosted glass.
// The active state's pane gathers the light; transitions carry it across.
const fragment = `
precision highp float;
uniform float time;
uniform vec3 logo;
uniform vec2 pointer;
uniform vec4 active;
uniform vec4 pulse;
uniform vec4 pop;
uniform vec3 beam;

const vec3 base = vec3(0.035, 0.02, 0.06);
const vec3 night = vec3(0.05, 0.035, 0.2);
const vec3 blue = vec3(0.26, 0.32, 0.98);
const vec3 cream = vec3(1.0, 0.95, 0.9);
const vec3 amber = vec3(1.0, 0.68, 0.36);
const mat2 turn = mat2(0.7071, 0.7071, -0.7071, 0.7071);

vec4 paneOf(vec2 p) {
  vec2 s = step(0.0, turn * p);
  return vec4((1.0 - s.x) * (1.0 - s.y), (1.0 - s.x) * s.y, s.x * s.y, s.x * (1.0 - s.y));
}
float sdBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
float sdLogo(vec2 p) {
  float grow = 1.0 + 0.06 * dot(pop, paneOf(p));
  return sdBox(abs(turn * p) - vec2(0.2778), vec2(0.2222 * grow), 0.085);
}
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
vec3 ramp(float v) {
  vec3 col = mix(night, blue, smoothstep(0.0, 0.3, v));
  col = mix(col, cream, smoothstep(0.3, 0.58, v));
  col = mix(col, amber, smoothstep(0.62, 0.85, v));
  return mix(col, cream, smoothstep(0.9, 1.0, v));
}
vec3 field(vec2 q) {
  float t = time * 0.12;
  q += pointer * 0.04;
  float warp = sin(dot(q, vec2(1.3, -1.7)) * 1.6 + t * 1.3)
    + 0.6 * sin(dot(q, vec2(-2.1, 0.6)) * 1.9 - t);
  float v = 0.5 + 0.5 * sin(dot(q, vec2(1.8, 1.1)) * 1.9 + warp * 0.9 + t * 0.8);
  float band = sin(dot(q, vec2(-1.2, 1.6)) * 1.5 + warp * 0.7 - t * 0.6);
  float dark = exp(-band * band * 9.0);
  vec3 col = ramp(v) * (1.0 - 0.85 * dark);
  vec2 b = q - beam.xy;
  return col + cream * exp(-dot(b, b) * 16.0) * beam.z * 0.8;
}
void main() {
  vec2 p = (gl_FragCoord.xy - logo.xy) / logo.z;
  float px = 1.0 / logo.z;
  float d = sdLogo(p);
  float eps = 0.002;
  vec2 n = normalize(vec2(
    sdLogo(p + vec2(eps, 0.0)) - sdLogo(p - vec2(eps, 0.0)),
    sdLogo(p + vec2(0.0, eps)) - sdLogo(p - vec2(0.0, eps))
  ) + 1e-6);
  vec4 pane = paneOf(p);
  float lit = mix(0.24, 0.92, dot(active, pane));
  vec2 center = sign(turn * p) * 0.2778 * turn;
  vec2 local = p - center;

  // Inside: each pane is a soft lens, bending light hardest at its bevel.
  float depth = clamp(-d / 0.07, 0.0, 1.0);
  float slope = (1.0 - depth) * (1.0 - depth);
  vec2 refr = -n * slope * 0.12 - local * 0.35;
  vec3 glass = vec3(
    field(p + refr).r,
    field(p + refr * 1.06).g,
    field(p + refr * 1.12).b
  ) * lit;
  glass *= 1.0 - 0.45 * exp(min(d, 0.0) / (px * 7.0)) * (1.0 - depth);
  float wave = dot(pulse, pane);
  float ring = length(local) / 0.3 - (1.0 - wave) * 1.3;
  glass += cream * exp(-ring * ring * 30.0) * wave * 0.7;

  // Outside: each pane blooms by how lit it is; the beam crosses the gaps.
  vec2 rot = turn * p;
  vec4 dist = vec4(
    sdBox(rot - vec2(-0.2778, -0.2778), vec2(0.2222), 0.085),
    sdBox(rot - vec2(-0.2778, 0.2778), vec2(0.2222), 0.085),
    sdBox(rot - vec2(0.2778, 0.2778), vec2(0.2222), 0.085),
    sdBox(rot - vec2(0.2778, -0.2778), vec2(0.2222), 0.085)
  );
  vec4 near = max(dist, 0.0);
  vec4 spread = exp(-near * 7.0) * 0.36 + exp(-near * 30.0) * 0.28;
  float bloom = dot(spread, mix(vec4(0.1), vec4(1.0), active));
  vec3 halo = field(p);
  vec2 b = p - beam.xy;
  vec3 outside = base + halo * halo * bloom + cream * exp(-dot(b, b) * 40.0) * beam.z * 0.45;

  float inside = 1.0 - smoothstep(-px, px, d);
  vec3 col = mix(outside, glass, inside);
  float light = 0.5 + 0.5 * dot(n, normalize(vec2(-0.5, 0.86)));
  float rim = exp(-abs(d + px) / (px * 1.1)) * mix(0.45, 1.0, lit);
  col += mix(blue, amber, light) * rim * 0.55;
  col += cream * rim * light * 0.35;

  col += (hash(gl_FragCoord.xy + fract(time)) - 0.5) * 0.025;
  gl_FragColor = vec4(col, 1.0);
}
`;

type Log = { text: string; event?: string; blocked?: boolean };

type Uniforms = {
  active: number[];
  pulse: number[];
  pop: number[];
  beam: { x: number; y: number; glow: number };
};

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  gl.deleteShader(shader);
  return null;
}

function targetOf(state: string, event: string) {
  const transition = machine.states[state]?.on?.[event];
  const first = Array.isArray(transition) ? transition[0] : transition;
  return typeof first === "string" ? first : first?.target;
}

export default function HeroMachine({ children }: { children?: ReactNode }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const copy = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const marker = useRef<HTMLSpanElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const sendRef = useRef<(event: string, manual: boolean) => void>(() => {});
  const paneRef = useRef<(pane: number) => void>(() => {});
  const [state, setState] = useState(machine.initial);
  const [ready, setReady] = useState(false);
  const [log, setLog] = useState<Log>({
    text: "Click a state to move the machine.",
  });

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const u: Uniforms = {
      active: [1, 0, 0, 0],
      pulse: [0, 0, 0, 0],
      pop: [0, 0, 0, 0],
      beam: { x: centers[0][0], y: centers[0][1], glow: 0 },
    };
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const ctx = gsap.context(() => {}, copy.current ?? undefined);
    let current = machine.initial;
    let interpreter: SignalInterpreter | undefined;
    let busy = false;
    let transition: gsap.core.Timeline | undefined;
    let step = 0;
    let autoplay: gsap.core.Tween | undefined;
    let disposed = false;

    // --- WebGL -----------------------------------------------------------
    const gl = element.getContext("webgl", {
      antialias: false,
      alpha: false,
      powerPreference: "low-power",
    });
    const vs = gl && compile(gl, gl.VERTEX_SHADER, vertex);
    const fs = gl && compile(gl, gl.FRAGMENT_SHADER, fragment);
    const program = gl?.createProgram() ?? null;
    let draw = () => {};
    let linked = false;
    let logo = { x: 0, y: 0, size: 1, scale: 1 };
    let elapsed = 6;
    let visible = true;
    let lost = false;
    const target = { x: 0, y: 0 };
    const pointer = { x: 0, y: 0 };
    let buffer: WebGLBuffer | null = null;
    if (gl && vs && fs && program) {
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
    }
    if (gl && program && gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.useProgram(program);
      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
        gl.STATIC_DRAW,
      );
      const location = gl.getAttribLocation(program, "position");
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
      const at = (name: string) => gl.getUniformLocation(program, name);
      const loc = {
        time: at("time"),
        logo: at("logo"),
        pointer: at("pointer"),
        active: at("active"),
        pulse: at("pulse"),
        pop: at("pop"),
        beam: at("beam"),
      };
      linked = true;
      draw = () => {
        if (lost) return;
        gl.uniform1f(loc.time, elapsed);
        gl.uniform3f(loc.logo, logo.x, logo.y, logo.size);
        gl.uniform2f(loc.pointer, pointer.x, pointer.y);
        gl.uniform4fv(loc.active, u.active);
        gl.uniform4fv(loc.pulse, u.pulse);
        gl.uniform4fv(loc.pop, u.pop);
        gl.uniform3f(loc.beam, u.beam.x, u.beam.y, u.beam.glow);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      };
    }
    const resize = () => {
      const rect = element.getBoundingClientRect();
      const ratio = Math.min(devicePixelRatio, 1.5);
      const scale = Math.min(ratio, 2000 / Math.max(rect.width, 1));
      element.width = Math.round(rect.width * scale);
      element.height = Math.round(rect.height * scale);
      const w = element.width;
      const h = element.height;
      if (rect.width < 900) {
        // Narrow: the mark fills the space between the header and the copy.
        const header = 64;
        const copyTop = copy.current
          ? copy.current.getBoundingClientRect().top - rect.top
          : rect.height * 0.45;
        const room = Math.max(copyTop - header, 160);
        const size = Math.min(rect.width * 0.6, (room - 16) / 1.42) * scale;
        logo = { x: w * 0.5, y: h - (header + room / 2) * scale, size, scale };
      } else {
        // Desktop: the mark fills the column left of the copy, bleeding off the edge.
        const copyLeft = copy.current
          ? copy.current.getBoundingClientRect().left - rect.left
          : rect.width * 0.6;
        const x = copyLeft * 0.47;
        const size = Math.min(rect.height * 0.74, (copyLeft - 40 - x) / 0.707);
        logo = {
          x: x * scale,
          y: h * 0.47,
          size: size * scale,
          scale,
        };
      }
      gl?.viewport(0, 0, w, h);
      draw();
      if (linked && !lost) element.classList.add("ready");
    };
    // Logo units -> CSS pixels inside the canvas.
    const toCss = (x: number, y: number) => ({
      x: (logo.x + x * logo.size) / logo.scale,
      y: (element.height - (logo.y + y * logo.size)) / logo.scale,
    });
    const paneAt = (clientX: number, clientY: number) => {
      const rect = element.getBoundingClientRect();
      const x = ((clientX - rect.left) * logo.scale - logo.x) / logo.size;
      const y = ((rect.bottom - clientY) * logo.scale - logo.y) / logo.size;
      const rx = Math.abs(0.7071 * (x - y)) - 0.2778;
      const ry = Math.abs(0.7071 * (x + y)) - 0.2778;
      if (Math.max(Math.abs(rx), Math.abs(ry)) > 0.2222) return -1;
      const left = x - y < 0;
      const up = x + y > 0;
      return left ? (up ? 1 : 0) : up ? 2 : 3;
    };

    // --- Machine ---------------------------------------------------------
    const scheduleAutoplay = (delay: number) => {
      autoplay?.kill();
      if (motion.matches) return;
      autoplay = gsap.delayedCall(delay, () => {
        const available = activeEvents(machine, current);
        let event = script[step % script.length]!;
        if (!available.includes(event)) event = available[0]!;
        step++;
        sendRef.current(event, false);
      });
    };
    const animate = (from: string, to: string, event: string) => {
      const a = panes.indexOf(from);
      const b = panes.indexOf(to);
      const instant = motion.matches;
      const tl = gsap.timeline({ defaults: { overwrite: "auto" } });
      const active = Object.fromEntries(
        panes.map((_, i) => [i, i === b ? 1 : 0]),
      );
      tl.set(u.beam, { x: centers[a]![0], y: centers[a]![1] });
      tl.to(u.beam, {
        glow: 1,
        duration: instant ? 0 : 0.25,
        ease: "sine.out",
      });
      tl.to(
        u.beam,
        {
          x: centers[b]![0],
          y: centers[b]![1],
          duration: instant ? 0 : 0.9,
          ease: "power3.inOut",
        },
        "<",
      );
      tl.to(
        u.active,
        { ...active, duration: instant ? 0 : 0.9, ease: "power2.inOut" },
        "<0.15",
      );
      tl.to(
        u.beam,
        { glow: 0, duration: instant ? 0 : 0.6, ease: "sine.in" },
        ">-0.2",
      );
      tl.fromTo(
        u.pulse,
        { [b]: 1 },
        { [b]: 0, duration: instant ? 0 : 1.1, ease: "power2.out" },
        "<-0.15",
      );
      tl.fromTo(
        u.pop,
        { [b]: 1 },
        { [b]: 0, duration: instant ? 0 : 0.9, ease: "elastic.out(1, 0.45)" },
        "<",
      );
      const node = label.current;
      if (node && !instant) {
        const mid = toCss(
          (centers[a]![0] + centers[b]![0]) / 2,
          (centers[a]![1] + centers[b]![1]) / 2,
        );
        node.textContent = event;
        gsap.set(node, { left: mid.x, top: mid.y });
        tl.fromTo(
          node,
          { autoAlpha: 0, y: 8 },
          { autoAlpha: 1, y: 0, duration: 0.3, ease: "power2.out" },
          0,
        ).to(
          node,
          { autoAlpha: 0, y: -8, duration: 0.4, ease: "power2.in" },
          1.1,
        );
      }
      return tl;
    };
    const reject = (pane: number, message: string) => {
      setLog({ text: message, blocked: true });
      if (motion.matches) return;
      gsap.fromTo(
        u.pop,
        { [pane]: -0.6 },
        { [pane]: 0, duration: 0.6, ease: "elastic.out(1, 0.3)" },
      );
    };
    sendRef.current = async (event, manual) => {
      if (!interpreter || busy) return;
      busy = true;
      const from = current;
      try {
        await interpreter.send({ type: event });
      } finally {
        busy = false;
      }
      if (disposed) return;
      const to = stateLabel(interpreter.state.value);
      if (to === from) {
        reject(panes.indexOf(from), `${event} has no transition from ${from}.`);
        if (manual) scheduleAutoplay(9);
        return;
      }
      current = to;
      setState(to);
      setLog({ event, text: `${from} → ${to}` });
      // A new event finishes the previous animation instead of waiting for it.
      transition?.progress(1);
      transition = animate(from, to, event);
      scheduleAutoplay(manual ? 9 : transition.duration() + 1.6);
    };
    const clickPane = (pane: number) => {
      const to = panes[pane]!;
      if (to === current) {
        setLog({ text: `Already in ${current}.` });
        gsap.fromTo(u.pulse, { [pane]: 0.8 }, { [pane]: 0, duration: 0.8 });
        scheduleAutoplay(9);
        return;
      }
      const event = activeEvents(machine, current).find(
        (name) => targetOf(current, name) === to,
      );
      if (event) return sendRef.current(event, true);
      scheduleAutoplay(9);
      reject(pane, `No transition from ${current} to ${to}.`);
    };
    paneRef.current = clickPane;

    // --- Events and loop -------------------------------------------------
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    if (copy.current) observer.observe(copy.current);
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false;
    });
    intersection.observe(element);
    const onMove = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect();
      target.x =
        ((event.clientX - rect.left) * logo.scale - logo.x) / logo.size;
      target.y =
        ((rect.bottom - event.clientY) * logo.scale - logo.y) / logo.size;
      const over =
        event.target === element && paneAt(event.clientX, event.clientY) >= 0;
      element.style.cursor = over ? "pointer" : "";
    };
    const onClick = (event: MouseEvent) => {
      const pane = paneAt(event.clientX, event.clientY);
      if (pane >= 0) clickPane(pane);
    };
    const onLost = (event: Event) => {
      event.preventDefault();
      lost = true;
      element.classList.remove("ready");
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    element.addEventListener("click", onClick);
    element.addEventListener("webglcontextlost", onLost);
    const tick = (_time: number, delta: number) => {
      if (!visible || document.hidden) return;
      const dt = Math.min(delta, 50) / 1000;
      if (!motion.matches) {
        elapsed += dt;
        pointer.x += (target.x - pointer.x) * Math.min(1, dt * 2.5);
        pointer.y += (target.y - pointer.y) * Math.min(1, dt * 2.5);
      }
      draw();
    };
    gsap.ticker.add(tick);

    // --- Intro -----------------------------------------------------------
    ctx.add(() => {
      const root = copy.current;
      if (!root) return;
      gsap.set(root, { autoAlpha: 1 });
      if (motion.matches) return;
      const title = root.querySelector("h1");
      if (title)
        SplitText.create(title, {
          type: "lines",
          mask: "lines",
          autoSplit: true,
          onSplit: (split) =>
            gsap.from(split.lines, {
              yPercent: 110,
              duration: 1.2,
              ease: "expo.out",
              stagger: 0.12,
              delay: 0.15,
            }),
        });
      gsap.from(root.querySelectorAll("[data-reveal]"), {
        autoAlpha: 0,
        y: 14,
        duration: 0.9,
        ease: "power3.out",
        stagger: 0.08,
        delay: 0.45,
      });
    });

    import("@statepack/state-machine")
      .then(async ({ compileMachine, interpretWithSignals }) => {
        if (disposed) return;
        interpreter = interpretWithSignals(compileMachine(machine as Machine));
        await interpreter.start();
        if (disposed) return interpreter.stop();
        setReady(true);
        scheduleAutoplay(2.4);
      })
      .catch(() =>
        setLog({ text: "The runtime could not start.", blocked: true }),
      );

    return () => {
      disposed = true;
      autoplay?.kill();
      transition?.kill();
      interpreter?.stop();
      ctx.revert();
      gsap.ticker.remove(tick);
      gsap.killTweensOf([u.active, u.pulse, u.pop, u.beam]);
      observer.disconnect();
      intersection.disconnect();
      window.removeEventListener("pointermove", onMove);
      element.removeEventListener("click", onClick);
      element.removeEventListener("webglcontextlost", onLost);
      if (gl) {
        gl.deleteBuffer(buffer);
        gl.deleteProgram(program);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
      }
    };
  }, []);

  // The marker under the state names travels with the light between panes.
  useEffect(() => {
    const tab = tabs.current[panes.indexOf(state)];
    const bar = marker.current;
    if (!tab || !bar) return;
    const place = { x: tab.offsetLeft, width: tab.offsetWidth };
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || !bar.dataset.placed) gsap.set(bar, place);
    else gsap.to(bar, { ...place, duration: 0.9, ease: "power3.inOut" });
    bar.dataset.placed = "true";
  }, [state]);

  return (
    <>
      <canvas ref={canvas} className="hero-canvas" aria-hidden="true" />
      <span ref={label} className="hero-edge-label" aria-hidden="true" />
      <div ref={copy} className="hero-copy">
        {children}
        <div className="readout" data-reveal>
          <div
            className="readout-states"
            role="group"
            aria-label="Machine states"
          >
            {panes.map((name, i) => (
              <button
                key={name}
                ref={(node) => {
                  tabs.current[i] = node;
                }}
                className={name === state ? "is-active" : ""}
                aria-pressed={name === state}
                disabled={!ready}
                onClick={() => paneRef.current(i)}
              >
                {name}
              </button>
            ))}
            <span ref={marker} className="readout-marker" aria-hidden="true" />
          </div>
          <p
            className={`readout-log ${log.blocked ? "is-blocked" : ""}`}
            aria-live="polite"
          >
            {log.event && <strong>{log.event}</strong>}
            {log.text}
          </p>
        </div>
      </div>
    </>
  );
}
