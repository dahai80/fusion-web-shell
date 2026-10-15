import { Component, type ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    error: Error | null;
}

/** Host-side ErrorBoundary (PRD §7.2): shell bug must not white-screen the whole shell. */
export class ErrorBoundary extends Component<Props, State> {
    state: State = { error: null };

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    componentDidCatch(error: Error): void {
        console.error('[shell] uncaught error in host UI:', error);
    }

    render() {
        if (this.state.error) {
            return (
                <div className="flex h-screen flex-col items-center justify-center gap-3 bg-bg p-8">
                    <div className="text-error">Shell 内部错误</div>
                    <div className="max-w-md text-center font-mono text-xs text-text-muted">
                        {this.state.error.message}
                    </div>
                    <button
                        type="button"
                        onClick={() => this.setState({ error: null })}
                        className="rounded-md border border-border px-4 py-2 text-sm"
                    >
                        重试
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}
