export function CharCounter({ current, limit }: { current: number; limit: number }) {
  const ratio = current / limit;
  const color = ratio > 1 ? "var(--red)" : ratio > 0.9 ? "#eab308" : "var(--dim)";
  return (
    <span style={{ fontSize: 11, color, whiteSpace: "nowrap" }}>
      {current} / {limit} зн.
    </span>
  );
}
