import React, { useState, createContext, useRef, forwardRef, useImperativeHandle, useEffect } from 'react';
import { Navbar } from './ui/navbar/Navbar';
import { ModalPortal } from './ui/modal/ModalPortal';
import { AuthModal } from './ui/auth/AuthModal';
import { ChatModal } from './ui/chat/ChatModal';
import { DisplayOptions } from './ui/controls/DisplayOptions';
import { SatelliteDebugWindow } from './ui/satellite/SatelliteDebugWindow';
import { SatelliteListWindow } from './ui/satellite/SatelliteListWindow';
import { DraggableModal } from './ui/modal/DraggableModal';
import SatelliteCreator from './ui/satellite/SatelliteCreator';
import PropTypes from 'prop-types';
import { ResetPasswordModal } from './ui/auth/ResetPasswordModal';

// Toast logic
export const ToastContext = createContext({ showToast: () => { } });

const Toast = forwardRef((props, ref) => {
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
            }, 4000);
        }
    }), []);

    React.useEffect(() => {
        return () => hideTimeout.current && clearTimeout(hideTimeout.current);
    }, []);

    const handleClose = () => {
        if (hideTimeout.current) clearTimeout(hideTimeout.current);
        setVisible(false);
        setTimeout(() => setInternalMessage(''), 500);
    };

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
                    className={`transition-all duration-500 ease-in-out transform ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'} shadow-lg flex items-center justify-center`}
                    style={{
                        background: 'linear-gradient(90deg, #232526 0%, #414345 100%)',
                        color: '#fff',
                        padding: '10px 24px 10px 18px',
                        borderRadius: 12,
                        fontSize: 14,
                        fontWeight: 500,
                        boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
                        minWidth: 180,
                        textAlign: 'center',
                        letterSpacing: 0.2,
                        pointerEvents: 'auto',
                        position: 'relative',
                        maxWidth: 340,
                    }}
                >
                    <span style={{ flex: 1, fontSize: 14 }}>{internalMessage}</span>
                    <button
                        onClick={handleClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: '#fff',
                            fontSize: 18,
                            marginLeft: 12,
                            cursor: 'pointer',
                            pointerEvents: 'auto',
                            lineHeight: 1,
                        }}
                        aria-label="Close toast"
                    >
                        ×
                    </button>
                </div>
            )}
        </div>
    );
});
Toast.displayName = 'Toast';
Toast.propTypes = {};

// SatelliteCreatorModal
function SatelliteCreatorModal({ isOpen, onClose, onCreate }) {
    return (
        <DraggableModal
            title="Create Satellite"
            isOpen={isOpen}
            onClose={onClose}
            defaultWidth={400}
            defaultHeight={500}
            minWidth={300}
            minHeight={300}
            resizable={true}
        >
            <SatelliteCreator onCreateSatellite={onCreate} />
        </DraggableModal>
    );
}
SatelliteCreatorModal.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    onCreate: PropTypes.func.isRequired
};

// ShareModal
function ShareModal({ isOpen, onClose, shareUrl, shareCopied, onCopy, onShareEmail }) {
    return (
        <DraggableModal
            title="Share Simulation State"
            isOpen={isOpen}
            onClose={onClose}
            defaultWidth={380}
            defaultHeight={170}
            minWidth={260}
            minHeight={120}
            defaultPosition={{ x: window.innerWidth / 2 - 190, y: 120 }}
        >
            <div className="flex flex-col gap-2 text-xs">
                <label htmlFor="share-url" className="font-medium text-xs">Shareable URL:</label>
                <div className="flex gap-1 items-center">
                    <input
                        id="share-url"
                        type="text"
                        value={shareUrl}
                        readOnly
                        className="flex-1 px-2 py-1 border rounded bg-muted text-xs font-mono h-7"
                        onFocus={e => e.target.select()}
                        style={{ minWidth: 0 }}
                    />
                    <button className="btn btn-outline btn-sm text-xs px-2 h-7" onClick={onCopy}>
                        {shareCopied ? 'Copied!' : 'Copy'}
                    </button>
                </div>
                <button className="btn btn-outline btn-sm text-xs px-2 h-7 w-full" onClick={onShareEmail}>
                    Share via Email
                </button>
            </div>
        </DraggableModal>
    );
}
ShareModal.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    shareUrl: PropTypes.string.isRequired,
    shareCopied: PropTypes.bool.isRequired,
    onCopy: PropTypes.func.isRequired,
    onShareEmail: PropTypes.func.isRequired
};

export function Layout({
    children,
    navbarProps,
    chatModalProps,
    displayOptionsProps,
    debugWindows,
    satelliteListWindowProps,
    satelliteCreatorModalProps,
    shareModalProps,
    authModalProps
}) {
    const toastRef = useRef();
    const showToast = (msg) => {
        toastRef.current?.showToast(msg);
    };
    const [resetModalOpen, setResetModalOpen] = useState(false);

    // Open reset modal if URL contains type=recovery and access_token
    useEffect(() => {
        function getRecoveryParams() {
            // Try search params
            let params = new URLSearchParams(window.location.search);
            if (params.get('type') === 'recovery' && params.get('access_token')) return true;
            // Try hash fragment
            if (window.location.hash) {
                const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
                params = new URLSearchParams(hash);
                if (params.get('type') === 'recovery' && params.get('access_token')) return true;
            }
            return false;
        }
        if (getRecoveryParams()) {
            setResetModalOpen(true);
        }
    }, []);

    return (
        <ToastContext.Provider value={{ showToast }}>
            <Navbar {...navbarProps} />
            <main>{children}</main>
            <ModalPortal>
                <ChatModal {...chatModalProps} />
                <DisplayOptions {...displayOptionsProps} />
                {debugWindows && debugWindows.map(({ id, satellite, earth, onBodySelect, onClose }) => (
                    <SatelliteDebugWindow
                        key={id}
                        satellite={satellite}
                        earth={earth}
                        onBodySelect={onBodySelect}
                        onClose={onClose}
                    />
                ))}
                <SatelliteListWindow {...satelliteListWindowProps} />
                <SatelliteCreatorModal {...satelliteCreatorModalProps} />
                <ShareModal {...shareModalProps} />
                <AuthModal {...authModalProps} />
                <ResetPasswordModal isOpen={resetModalOpen} onClose={() => setResetModalOpen(false)} showToast={showToast} />
            </ModalPortal>
            <Toast ref={toastRef} />
        </ToastContext.Provider>
    );
}

Layout.propTypes = {
    children: PropTypes.node,
    navbarProps: PropTypes.object.isRequired,
    chatModalProps: PropTypes.object.isRequired,
    displayOptionsProps: PropTypes.object.isRequired,
    debugWindows: PropTypes.array,
    satelliteListWindowProps: PropTypes.object.isRequired,
    satelliteCreatorModalProps: PropTypes.object.isRequired,
    shareModalProps: PropTypes.object.isRequired,
    authModalProps: PropTypes.object.isRequired
}; 