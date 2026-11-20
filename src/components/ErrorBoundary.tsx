import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { FirestoreErrorInfo } from '../firebase';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
  details: FirestoreErrorInfo | null;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = {
      hasError: false,
      message: '',
      details: null,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let parsed: FirestoreErrorInfo | null = null;
    try {
      const candidate = JSON.parse(error.message) as Partial<FirestoreErrorInfo>;
      if (candidate && typeof candidate.error === 'string' && candidate.operationType) {
        parsed = candidate as FirestoreErrorInfo;
      }
    } catch {
      // Non-JSON error
    }
    return {
      hasError: true,
      message: parsed ? parsed.error : error.message || 'Unexpected application error.',
      details: parsed,
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('MoonArt ErrorBoundary caught error:', error, info);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen w-screen bg-[#030e17] text-cyan-50 flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-[#071b2a] border border-rose-400/35 rounded-2xl shadow-2xl p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-400/30 text-rose-300 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-lg font-bold text-cyan-50">
                MoonArt Connection or Permission Error
              </h2>
              <p className="text-xs text-cyan-200/75 mt-1 break-words">{this.state.message}</p>
            </div>
          </div>

          {this.state.details && (
            <div className="rounded-lg bg-[#04111d] border border-cyan-400/15 p-3 text-[11px] font-mono-tabular text-cyan-200/80 space-y-1">
              <div>Operation: {this.state.details.operationType}</div>
              <div>Path: {this.state.details.path ?? 'n/a'}</div>
              <div>User: {this.state.details.authInfo.userId ?? 'signed-out'}</div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, message: '', details: null })}
              className="px-3.5 py-2 rounded-lg text-xs font-medium bg-[#0d2c42] hover:bg-[#134160] text-cyan-100 border border-cyan-400/20 transition-colors"
            >
              Continue Editing
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-[#03131f] flex items-center gap-1.5 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reload Studio</span>
            </button>
          </div>
        </div>
      </div>
    );
  }
}
