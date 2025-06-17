import React, { createContext, useContext, useState, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react';
import PropTypes from 'prop-types';

// Toast Context
const ToastContext = createContext();

// ✅ OPTIMIZED PATTERN: Memoized Toast item component
const ToastItem = React.memo(function ToastItem({ toast, onRemove }) {
  const handleRemove = useCallback(() => {
    onRemove(toast.id);
  }, [toast.id, onRemove]);

  // Memoized toast styles based on type
  const toastStyles = useMemo(() => ({
    success: 'bg-green-600 text-white border-green-700',
    error: 'bg-red-600 text-white border-red-700',
    warning: 'bg-yellow-600 text-white border-yellow-700',
    info: 'bg-blue-600 text-white border-blue-700'
  }), []);

  const toastClass = useMemo(() => 
    `fixed top-4 right-4 p-4 rounded-lg border shadow-lg z-50 min-w-64 max-w-96 transition-all duration-300 ${
      toastStyles[toast.type] || toastStyles.info
    }`,
    [toast.type, toastStyles]
  );

  return (
    <div className={toastClass}>
      <div className="flex justify-between items-start">
        <div>
          {toast.title && <div className="font-semibold text-sm">{toast.title}</div>}
          <div className="text-sm">{toast.message}</div>
        </div>
        <button
          onClick={handleRemove}
          className="ml-4 text-white hover:text-gray-200 transition-colors"
          aria-label="Close"
        >
          ×
        </button>
      </div>
    </div>
  );
});

ToastItem.propTypes = {
  toast: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    type: PropTypes.oneOf(['success', 'error', 'warning', 'info']).isRequired,
    title: PropTypes.string,
    message: PropTypes.string.isRequired
  }).isRequired,
  onRemove: PropTypes.func.isRequired
};

// ✅ OPTIMIZED PATTERN: Memoized ToastProvider component with forwardRef support
export const ToastProvider = React.memo(forwardRef(function ToastProvider({ children }, ref) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((type, message, title = null, duration = 5000) => {
    const id = Date.now() + Math.random();
    const newToast = { id, type, message, title };
    
    setToasts(prev => [...prev, newToast]);
    
    // Auto-remove after duration
    setTimeout(() => {
      setToasts(prev => prev.filter(toast => toast.id !== id));
    }, duration);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  // Expose the showToast method through the ref for legacy compatibility
  useImperativeHandle(ref, () => ({
    showToast: (message) => showToast('info', message) // Legacy single-parameter support
  }), [showToast]);

  // Memoized context value to prevent unnecessary re-renders
  const contextValue = useMemo(() => ({
    showToast
  }), [showToast]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
      ))}
    </ToastContext.Provider>
  );
}));

ToastProvider.propTypes = {
  children: PropTypes.node.isRequired
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};