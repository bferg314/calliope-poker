/**
 * "Your turn", stamped in red across the lower half of the table for a second
 * or two when the action reaches the player, then gone.
 *
 * It is one short band rather than a tall plate so that it always clears the
 * pot, which is the number you want most while you are deciding. It is
 * `pointer-events: none` so it can never swallow the tap it is asking for, and
 * `aria-hidden` because the table's live region already announces "Your turn" —
 * a screen reader should hear it once, not twice.
 */
export function TurnPop({ hint }: { hint: string | null }): JSX.Element {
  return (
    <div className="turn-pop" aria-hidden="true">
      <div className="plate">
        <strong>Your turn</strong>
        {hint && (
          <>
            <span className="sep">·</span>
            <span className="hint smallcaps">{hint}</span>
          </>
        )}
      </div>
    </div>
  );
}
