import { useMemo } from 'react';
import { priceNight, type NightReport, type RoomView } from '@calliope/shared';
import { TopBar } from '../components/TopBar.js';
import { HandHistory } from '../components/HandHistory.js';
import { fmt, fmtCash, fmtCashSigned, fmtDate, fmtDuration, fmtSigned } from '../format.js';
import { Link } from '../router.js';

export function ReportSheet({ report, youId }: { report: NightReport; youId: string | null }): JSX.Element {
  const winner = report.players[0];
  const cash = report.cash;
  const you = youId ? report.players.find((p) => p.id === youId) ?? null : null;
  const totalIn = report.players.reduce((a, p) => a + p.totalIn, 0);
  const totalOut = report.players.reduce((a, p) => a + p.finalStack, 0);
  return (
    <div className="stack">
      <div className="report-hero">
        <div className="ornament">
          <span className="italic">the night of {fmtDate(report.endedAt)}</span>
        </div>
        <h1>{report.roomName}</h1>
        {winner && winner.net > 0 ? (
          <>
            <p className="label" style={{ marginTop: 'var(--s-4)' }}>the winner</p>
            <div className="display">{winner.name}!</div>
            <p className="muted">
              up {fmt(winner.net)} chips{cash ? ` (${fmtCash(winner.cashNet, cash.currency)})` : ''}
            </p>
          </>
        ) : (
          <p className="muted">Nobody came out ahead. A rare and peaceful night.</p>
        )}
      </div>
      <hr className="rule-double" />
      {cash && you && (
        <div className="payout">
          <div className="label">your payout</div>
          <div className="big num">{fmtCash(you.cashOut, cash.currency)}</div>
          <p className="micro">
            {fmtCash(you.cashIn, cash.currency)} in over {you.buyIns + you.rebuys} {you.buyIns + you.rebuys === 1 ? 'buy-in' : 'buy-ins'}
            {' · '}
            {fmtCashSigned(you.cashNet, cash.currency)} on the night
          </p>
        </div>
      )}
      <div className="ledger-scroll">
        <table className="ledger">
          <thead>
            <tr>
              <th>player</th>
              <th className="num">buy-ins</th>
              <th className="num">re-buys</th>
              <th className="num">in</th>
              <th className="num">out</th>
              <th className="num">net</th>
              <th className="num">hands</th>
              <th className="num">won</th>
              <th className="num">vpip</th>
            </tr>
          </thead>
          <tbody>
            {report.players.map((p) => (
              <tr key={p.id}>
                <td>
                  {p.name} {p.kind === 'bot' && <span className="micro">bot</span>}
                </td>
                <td className="num">{p.buyIns}</td>
                <td className="num">{p.rebuys}</td>
                <td className="num">
                  {fmt(p.totalIn)}
                  {cash && <span className="cash">{fmtCash(p.cashIn, cash.currency)}</span>}
                </td>
                <td className="num">
                  {fmt(p.finalStack)}
                  {cash && <span className="cash">{fmtCash(p.cashOut, cash.currency)}</span>}
                </td>
                <td className={`num ${p.net > 0 ? 'pos' : p.net < 0 ? 'neg' : ''}`}>
                  {fmtSigned(p.net)}
                  {cash && <span className="cash">{fmtCashSigned(p.cashNet, cash.currency)}</span>}
                </td>
                <td className="num">{p.handsPlayed}</td>
                <td className="num">{p.handsWon}</td>
                <td className="num">{p.vpipPct}%</td>
              </tr>
            ))}
          </tbody>
          {cash && (
            <tfoot>
              <tr>
                <td className="smallcaps">the bank</td>
                <td />
                <td />
                <td className="num">
                  {fmt(totalIn)}
                  <span className="cash">{fmtCash(cash.paidIn, cash.currency)}</span>
                </td>
                <td className="num">
                  {fmt(totalOut)}
                  <span className="cash">{fmtCash(cash.paidOut, cash.currency)}</span>
                </td>
                <td />
                <td />
                <td />
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {cash && <p className="micro">Chips cash at {fmtCash(cash.buyIn, cash.currency)} per {fmt(cash.chipsPerBuyIn)}. Settling up happens between you.</p>}
      <div className="report-cards">
        {report.biggestPot && (
          <div className="report-card">
            <div className="label">biggest pot</div>
            <div className="big num">{fmt(report.biggestPot.amount)}</div>
            <div className="micro">
              hand #{report.biggestPot.handNumber}, {report.biggestPot.winners.join(' and ')}
              {report.biggestPot.handLabel ? `, ${report.biggestPot.handLabel.toLowerCase()}` : ''}
            </div>
          </div>
        )}
        {report.mostHandsWon && (
          <div className="report-card">
            <div className="label">most hands won</div>
            <div className="big">{report.mostHandsWon.name}</div>
            <div className="micro">{report.mostHandsWon.count} {report.mostHandsWon.count === 1 ? 'hand' : 'hands'}</div>
          </div>
        )}
        {report.tightest && (
          <div className="report-card">
            <div className="label">the rock</div>
            <div className="big">{report.tightest.name}</div>
            <div className="micro">played {report.tightest.vpipPct}% of hands</div>
          </div>
        )}
        {report.loosest && (
          <div className="report-card">
            <div className="label">the gambler</div>
            <div className="big">{report.loosest.name}</div>
            <div className="micro">played {report.loosest.vpipPct}% of hands</div>
          </div>
        )}
      </div>
      <hr className="rule" />
      <p className="folio">
        {report.handsPlayed} {report.handsPlayed === 1 ? 'hand' : 'hands'}
        {report.levelsPlayed > 1 && report.finalStakes
          ? ` · stakes climbed to ${report.finalStakes.blinds.small}/${report.finalStakes.blinds.big}${report.finalStakes.ante > 0 ? ` with a ${report.finalStakes.ante} ante` : ''}`
          : ''}
        {report.startedAt ? ` over ${fmtDuration(report.endedAt - report.startedAt)}` : ''}
        {Object.keys(report.variantsPlayed).length > 0 && ` · ${Object.entries(report.variantsPlayed).map(([id, n]) => `${id} ×${n}`).join(', ')}`}
      </p>
    </div>
  );
}

export function Report({ room }: { room: RoomView }): JSX.Element {
  // Nights that ended before payouts were worked out have no cash on their
  // report, but the table they were played at still knows what a buy-in cost.
  const report = useMemo(() => {
    const r = room.report;
    if (!r || r.cash) return r;
    const players = r.players.map((p) => ({ ...p }));
    return { ...r, players, cash: priceNight(players, room.settings.chips) };
  }, [room.report, room.settings.chips]);
  return (
    <div className="page page-narrow" style={{ maxWidth: 760 }}>
      <TopBar right={<span className="room-code smallcaps">{room.code}</span>} />
      <div style={{ paddingTop: 'var(--s-4)' }}>
        {report ? <ReportSheet report={report} youId={room.me?.id ?? null} /> : <p className="muted">The night has ended.</p>}
      </div>
      <HandHistory code={room.code} />
      <div className="row" style={{ paddingTop: 'var(--s-6)' }}>
        <Link to="/" className="btn btn-ink">Another night</Link>
        <Link to="/me" className="btn">My profile</Link>
      </div>
    </div>
  );
}

/**
 * A night the server has filed away: the live table is gone, so the report
 * comes from the record kept in the database. Same page, without the room.
 */
export function FiledReport({ code, report, youId }: { code: string; report: NightReport; youId: string | null }): JSX.Element {
  return (
    <div className="page page-narrow" style={{ maxWidth: 760 }}>
      <TopBar right={<span className="room-code smallcaps">{code}</span>} />
      <div style={{ paddingTop: 'var(--s-4)' }}>
        <ReportSheet report={report} youId={youId} />
      </div>
      <HandHistory code={code} />
      <div className="row" style={{ paddingTop: 'var(--s-6)' }}>
        <Link to="/" className="btn btn-ink">Another night</Link>
        <Link to="/me" className="btn">My profile</Link>
      </div>
    </div>
  );
}
