import React from 'react';
import PropTypes from 'prop-types';
import { Button } from '../button';

/**
 * Error boundary for maneuver node components
 * Catches errors and provides recovery options with enhanced performance
 */
export class ManeuverErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null,
            errorId: null // Track unique error instances
        };

        // Bind methods once in constructor
        this.handleReset = this.handleReset.bind(this);
        this.handleClose = this.handleClose.bind(this);

        // Cache error details to prevent unnecessary re-renders
        this.errorCacheRef = React.createRef();
        this.errorCacheRef.current = {
            lastErrorMessage: null,
            lastErrorTime: null,
            errorCount: 0
        };
    }

    static getDerivedStateFromError(error) {
        // Update state efficiently with error tracking
        const errorId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        return {
            hasError: true,
            errorId,
            error: error?.message || 'Unknown error'
        };
    }

    componentDidCatch(error, errorInfo) {
        // Enhanced error logging with deduplication
        const errorMessage = error?.message || error?.toString() || 'Unknown error';
        const currentTime = Date.now();

        // Prevent duplicate error logging within 1 second
        if (this.errorCacheRef.current) {
            const { lastErrorMessage, lastErrorTime } = this.errorCacheRef.current;

            if (lastErrorMessage === errorMessage &&
                currentTime - lastErrorTime < 1000) {
                return; // Skip duplicate error
            }

            // Update error cache
            this.errorCacheRef.current = {
                lastErrorMessage: errorMessage,
                lastErrorTime: currentTime,
                errorCount: this.errorCacheRef.current.errorCount + 1
            };
        }

        // Log error details for debugging
        console.error('[ManeuverErrorBoundary] Error caught:', {
            error: error,
            errorInfo: errorInfo,
            timestamp: new Date().toISOString(),
            errorCount: this.errorCacheRef.current?.errorCount || 1
        });

        // Store error details in state for display
        this.setState({
            error: error,
            errorInfo: errorInfo
        });
    }

    handleReset() {
        // Reset with cache clearing
        this.setState({
            hasError: false,
            error: null,
            errorInfo: null,
            errorId: null
        });

        // Clear error cache
        if (this.errorCacheRef.current) {
            this.errorCacheRef.current.errorCount = 0;
        }
    }

    handleClose() {
        // Memoized close handler
        if (this.props.onClose) {
            this.props.onClose();
        }
    }

    // Memoized render method optimizations
    renderErrorDetails() {
        const { error, errorInfo } = this.state;

        if (!import.meta.env.DEV || !error) {
            return null;
        }

        return (
            <details className="mb-4">
                <summary className="cursor-pointer text-sm font-medium text-red-700 dark:text-red-300">
                    Technical Details
                </summary>
                <pre className="mt-2 text-xs bg-red-100 dark:bg-red-900 p-2 rounded overflow-auto max-h-32">
                    {error.toString()}
                    {errorInfo?.componentStack}
                </pre>
            </details>
        );
    }

    renderErrorActions() {
        const { onClose } = this.props;

        return (
            <div className="flex gap-2">
                <Button
                    onClick={this.handleReset}
                    variant="default"
                    size="sm"
                    className="min-w-[80px]"
                >
                    Try Again
                </Button>
                {onClose && (
                    <Button
                        onClick={this.handleClose}
                        variant="outline"
                        size="sm"
                        className="min-w-[80px]"
                    >
                        Close Window
                    </Button>
                )}
            </div>
        );
    }

    renderErrorMessage() {
        const errorCount = this.errorCacheRef.current?.errorCount || 1;

        return (
            <>
                <h3 className="text-lg font-semibold text-red-700 dark:text-red-300 mb-2">
                    Maneuver Planning Error
                    {errorCount > 1 && (
                        <span className="text-sm ml-2 opacity-75">
                            ({errorCount} occurrences)
                        </span>
                    )}
                </h3>
                <p className="text-sm text-red-600 dark:text-red-400 mb-3">
                    An error occurred in the maneuver planning system. This might be due to:
                </p>
                <ul className="list-disc list-inside text-sm text-red-600 dark:text-red-400 mb-4 space-y-1">
                    <li>Invalid orbital parameters</li>
                    <li>Simulation not fully loaded</li>
                    <li>Temporary calculation error</li>
                    <li>Network or data synchronization issue</li>
                </ul>
            </>
        );
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="p-4 border border-red-500 rounded-lg bg-red-50 dark:bg-red-950">
                    {this.renderErrorMessage()}
                    {this.renderErrorDetails()}
                    {this.renderErrorActions()}
                </div>
            );
        }

        return this.props.children;
    }

    // Component lifecycle optimization
    componentDidUpdate(prevProps) {
        // Clear error state if children change (potential recovery)
        if (prevProps.children !== this.props.children && this.state.hasError) {
            const timeSinceError = Date.now() - (this.errorCacheRef.current?.lastErrorTime || 0);

            // Auto-reset if significant time has passed and children changed
            if (timeSinceError > 5000) { // 5 seconds
                this.handleReset();
            }
        }
    }

    // Cleanup on unmount
    componentWillUnmount() {
        // Clear any cached error data
        if (this.errorCacheRef.current) {
            this.errorCacheRef.current = null;
        }
    }

    // Error boundary with retry logic
    static getDerivedStateFromProps(props, state) {
        // Reset error state if key prop changes (new satellite, etc.)
        if (props.resetKey && props.resetKey !== state.lastResetKey) {
            return {
                ...state,
                hasError: false,
                error: null,
                errorInfo: null,
                errorId: null,
                lastResetKey: props.resetKey
            };
        }

        return null;
    }
}

ManeuverErrorBoundary.propTypes = {
    children: PropTypes.node.isRequired,
    onClose: PropTypes.func,
    resetKey: PropTypes.oneOfType([PropTypes.string, PropTypes.number]) // Optional reset trigger
};

// Default props for better performance
ManeuverErrorBoundary.defaultProps = {
    onClose: null,
    resetKey: null
};

export default ManeuverErrorBoundary;