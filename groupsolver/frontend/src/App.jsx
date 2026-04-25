import React, { useState, Suspense, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars, Environment } from '@react-three/drei';
import Globe from './components/3d/Globe';
import AuraSessionManager from './components/ui/AuraSessionManager';
import VoiceOverlay from './components/ui/VoiceOverlay';
// import SearchInterface from './components/ui/SearchInterface';
import { AnimatePresence, motion } from 'framer-motion';
import gsap from 'gsap';
import * as THREE from 'three';

// Component to handle GSAP Camera animations
function CameraController({ destinations, sessionActive }) {
  const { camera, gl } = useThree();
  const controlsRef = useRef();

  React.useEffect(() => {
    // If we just joined a session, animate camera slightly
    if (sessionActive && destinations.length === 0 && controlsRef.current) {
      gsap.to(camera.position, {
        z: 8,
        duration: 2,
        ease: "power2.out",
      });
    }

    if (destinations.length > 0 && controlsRef.current) {
      // Find the center of all destinations to focus the camera
      const dest = destinations[0];
      const radius = 6; // Distance from center
      
      const lat = dest.coords ? dest.coords[0] : 0;
      const lng = dest.coords ? dest.coords[1] : 0;

      const phi = (90 - lat) * (Math.PI / 180);
      const theta = (lng + 180) * (Math.PI / 180);

      const targetX = -(radius * Math.sin(phi) * Math.cos(theta));
      const targetZ = radius * Math.sin(phi) * Math.sin(theta);
      const targetY = radius * Math.cos(phi);

      // Animate Camera Position
      gsap.to(camera.position, {
        x: targetX,
        y: targetY,
        z: targetZ,
        duration: 2.5,
        ease: "power3.inOut",
      });

      // Animate OrbitControls Target
      const globeCenter = new THREE.Vector3(0, 0, 0);
      gsap.to(controlsRef.current.target, {
        x: globeCenter.x,
        y: globeCenter.y,
        z: globeCenter.z,
        duration: 2.5,
        ease: "power3.inOut",
      });
    }
  }, [destinations, camera, sessionActive]);

  return (
    <OrbitControls 
      ref={controlsRef}
      enablePan={false} 
      enableZoom={true} 
      minDistance={4} 
      maxDistance={20}
      autoRotate={destinations.length === 0}
      autoRotateSpeed={0.5}
      dampingFactor={0.05}
    />
  );
}

export default function App() {
  const [session, setSession] = useState(null); // { sessionId, userId }
  const [destinations, setDestinations] = useState([]);
  
  /* 
  // --- OLD SEARCH LOGIC (Preserved) ---
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  const handleSearch = async (intent) => {
    setIsSearching(true);
    setShowResults(false);
    
    setTimeout(() => {
      setDestinations([
        { 
          id: 1, name: 'Santorini, Greece', lat: 36.3932, lng: 25.4615, type: 'Perfect Match', 
          aiReason: 'Santorini offers the perfect balance of quiet reading spots and stunning Aegean views.',
          price: '€180', flightDuration: '3h 15m'
        },
        // ... more mocks
      ]);
      setIsSearching(false);
      setShowResults(true);
    }, 2500);
  };
  */

  return (
    <div className="relative w-full h-full bg-[#020617] overflow-hidden font-sans">
      {/* 3D Scene */}
      <div className="absolute inset-0 z-0">
        <Canvas camera={{ position: [0, 0, 12], fov: 45 }} gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}>
          <ambientLight intensity={0.2} />
          <directionalLight position={[10, 10, 5]} intensity={2} color="#ffffff" />
          <directionalLight position={[-10, -10, -5]} intensity={1} color="#38bdf8" />

          <Suspense fallback={null}>
            <Globe destinations={destinations} />
            <Stars radius={100} depth={50} count={8000} factor={4} saturation={0.5} fade speed={1} />
          </Suspense>

          <CameraController destinations={destinations} sessionActive={!!session} />
        </Canvas>
      </div>

      {/* Top Header / Branding */}
      <div className="absolute top-0 left-0 w-full p-8 z-10 flex justify-between items-center pointer-events-none">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3"
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-sky-400 to-emerald-400 flex items-center justify-center shadow-[0_0_20px_rgba(56,189,248,0.5)]">
            <span className="text-white font-bold text-lg">A</span>
          </div>
          <h1 className="text-white text-2xl font-bold tracking-tight">Aura <span className="font-light text-slate-400">by Skyscanner</span></h1>
          {session && (
            <span className="ml-4 px-3 py-1 rounded-full bg-white/10 text-white text-xs border border-white/20">
              Room: {session.sessionId}
            </span>
          )}
        </motion.div>
      </div>

      {/* UI Overlays */}
      <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-end p-8 pb-12">
        <AnimatePresence mode="wait">
          {!session ? (
            <motion.div 
              key="session-manager"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
              transition={{ duration: 0.5 }}
              className="pointer-events-auto w-full h-full flex items-center justify-center absolute inset-0 backdrop-blur-sm bg-black/20"
            >
              <AuraSessionManager onJoined={(sid, uid) => setSession({ sessionId: sid, userId: uid })} />
            </motion.div>
          ) : (
            <motion.div 
              key="voice-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1, delay: 0.5 }}
              className="w-full h-full absolute inset-0"
            >
              {/* Results Cards (Commented out but preserved) 
              <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory hide-scrollbar max-w-full">
                {destinations.map((dest) => (
                   <div key={dest.id} ... />
                ))}
              </div>
              */}

              <VoiceOverlay 
                sessionId={session.sessionId} 
                userId={session.userId} 
                onDestinationsUpdate={(newDestinations) => setDestinations(newDestinations)} 
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 
      <style dangerouslySetInnerHTML={{
        __html: `
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />
      */}
    </div>
  );
}

