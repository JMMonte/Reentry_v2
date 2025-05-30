import { useState, useRef } from 'react';
import LZString from 'lz-string';

/**
 * Custom hook to manage simulation state sharing
 */
export function useSimulationSharing(app3d, toastRef) {
  const [shareUrl, setShareUrl] = useState('');
  const [shareCopied, setShareCopied] = useState(false);
  const ignoreNextHashChange = useRef(false);

  const saveSimulationState = () => {
    if (!app3d) return;
    
    const state = app3d.exportSimulationState();
    const json = JSON.stringify(state);
    const compressed = LZString.compressToEncodedURIComponent(json);
    ignoreNextHashChange.current = true;
    window.location.hash = `state=${compressed}`;
    toastRef.current?.showToast('Sim saved');
  };

  const handleCopyShareUrl = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 1500);
    } catch (err) {
      alert('Failed to copy URL: ' + err.message);
    }
  };

  const handleShareViaEmail = () => {
    const subject = encodeURIComponent('Check out this simulation state!');
    const body = encodeURIComponent(`Open this link to load the simulation state:
${shareUrl}`);
    window.open(`mailto:?subject=${subject}&body=${body}`);
  };

  const handleImportState = (event, setDisplaySettings, setImportedState, getInitialDisplaySettings) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const state = JSON.parse(e.target.result);
        if (!app3d) return;
        
        if (typeof app3d.importSimulationState === 'function') {
          app3d.importSimulationState(state);
        }
        
        if (state.displaySettings) {
          setDisplaySettings(getInitialDisplaySettings(state));
        }
        
        setImportedState(state);
        const json = JSON.stringify(state);
        const compressed = LZString.compressToEncodedURIComponent(json);
        ignoreNextHashChange.current = true;
        window.location.hash = `state=${compressed}`;
        toastRef.current?.showToast('Sim saved');
      } catch (err) {
        alert('Failed to import simulation state: ' + err.message);
      }
    };
    
    reader.readAsText(file);
    event.target.value = '';
  };

  return {
    shareUrl,
    setShareUrl,
    shareCopied,
    setShareCopied,
    ignoreNextHashChange,
    saveSimulationState,
    handleCopyShareUrl,
    handleShareViaEmail,
    handleImportState
  };
}