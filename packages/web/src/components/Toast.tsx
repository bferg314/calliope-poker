export function Toast({ text }: { text: string | null }): JSX.Element | null {
  if (!text) return null;
  return (
    <div className="toast" role="status">
      {text}
    </div>
  );
}
