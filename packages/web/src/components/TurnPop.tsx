/**
 * "Your turn", stamped across the table for a second or two when the action
 * reaches the player, then gone.
 *
 * It is `pointer-events: none` so it can never swallow the tap it is asking
 * for, and `aria-hidden` because the table's live region already announces
 * "Your turn" — a screen reader should hear it once, not twice.
 */
export function TurnPop({ hint }: { hint: string | null }): JSX.Element {
  return (
    <div className="turn-pop" aria-hidden="true">
      <div className="plate">
        <span className="rule" />
        <strong>Your turn</strong>
        {hint && <span className="hint smallcaps">{hint}</span>}
        <span className="rule" />
      </div>
    </div>
  );
}
