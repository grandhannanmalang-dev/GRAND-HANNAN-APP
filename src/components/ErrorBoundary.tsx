import React from 'react';
import { AlertTriangle, Home, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  onGoHome?: () => void;
  resetKey?: string | number;
  title?: string;
  description?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  declare props: Readonly<ErrorBoundaryProps>;
  declare state: ErrorBoundaryState;
  declare setState: (
    state:
      | ErrorBoundaryState
      | Partial<ErrorBoundaryState>
      | ((prevState: Readonly<ErrorBoundaryState>) => ErrorBoundaryState | Partial<ErrorBoundaryState> | null),
    callback?: () => void
  ) => void;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
    };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
        ? error
        : 'Terjadi kesalahan saat menampilkan halaman.';
    return {
      hasError: true,
      errorMessage: message,
    };
  }

  componentDidCatch(error: unknown, errorInfo: React.ErrorInfo): void {
    console.error('UI ErrorBoundary caught an error:', error, errorInfo);
  }

  componentDidUpdate(prevProps: Readonly<ErrorBoundaryProps>): void {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, errorMessage: '' });
    }
  }

  handleGoHome = () => {
    this.setState({ hasError: false, errorMessage: '' });
    if (this.props.onGoHome) {
      this.props.onGoHome();
    }
  };

  handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-[360px] w-full flex items-center justify-center p-5">
        <div className="max-w-md w-full bg-white dark:bg-[#111c2e] border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 text-center shadow-lg space-y-4">
          <div className="w-12 h-12 aspect-square mx-auto rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-6 h-6 stroke-[2]" />
          </div>

          <div className="space-y-1.5">
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
              {this.props.title || 'Terjadi Gangguan Tampilan'}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {this.props.description ||
                'Halaman mengalami kendala sementara. Anda dapat kembali ke Beranda atau memuat ulang aplikasi.'}
            </p>
          </div>

          {this.state.errorMessage && (
            <div className="text-left bg-slate-50 dark:bg-[#0b1322] border border-slate-200/80 dark:border-slate-800 rounded-2xl p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                Info Teknis
              </p>
              <p className="text-xs font-mono text-slate-700 dark:text-slate-300 break-words line-clamp-3">
                {this.state.errorMessage}
              </p>
            </div>
          )}

          <div className="space-y-2.5 pt-1">
            {this.props.onGoHome && (
              <button
                type="button"
                onClick={this.handleGoHome}
                className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl bg-[#0088f8] hover:bg-[#0070e0] text-white text-sm font-bold transition-colors cursor-pointer"
              >
                <Home className="w-4 h-4" />
                <span>Kembali ke Beranda</span>
              </button>
            )}

            <button
              type="button"
              onClick={this.handleReload}
              className={`w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold transition-colors cursor-pointer ${
                this.props.onGoHome
                  ? 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
                  : 'bg-[#0088f8] hover:bg-[#0070e0] text-white'
              }`}
            >
              <RefreshCw className="w-4 h-4" />
              <span>Muat Ulang Aplikasi</span>
            </button>
          </div>
        </div>
      </div>
    );
  }
}
