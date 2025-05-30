import React, { createContext, useContext, useState, useRef, useImperativeHandle, useEffect } from 'react';
import PropTypes from 'prop-types';

// Toast Context
const ToastContext = createContext(null);

export function useToast() {
  return useContext(ToastContext);
}

// Toast Component
const Toast = React.forwardRef((props, ref) => {
  const [visible, setVisible] = useState(false);
  const [internalMessage, setInternalMessage] = useState('');
  const hideTimeout = useRef();

  useImperativeHandle(ref, () => ({
    showToast: (msg) => {
      setInternalMessage(msg);
      setVisible(true);
      if (hideTimeout.current) clearTimeout(hideTimeout.current);
      hideTimeout.current = setTimeout(() => {
        setVisible(false);
        hideTimeout.current = setTimeout(() => setInternalMessage(''), 500);
      }, 2000);
    }
  }), []);

  useEffect(() => {
    return () => hideTimeout.current && clearTimeout(hideTimeout.current);
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 32,
        display: 'flex',
        justifyContent: 'center',
        zIndex: 10000,
        pointerEvents: 'none',
      }}
    >
      {internalMessage && (
        <div
          className={`transition-all duration-500 ease-in-out transform ${
            visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          } shadow-lg`}
          style={{
            background: 'linear-gradient(90deg, #232526 0%, #414345 100%)',
            color: '#fff',
            padding: '14px 36px',
            borderRadius: 12,
            fontSize: 17,
            fontWeight: 500,
            boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
            minWidth: 220,
            textAlign: 'center',
            letterSpacing: 0.2,
            pointerEvents: 'auto',
          }}
        >
          {internalMessage}
        </div>
      )}
    </div>
  );
});

Toast.displayName = 'Toast';

// Toast Provider
export function ToastProvider({ children }) {
  const toastRef = useRef();
  const showToast = (msg) => toastRef.current?.showToast(msg);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <Toast ref={toastRef} />
    </ToastContext.Provider>
  );
}

ToastProvider.propTypes = {
  children: PropTypes.node.isRequired,
};