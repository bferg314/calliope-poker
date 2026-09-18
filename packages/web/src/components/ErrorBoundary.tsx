import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * A render fault must never leave somebody staring at a blank page with chips on
 * the table. Show what happened and offer the two ways out: reload, which
 * reconnects to the same seat, or go back to the start.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Calliope hit a rendering error', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="page page-narrow stack" style={{ justifyContent: 'center' }}>
        <div className="ornament">
          <span className="italic">well, this is awkward</span>
        </div>
        <h1>Something went wrong on screen</h1>
        <p className="muted">
          Your seat and your chips are safe on the server. Reloading should put you straight back at the table.
        </p>
        <div className="row">
          <button className="btn btn-red" onClick={() => window.location.reload()}>Reload</button>
          <button className="btn" onClick={() => { window.location.href = '/'; }}>Back to the start</button>
        </div>
        <details>
          <summary className="label" style={{ cursor: 'pointer' }}>what broke</summary>
          <pre className="micro" style={{ whiteSpace: 'pre-wrap', overflowX: 'auto' }}>{error.message}</pre>
        </details>
      </div>
    );
  }
}
