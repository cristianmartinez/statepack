import { useEffect, useRef, useState } from "react";

const vertex = `
attribute vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;
const fragment = `
precision highp float;
uniform vec2 resolution;
uniform float time;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1.0,0.0)), f.x),
             mix(hash(i+vec2(0.0,1.0)), hash(i+vec2(1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v=0.0, a=0.5;
  for(int i=0;i<5;i++) { v+=a*noise(p); p=mat2(0.8,-0.6,0.6,0.8)*p*2.01; a*=0.5; }
  return v;
}
void main() {
  vec2 uv=gl_FragCoord.xy/resolution;
  vec2 p=(uv-0.5)*vec2(resolution.x/resolution.y,1.0);
  float t=time*0.07;
  vec2 warp=vec2(fbm(p*2.1+vec2(t,0.0)),fbm(p*2.0+vec2(4.0,-t)));
  float field=fbm(p*3.2+warp*2.3+vec2(0.0,t));
  float radius=length(p-vec2(0.05+sin(t)*0.05,0.02));
  float cloud=1.0-smoothstep(0.10,0.62,radius+field*0.14);
  float stripe=sin((field*0.72+radius*1.3)*75.0);
  vec3 paper=vec3(0.89,0.91,0.94);
  vec3 olive=vec3(0.58,0.65,0.75);
  vec3 warm=vec3(0.92,0.46,0.27);
  vec3 color=mix(paper,olive,smoothstep(0.24,0.7,field)*0.72);
  color=mix(color,warm,cloud*0.80);
  color-=smoothstep(0.91,1.0,stripe)*0.028;
  color+=(hash(gl_FragCoord.xy)-0.5)*0.055;
  color=mix(color,paper,0.09+smoothstep(0.40,0.8,radius)*0.12);
  gl_FragColor=vec4(color,1.0);
}
`;

export default function Shader() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const gl = element.getContext("webgl", {
      antialias: false,
      alpha: false,
      powerPreference: "low-power",
    });
    if (!gl) return;
    function compile(type: number, source: string) {
      const shader = gl!.createShader(type);
      if (!shader) return null;
      gl!.shaderSource(shader, source);
      gl!.compileShader(shader);
      if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) {
        gl!.deleteShader(shader);
        return null;
      }
      return shader;
    }
    const vs = compile(gl.VERTEX_SHADER, vertex);
    const fs = compile(gl.FRAGMENT_SHADER, fragment);
    if (!vs || !fs) {
      if (vs) gl.deleteShader(vs);
      if (fs) gl.deleteShader(fs);
      return;
    }
    const program = gl.createProgram();
    if (!program) {
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      return;
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      return;
    }
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const location = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
    const resolution = gl.getUniformLocation(program, "resolution");
    const time = gl.getUniformLocation(program, "time");
    let frame = 0;
    let elapsed = 0;
    let last = 0;
    let visible = true;
    let lost = false;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const setReduced = () => {
      pausedRef.current = reduced.matches;
      setPaused(reduced.matches);
    };
    setReduced();
    reduced.addEventListener("change", setReduced);
    const resize = () => {
      const rect = element.getBoundingClientRect();
      const ratio = Math.min(devicePixelRatio, 1.5);
      element.width = Math.min(900, Math.round(rect.width * ratio));
      element.height = Math.min(900, Math.round(rect.height * ratio));
      gl.viewport(0, 0, element.width, element.height);
      gl.uniform2f(resolution, element.width, element.height);
      gl.uniform1f(time, elapsed);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false;
    });
    intersection.observe(element);
    const onLost = () => {
      lost = true;
      setAvailable(false);
    };
    element.addEventListener("webglcontextlost", onLost);
    const render = (now: number) => {
      frame = requestAnimationFrame(render);
      if (
        lost ||
        pausedRef.current ||
        !visible ||
        document.hidden ||
        now - last < 33
      ) {
        last = pausedRef.current || !visible || document.hidden ? now : last;
        return;
      }
      elapsed += Math.min((now - (last || now)) / 1000, 0.1);
      last = now;
      gl.uniform1f(time, elapsed);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };
    setAvailable(true);
    frame = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      intersection.disconnect();
      reduced.removeEventListener("change", setReduced);
      element.removeEventListener("webglcontextlost", onLost);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, []);
  return (
    <>
      <canvas
        id="shader"
        ref={canvas}
        aria-hidden="true"
        style={{ opacity: available ? 1 : 0 }}
      />
      {available && (
        <button
          className="art-motion-toggle"
          type="button"
          aria-label={
            paused ? "Play background animation" : "Pause background animation"
          }
          onClick={() => {
            pausedRef.current = !pausedRef.current;
            setPaused(pausedRef.current);
          }}
        >
          {paused ? "▷" : "Ⅱ"}
        </button>
      )}
    </>
  );
}
