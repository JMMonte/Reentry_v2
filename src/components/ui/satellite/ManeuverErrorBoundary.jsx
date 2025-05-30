import React from 'react';
import PropTypes from 'prop-types';
import { Button } from '../button';

/**
 * Error boundary for maneuver node components
 * Catches errors and provides recovery options
 */
export class ManeuverErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError() {
        // Update state so the next render will show the fallback UI
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        // Log error details for debugging
        console.error('ManeuverErrorBoundary caught error:', error);
        console.error('Error info:', errorInfo);
        
        // Store error details in state
        this.setState({
            error: error,
            errorInfo: errorInfo
        });
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null, errorInfo: null });
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="p-4 border border-red-500 rounded-lg bg-red-50 dark:bg-red-950">
                    <h3 className="text-lg font-semibold text-red-700 dark:text-red-300 mb-2">
                        Maneuver Planning Error
                    </h3>
                    <p className="text-sm text-red-600 dark:text-red-400 mb-3">
                        An error occurred in the maneuver planning system. This might be due to:
                    </p>
                    <ul className="list-disc list-inside text-sm text-red-600 dark:text-red-400 mb-4 space-y-1">
                        <li>Invalid orbital parameters</li>
                        <li>Simulation not fully loaded</li>
                        <li>Temporary calculation error</li>
                    </ul>
                    
                    {import.meta.env.DEV && this.state.error && (
                        <details className="mb-4">
                            <summary className="cursor-pointer text-sm font-medium text-red-700 dark:text-red-300">
                                Technical Details
                            </summary>
                            <pre className="mt-2 text-xs bg-red-100 dark:bg-red-900 p-2 rounded overflow-auto">
                                {this.state.error.toString()}
                                {this.state.errorInfo?.componentStack}
                            </pre>
                        </details>
                    )}
                    
                    <div className="flex gap-2">
                        <Button
                            onClick={this.handleReset}
                            variant="default"
                            size="sm"
                        >
                            Try Again
                        </Button>
                        {this.props.onClose && (
                            <Button
                                onClick={this.props.onClose}
                                variant="outline"
                                size="sm"
                            >
                                Close Window
                            </Button>
                        )}
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

ManeuverErrorBoundary.propTypes = {
    children: PropTypes.node.isRequired,
    onClose: PropTypes.func
};

export default ManeuverErrorBoundary;