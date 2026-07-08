import { Component, ReactNode } from 'react'
import { logError } from '../../lib/telemetry'
import { MdRefresh, MdBugReport } from 'react-icons/md'

interface Props {
  children:    ReactNode
  fallbackTitle?: string
}

interface State {
  error: Error | null
  logged: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, logged: false }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    if (!this.state.logged) {
      logError({
        errorType: 'JS_ERROR',
        message:   error.message,
        context:   {
          name:            error.name,
          stack:           error.stack,
          componentStack:  info.componentStack,
        },
      })
      this.setState({ logged: true })
    }
  }

  render() {
    if (!this.state.error) return this.props.children

    const title = this.props.fallbackTitle ?? 'Something went wrong'

    return (
      <div className="flex-1 flex items-center justify-center p-10">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-8 max-w-md w-full text-center space-y-4">
          <div className="inline-flex items-center justify-center bg-red-100 rounded-full p-4">
            <MdBugReport className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-lg font-bold text-red-800">{title}</h2>
          <p className="text-sm text-red-600 font-mono bg-red-100 rounded-lg px-4 py-3 text-left break-all">
            {this.state.error.message}
          </p>
          <p className="text-xs text-red-500">
            This error has been logged. If it persists, run the latest SQL migration in
            the Supabase SQL Editor and refresh.
          </p>
          <button
            onClick={() => { this.setState({ error: null, logged: false }); window.location.reload() }}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 transition-colors"
          >
            <MdRefresh className="w-4 h-4" /> Reload Page
          </button>
        </div>
      </div>
    )
  }
}
