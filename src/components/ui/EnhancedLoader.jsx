import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

const EnhancedLoader = ({ loadingProgress, loadingStage }) => {
  const [currentCapability, setCurrentCapability] = useState(0);
  const [currentMission, setCurrentMission] = useState(0);
  const [backgroundImage, setBackgroundImage] = useState('');
  
  // Darksun capabilities showcase
  const capabilities = [
    { 
      title: "Satellite Constellation Design", 
      desc: "Deploy and manage hundreds of satellites across multiple orbital planes",
      tech: "Multi-body physics • SOI transitions • Precise ephemeris"
    },
    { 
      title: "Interplanetary Mission Planning", 
      desc: "Calculate transfer windows and trajectories to any celestial body",
      tech: "Hohmann transfers • Gravity assists • Lambert solvers"
    },
    { 
      title: "Communication Network Analysis", 
      desc: "Design space communication links with line-of-sight modeling",
      tech: "Ground stations • Inter-satellite links • Coverage analysis"
    },
    { 
      title: "AI-Powered Mission Design", 
      desc: "Let Darksun's AI assist with orbital mechanics and mission planning",
      tech: "Natural language • Real-time physics • Expert guidance"
    }
  ];

  // Mission examples that rotate
  const missionExamples = [
    "Deploying a Mars communication relay constellation",
    "Planning a Europa sample return mission",
    "Designing a lunar mining operation supply chain", 
    "Creating a solar observation satellite network",
    "Establishing an asteroid belt monitoring system"
  ];

  // NASA and Cassini space images for random background selection
  const spaceImages = [
    "/assets/images/jupiter_nasa.jpg",
    "/assets/images/space_nasa.jpg", 
    "/assets/images/mars_nasa.jpg",
    "/assets/images/tethys_nasa.jpg",
    "/assets/images/saturn_cassini.jpg",
    "/assets/images/earth_NASA.jpg"
  ];

  // Select random background image on component mount
  useEffect(() => {
    const randomIndex = Math.floor(Math.random() * spaceImages.length);
    setBackgroundImage(spaceImages[randomIndex]);
  }, []);

  // Rotate capabilities every 3.5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentCapability((prev) => (prev + 1) % capabilities.length);
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  // Rotate mission examples every 2.8 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentMission((prev) => (prev + 1) % missionExamples.length);
    }, 2800);
    return () => clearInterval(interval);
  }, []);

  const progressWidth = Math.max(0, Math.min(100, loadingProgress));
  const isComplete = progressWidth >= 100;

  // DataRow component matching app style
  const DataRow = ({ label, value, unit = '' }) => (
    <div className="grid grid-cols-2 gap-1">
      <span className="text-xs text-muted-foreground truncate">{label}:</span>
      <span className="text-xs font-mono text-foreground">
        {value} {unit && <span className="text-muted-foreground">{unit}</span>}
      </span>
    </div>
  );

  DataRow.propTypes = {
    label: PropTypes.string.isRequired,
    value: PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.number
    ]).isRequired,
    unit: PropTypes.string
  };

  return (
    <div 
      className="fixed inset-0 bg-black text-white overflow-hidden" 
      style={{ zIndex: 9999 }}
    >
      {/* NASA/Cassini space image background with opacity */}
      {backgroundImage && (
        <div 
          className="absolute inset-0"
          style={{ 
            backgroundImage: `url(${backgroundImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            opacity: 0.3
          }}
        />
      )}
      
      {/* Main content container */}
      <div className="flex flex-col h-full relative z-10">
        
        {/* Top progress bar */}
        <div className="w-full h-1 bg-zinc-900">
          <div 
            className="h-full bg-white transition-all duration-500"
            style={{ width: `${progressWidth}%` }}
          />
        </div>

        {/* Central mission briefing area */}
        <div className="flex-1 flex items-center justify-center px-8">
          <div className="max-w-4xl w-full grid grid-cols-1 lg:grid-cols-2 gap-12">
            
            {/* Left: Welcome & Mission */}
            <div className="space-y-8">
              <div className="text-center lg:text-left">
                <h1 className="text-4xl font-bold mb-2">DARKSUN</h1>
                <div className="text-zinc-400 text-sm font-mono mb-6">
                  ORBITAL MECHANICS SIMULATION PLATFORM
                </div>
                
                {isComplete ? (
                  <div className="text-green-400 text-lg font-semibold">
                    SYSTEM READY • MISSION CONTROL ONLINE
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-white text-lg">
                      Initializing Mission Control Systems
                    </div>
                    <div className="text-zinc-400 text-sm font-mono">
                      {loadingStage}
                    </div>
                  </div>
                )}
              </div>

              {/* Mission example */}
              <div className="bg-zinc-900/50 border border-zinc-800 p-4">
                <div className="text-xs text-zinc-500 mb-2 font-mono">MISSION EXAMPLE</div>
                <div className="text-sm text-zinc-300 font-mono transition-opacity duration-300">
                  {missionExamples[currentMission]}
                </div>
              </div>
            </div>

            {/* Right: Capabilities showcase */}
            <div className="space-y-6">
              <div className="text-center lg:text-left">
                <h2 className="text-xl font-semibold mb-4">Platform Capabilities</h2>
              </div>
              
              <div className="bg-zinc-900/30 border border-zinc-800 p-6 min-h-[200px]">
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold text-white">
                      {capabilities[currentCapability].title}
                    </div>
                  </div>
                  
                  <div className="text-sm text-zinc-300 leading-relaxed">
                    {capabilities[currentCapability].desc}
                  </div>
                  
                  <div className="pt-2 border-t border-zinc-800">
                    <div className="text-xs text-zinc-500 font-mono">
                      {capabilities[currentCapability].tech}
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick stats */}
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="bg-zinc-900/50 border border-zinc-800 p-3">
                  <div className="text-zinc-500 font-mono">PHYSICS ENGINE</div>
                  <div className="text-white font-mono">N-Body Dynamics</div>
                </div>
                <div className="bg-zinc-900/50 border border-zinc-800 p-3">
                  <div className="text-zinc-500 font-mono">AI ASSISTANT</div>
                  <div className="text-white font-mono">Mission Planning</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom status bar */}
        <div className="bg-zinc-950/90 border-t border-zinc-800 px-6 py-3">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-6">
              <DataRow label="Status" value={isComplete ? "READY" : "LOADING"} />
              <DataRow label="Progress" value={`${Math.round(progressWidth)}/100`} unit="%" />
              {!isComplete && (
                <div className="flex items-center gap-2">
                  <span className="text-zinc-400 font-mono">Calibrating orbital mechanics...</span>
                </div>
              )}
            </div>
            
            <div className="text-zinc-500 font-mono">
              DARKSUN v2.0 • Solar System Barycentric Reference Frame
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

EnhancedLoader.propTypes = {
  loadingProgress: PropTypes.number.isRequired,
  loadingStage: PropTypes.string.isRequired
};

export default EnhancedLoader;