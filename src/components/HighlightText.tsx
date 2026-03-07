interface HighlightTextProps {
  text: string;
  highlight: string;
  className?: string;
  style?: React.CSSProperties;
}

export function HighlightText({ text, highlight, className, style }: HighlightTextProps) {
  if (!highlight.trim()) {
    return <span className={className} style={style}>{text}</span>;
  }

  const regex = new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  const parts = text.split(regex);

  return (
    <span className={className} style={style}>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} style={{ background: "#FFF176", borderRadius: 2, padding: "0 1px" }}>
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
}
