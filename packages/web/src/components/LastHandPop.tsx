/**
 * "Last hand of the night", set across the middle of the felt for a few seconds
 * when the table goes into its final hand, then gone. The strip above the table
 * keeps saying so for the rest of the hand; this is the moment it starts.
 *
 * Modal in look only: the last hand is usually dealt the moment the clock runs
 * out, sometimes with the player first to act, so it takes no pointer events
 * and a tap meant for the table goes straight through. `aria-hidden` because
 * the table's live region announces it.
 */
export function LastHandPop(): JSX.Element {
  return (
    <div className="last-hand-pop" aria-hidden="true">
      <div className="plate">
        <span className="kicker smallcaps">the night is up</span>
        <strong>Last hand</strong>
        <span className="hint">Play it out, then the night report.</span>
      </div>
    </div>
  );
}
