/**
 * Utility functions to build props objects for components
 * This helps organize and type-check component props
 */

import { getSocket } from '../socket.js';
import { solarSystemDataManager } from '../physics/PlanetaryDataManager.js';

export function buildNavbarProps({
  modalState,
  selectedBody,
  handleBodyChange,
  groupedPlanetOptions,
  satelliteOptions,
  getDisplayValue,
  app3d,
  timeWarpLoading,
  simTime,
  timeWarp,
  handleSimulatedTimeChange,
  satellites,
  handleImportState,
  shareModalOpen,
  setShareModalOpen,
  setShareUrl,
  isAuthOpen,
  setIsAuthOpen,
  setAuthMode,
  isSimulationOpen,
  setIsSimulationOpen,
  planetOptions,
  onTimeWarpChange
}) {
  return {
    onChatToggle: modalState.onChatToggle,
    onSatelliteListToggle: modalState.onSatelliteListToggle,
    onDisplayOptionsToggle: modalState.onDisplayOptionsToggle,
    onSatelliteCreatorToggle: modalState.onSatelliteCreatorToggle,
    onSimulationToggle: modalState.onSimulationToggle,
    onGroundtrackToggle: modalState.onGroundtrackToggle,
    isChatVisible: modalState.isChatVisible,
    isSatelliteListVisible: modalState.isSatelliteListVisible,
    isDisplayOptionsOpen: modalState.isDisplayOptionsOpen,
    isSatelliteModalOpen: modalState.isSatelliteModalOpen,
    selectedBody,
    onBodySelect: handleBodyChange,
    groupedPlanetOptions,
    satelliteOptions,
    getDisplayValue,
    timeWarp,
    timeWarpLoading,
    timeWarpOptions: app3d?.physicsIntegration?.getTimeWarpOptions() ?? [0, 0.25, 1, 3, 10, 30, 100, 300, 1000, 3000, 10000, 30000, 100000, 1000000, 10000000],
    onTimeWarpChange,
    simulatedTime: simTime,
    onSimulatedTimeChange: handleSimulatedTimeChange,
    app3DRef: { current: app3d },
    satellites: Object.values(satellites),
    onShareState: undefined,
    onImportState: handleImportState,
    shareModalOpen,
    setShareModalOpen,
    setShareUrl,
    isAuthOpen,
    setIsAuthOpen,
    setAuthMode,
    simulationOpen: isSimulationOpen,
    setSimulationOpen: setIsSimulationOpen,
    planetOptions
  };
}

