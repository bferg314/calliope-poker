import type { NightReport, RoomView } from '@calliope/shared';
import { TopBar } from '../components/TopBar.js';
import { fmt, fmtDate, fmtDuration, fmtMoney, fmtSigned } from '../format.js';
import { Link } from '../router.js';

export function ReportSheet({ report, currency, chipValue }: { report: NightReport; currency: string; chipValue: number }): JSX.Element {
  const winner = report.players[0];
  const money = (chips: number): string => (chipValue > 0 ? ` (${fmtMoney(Math.round(chips * chipValue * 100) / 100, currency)})` : '');
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
              up {fmt(winner.net)} chips{money(winner.net)}
            </p>
          </>
        ) : (
          <p className="muted">Nobody came out ahead. A rare and peaceful night.</p>
        )}
      </div>
      <hr className="rule-double" />
      <div style={{ overflowX: 'auto' }}>
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
                <td className="num">{fmt(p.totalIn)}</td>
                <td className="num">{fmt(p.finalStack)}</td>
                <td className={`num ${p.net > 0 ? 'pos' : p.net < 0 ? 'neg' : ''}`}>{fmtSigned(p.net)}</td>
                <td className="num">{p.handsPlayed}</td>
                <td className="num">{p.handsWon}</td>
                <td className="num">{p.vpipPct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
  const chipValue = room.settings.chips.buyInChips > 0 ? room.settings.chips.buyInValue / room.settings.chips.buyInChips : 0;
  return (
    <div className="page page-narrow" style={{ maxWidth: 760 }}>
      <TopBar right={<span className="room-code smallcaps">{room.code}</span>} />
      <div style={{ paddingTop: 'var(--s-4)' }}>
        {room.report ? <ReportSheet report={room.report} currency={room.settings.chips.currency} chipValue={chipValue} /> : <p className="muted">The night has ended.</p>}
      </div>
      <div className="row" style={{ paddingTop: 'var(--s-6)' }}>
        <Link to="/" className="btn btn-ink">Another night</Link>
        <Link to="/me" className="btn">My record</Link>
      </div>
    </div>
  );
}
