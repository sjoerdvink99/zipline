import React, { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('GraphBridge Error:', error, errorInfo);
    this.props.onError?.(error, errorInfo);

    if (import.meta.env.PROD) {
      console.warn('Production error detected - consider implementing error tracking service');
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="error-boundary p-8 border border-red-300 bg-red-50 rounded-lg">
          <h2 className="text-lg font-semibold text-red-800 mb-4">
            Something went wrong in GraphBridge
          </h2>
          <details className="mb-4">
            <summary className="cursor-pointer text-red-700 hover:text-red-900">
              Error details
            </summary>
            <pre className="mt-2 text-sm text-red-600 bg-red-100 p-2 rounded overflow-auto max-h-64">
              {this.state.error?.stack}
            </pre>
          </details>
          <button
            onClick={() => this.setState({ hasError: false, error: undefined })}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;