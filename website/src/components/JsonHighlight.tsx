import type { ReactNode } from "react";

export default function JsonHighlight({ value }: { value: string }) {
  const tokens: ReactNode[] = [];
  const pattern =
    /"(?:\\.|[^"\\])*"(?=\s*:)|"(?:\\.|[^"\\])*"|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
  let position = 0;
  for (const match of value.matchAll(pattern)) {
    const index = match.index!;
    tokens.push(value.slice(position, index));
    const token = match[0];
    const rest = value.slice(index + token.length);
    const kind = token.startsWith('"')
      ? /^\s*:/.test(rest)
        ? "key"
        : "string"
      : "literal";
    tokens.push(
      <span key={index} className={`json-${kind}`}>
        {token}
      </span>,
    );
    position = index + token.length;
  }
  tokens.push(value.slice(position));
  return <>{tokens}</>;
}
