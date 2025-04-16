import React from 'react';
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
            defaultWidth={480}
            defaultHeight={220}
            minWidth={320}
            minHeight={120}
            defaultPosition={{ x: window.innerWidth / 2 - 240, y: 120 }}
        >
            <div className="flex flex-col gap-4">
                <label htmlFor="share-url" className="font-medium">Shareable URL:</label>
                <input
                    id="share-url"
                    type="text"
                    value={shareUrl}
                    readOnly
                    className="w-full px-2 py-1 border rounded bg-muted text-xs font-mono"
                    onFocus={e => e.target.select()}
                />
                <div className="flex gap-2">
                    <button className="btn btn-outline btn-sm" onClick={onCopy}>
                        {shareCopied ? 'Copied!' : 'Copy to Clipboard'}
                    </button>
                    <button className="btn btn-outline btn-sm" onClick={onShareEmail}>
                        Share via Email
                    </button>
                </div>
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
    return (
        <>
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
            </ModalPortal>
        </>
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