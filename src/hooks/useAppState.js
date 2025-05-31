import { useState } from 'react';

/**
 * Custom hook to manage modal and UI state
 */
export function useModalState() {
  const [isChatVisible, setIsChatVisible] = useState(false);
  const [isSatelliteListVisible, setIsSatelliteListVisible] = useState(false);
  const [debugWindows, setDebugWindows] = useState([]);
  const [isDisplayOptionsOpen, setIsDisplayOptionsOpen] = useState(false);
  const [isSatelliteModalOpen, setIsSatelliteModalOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isSimulationOpen, setIsSimulationOpen] = useState(false);
  const [isGroundtrackOpen, setIsGroundtrackOpen] = useState(false);
  const [openPointModals, setOpenPointModals] = useState([]);

  const togglers = {
    onChatToggle: () => setIsChatVisible(!isChatVisible),
    onSatelliteListToggle: () => setIsSatelliteListVisible(!isSatelliteListVisible),
    onDisplayOptionsToggle: () => setIsDisplayOptionsOpen(!isDisplayOptionsOpen),
    onSatelliteCreatorToggle: () => setIsSatelliteModalOpen(!isSatelliteModalOpen),
    onSimulationToggle: () => setIsSimulationOpen(!isSimulationOpen),
    onGroundtrackToggle: () => setIsGroundtrackOpen(!isGroundtrackOpen),
  };

  return {
    // States
    isChatVisible,
    isSatelliteListVisible,
    debugWindows,
    isDisplayOptionsOpen,
    isSatelliteModalOpen,
    shareModalOpen,
    isAuthOpen,
    isSimulationOpen,
    isGroundtrackOpen,
    openPointModals,
    
    // Setters
    setIsChatVisible,
    setIsSatelliteListVisible,
    setDebugWindows,
    setIsDisplayOptionsOpen,
    setIsSatelliteModalOpen,
    setShareModalOpen,
    setIsAuthOpen,
    setIsSimulationOpen,
    setIsGroundtrackOpen,
    setOpenPointModals,
    
    // Togglers
    ...togglers
  };
}