import { useEffect, useState } from 'react';

interface FillBotsProps {
  /** Open seats at the table right now. */
  open: number;
  onFill: (count: number) => void;
}

/** Pick how many bots to seat; the server gives each a random style. */
export function FillBots({ open, onFill }: FillBotsProps): JSX.Element {
  const [count, setCount] = useState(open);
  // Seats can fill up while the menu is open; never ask for more than there are.
  useEffect(() => setCount((c) => Math.min(Math.max(c, 1), Math.max(open, 1))), [open]);
  const n = Math.min(count, open);

  return (
    <div className="fill-bots">
      <div className="row row-between">
        <span className="label">bots to seat</span>
        <span className="num">{n} of {open}</span>
      </div>
      {open > 1 && (
        <input
          type="range"
          min={1}
          max={open}
          step={1}
          value={n}
          onChange={(e) => setCount(Number(e.target.value))}
          aria-label="Number of bots"
        />
      )}
      <button className="btn btn-ink" disabled={open === 0} onClick={() => onFill(n)}>
        {open === 0 ? 'Every seat is taken' : `Add ${n} ${n === 1 ? 'bot' : 'bots'}`}
      </button>
      <span className="micro">Each gets a random style.</span>
    </div>
  );
}