export function buildModalProps({
  modalState,
  displaySettings,
  setDisplaySettings,
  app3d,
  satellites,
  selectedBody,
  handleBodyChange,
  debugWindows,
  onCreateSatellite,
  availableBodies,
  shareUrl,
  shareCopied,
  handleCopyShareUrl,
  handleShareViaEmail,
  authMode,
  setAuthMode,
  showToast,
  satellitesPhysics,
  simTime,
  centralizedBodies = {},
  planetOptions = [],
  groupedPlanetOptions = []
}) {
  return {
    chatModal: {
      isOpen: modalState.isChatVisible,
      onClose: () => modalState.setIsChatVisible(false),
      socket: getSocket()
    },

    displayOptions: {
      settings: displaySettings,
      onSettingChange: (key, value) => {
        if (app3d?.displaySettingsManager) {
          // Update through DisplaySettingsManager - it will handle batching and coordination
          app3d.displaySettingsManager.updateSetting(key, value);
          // Update React state to keep UI in sync - this is necessary for React components
          setDisplaySettings(prev => ({ ...prev, [key]: value }));
        } else if (app3d) {
          // Fallback to legacy method if DisplaySettingsManager not available
          app3d.updateDisplaySetting(key, value);
          setDisplaySettings(prev => ({ ...prev, [key]: value }));
        }
      },
      isOpen: modalState.isDisplayOptionsOpen,
      onOpenChange: modalState.setIsDisplayOptionsOpen,
      app3DRef: { current: app3d },
      physicsProviderType: 'local'
    },

    satelliteListWindow: {
      satellites,
      isOpen: modalState.isSatelliteListVisible,
      setIsOpen: modalState.setIsSatelliteListVisible,
      onBodySelect: handleBodyChange,
      debugWindows,
      app3d
    },

    satelliteCreatorModal: (() => {
      // Find matching body in availableBodies based on current selection using data-driven approach
      let preselectedBody = null;

      if (selectedBody && selectedBody !== 'none') {
        // Check if a satellite is selected
        if (selectedBody.startsWith('satellite-')) {
          // Extract satellite ID and find its central body
          const satelliteId = selectedBody.replace('satellite-', '');
          // Use satellitesPhysics which has the physics state with centralBodyNaifId
          const satellite = satellitesPhysics ? satellitesPhysics[satelliteId] : null;

          if (satellite && satellite.centralBodyNaifId) {
            // Find the central body of the selected satellite
            preselectedBody = availableBodies.find(body =>
              body.naifId === satellite.centralBodyNaifId
            );
          }
        } else {
          // Strategy 1: Direct name match (case-insensitive)
          preselectedBody = availableBodies.find(body =>
            body.name && body.name.toLowerCase() === selectedBody.toLowerCase()
          );

          // Strategy 2: Use planetary data manager if available and initialized
          if (!preselectedBody && solarSystemDataManager?.initialized) {
            const bodyConfig = solarSystemDataManager.getBodyByName(selectedBody.toLowerCase());

            if (bodyConfig) {
              // Try to find by NAIF ID (most reliable identifier)
              preselectedBody = availableBodies.find(body =>
                body.naifId === bodyConfig.naif_id
              );

              // Try by astronomy engine name if NAIF ID didn't work
              if (!preselectedBody && bodyConfig.astronomyEngineName) {
                preselectedBody = availableBodies.find(body =>
                  body.name.toLowerCase() === bodyConfig.astronomyEngineName.toLowerCase()
                );
              }
            }
          }

          // Strategy 3: Fallback - search through all available bodies for any reasonable match
          // This handles cases where the data manager isn't ready yet
          if (!preselectedBody) {
            const searchTerm = selectedBody.toLowerCase();
            preselectedBody = availableBodies.find(body => {
              const bodyName = body.name.toLowerCase();
              // Exact match, contains match, or common variations
              return bodyName === searchTerm ||
                bodyName.includes(searchTerm) ||
                searchTerm.includes(bodyName);
            });
          }
        }
      }

      // If availableBodies is empty or doesn't have what we need, convert from planetOptions as fallback
      let finalAvailableBodies = availableBodies;
      if (!finalAvailableBodies || finalAvailableBodies.length === 0) {
        // Convert from the same source the navbar uses
        finalAvailableBodies = (planetOptions || []).map(option => ({
          name: option.text || option.name,
          naifId: option.naifId || option.naif_id,
          type: option.type || 'planet'
        })).filter(body => body.naifId !== undefined && body.naifId !== null);
        
        // Also try to extract from groupedPlanetOptions if planetOptions is not available
        if (finalAvailableBodies.length === 0 && groupedPlanetOptions) {
          // Flatten groupedPlanetOptions to get all planets and moons
          const allBodies = [];
          groupedPlanetOptions.forEach(group => {
            if (group.planet) {
              allBodies.push({
                name: group.planet.text || group.planet.name,
                naifId: group.planet.naifId || group.planet.naif_id,
                type: 'planet'
              });
            }
            if (group.moons) {
              group.moons.forEach(moon => {
                allBodies.push({
                  name: moon.text || moon.name,
                  naifId: moon.naifId || moon.naif_id,
                  type: 'moon'
                });
              });
            }
          });
          
          // Filter out bodies without valid naifId and barycenters
          finalAvailableBodies = allBodies.filter(body => 
            body.naifId !== undefined && 
            body.naifId !== null &&
            !body.name.toLowerCase().includes('barycenter')
          );
        }
        
        // Ensure we have at least Earth as fallback
        if (finalAvailableBodies.length === 0) {
          finalAvailableBodies = [{ name: 'Earth', naifId: 399, type: 'planet' }];
        }
      }

      return {
        isOpen: modalState.isSatelliteModalOpen,
        onClose: () => modalState.setIsSatelliteModalOpen(false),
        onOpen: () => modalState.setIsSatelliteModalOpen(true),
        onCreate: onCreateSatellite,
        availableBodies: finalAvailableBodies,
        selectedBody: preselectedBody || finalAvailableBodies.find(b => b.name === 'Earth') || finalAvailableBodies[0]
      };
    })(),

    shareModal: {
      isOpen: modalState.shareModalOpen,
      onClose: () => modalState.setShareModalOpen(false),
      shareUrl,
      shareCopied,
      onCopy: handleCopyShareUrl,
      onShareEmail: handleShareViaEmail
    },

    authModal: {
      isOpen: modalState.isAuthOpen,
      onClose: () => modalState.setIsAuthOpen(false),
      mode: authMode,
      setMode: setAuthMode,
      onSignupSuccess: showToast
    },

    earthPointModal: {
      openModals: modalState.openPointModals,
      onToggle: (feature, category) => {
        modalState.setOpenPointModals(prev => {
          const isSame = prev.length === 1 && prev[0].feature === feature && prev[0].category === category;
          return isSame ? [] : [{ feature, category }];
        });
      }
    },

    groundTrackWindow: {
      isOpen: modalState.isGroundtrackOpen,
      onClose: () => modalState.setIsGroundtrackOpen(false),
      satellites: satellitesPhysics,
      planets: window.app3d?.celestialBodies || [],
      simulationTime: simTime,
      centralizedBodies: centralizedBodies,
      selectedBody: selectedBody, // Pass navbar's selected body
      onDataUpdate: (poiData, tracks, planet, currentPositions) => {
        modalState.setGroundTrackData({ poiData, tracks, planet, currentPositions });
      }
    },

    simulationWindow: {
      isOpen: modalState.isSimulationOpen,
      onClose: () => modalState.setIsSimulationOpen(false),
      app3d
    }
  };
}