import React, { useState, useRef, useEffect } from 'react';
import { 
  Play, 
  Pause, 
  SpeakerHigh, 
  SpeakerLow, 
  SpeakerSlash, 
  CornersOut, 
  CircleNotch 
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

interface CustomVideoPlayerProps {
  src: string;
  className?: string;
  autoPlay?: boolean;
}

export const CustomVideoPlayer = ({ src, className, autoPlay = false }: CustomVideoPlayerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [progress, setProgress] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(autoPlay);
  const [isLoaded, setIsLoaded] = useState(false);
  const [showControls, setShowControls] = useState(true); // Default to true initially
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const controlsTimeoutRef = useRef<any>(null);

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 4000); // Wait longer (4s)
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      setProgress((video.currentTime / video.duration) * 100);
      setCurrentTime(video.currentTime);
    };

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      setIsLoaded(true);
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    
    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [isPlaying]);

  const togglePlay = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (videoRef.current) {
      if (isPlaying) videoRef.current.pause();
      else videoRef.current.play();
      setIsPlaying(!isPlaying);
      setShowControls(true);
    }
  };

  const formatTime = (time: number) => {
    if (isNaN(time) || !isFinite(time)) return '0:00';
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleProgressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const val = Number(e.target.value);
    const time = (val / 100) * (videoRef.current?.duration || 0);
    if (videoRef.current) videoRef.current.currentTime = time;
    setProgress(val);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const val = Number(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
      setIsMuted(val === 0);
    }
  };

  return (
    <div 
      ref={containerRef}
      className={cn("relative group/player rounded-xl overflow-hidden bg-black flex items-center justify-center transition-all shadow-2xl border border-white/5", className)}
      onMouseMove={handleMouseMove}
      onClick={() => setShowControls(true)}
    >
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-md z-[60]">
          <CircleNotch className="w-10 h-10 animate-spin text-white/20" />
        </div>
      )}
      
      <video
        ref={videoRef}
        src={src}
        className="max-w-full max-h-full w-auto h-auto object-contain cursor-pointer"
        autoPlay={autoPlay}
        muted={autoPlay}
        playsInline
        onClick={togglePlay}
      />

      {/* Large Center Play/Pause button */}
      <div 
        className={cn(
          "absolute inset-0 flex items-center justify-center transition-all duration-500 pointer-events-none z-40",
          (!isPlaying || showControls) ? "opacity-100 scale-100" : "opacity-0 scale-95"
        )}
      >
        <button 
          onClick={togglePlay}
          className={cn(
            "w-20 h-20 flex items-center justify-center rounded-full bg-white/10 backdrop-blur-xl border border-white/20 text-white pointer-events-auto transition-all hover:scale-110 active:scale-95 shadow-[0_0_50px_rgba(0,0,0,0.6)]",
            !isPlaying && "animate-pulse"
          )}
        >
          {isPlaying ? (
            <Pause className="w-8 h-8" weight="fill" />
          ) : (
            <Play className="w-8 h-8 translate-x-[1px]" weight="fill" />
          )}
        </button>
      </div>

      {/* Bottom Controls */}
      <div 
        className={cn(
          "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/60 to-transparent p-6 pt-16 transition-all duration-500 flex flex-col gap-4 z-50",
          (showControls || !isPlaying) ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0 pointer-events-none"
        )}
        onMouseMove={(e) => e.stopPropagation()} // Prevent timeout while interacting with controls
      >
        {/* Progress Bar Container */}
        <div className="relative group/progress h-1.5 w-full flex items-center cursor-pointer mb-2">
          <div className="absolute inset-0 bg-white/5 rounded-full overflow-hidden backdrop-blur-sm border border-white/5" />
          <div 
            className="absolute inset-y-0 left-0 bg-primary rounded-full flex items-center justify-end shadow-[0_0_15px_rgba(var(--primary),0.5)] transition-all duration-300"
            style={{ width: `${progress}%` }}
          >
            <div className="w-3 h-3 bg-white rounded-full shadow-xl scale-0 group-hover/progress:scale-100 transition-transform ring-4 ring-primary/20" />
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="0.1"
            value={progress}
            onChange={handleProgressChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
          />
        </div>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4">
              <button 
                onClick={togglePlay} 
                className="text-white hover:scale-110 active:scale-95 transition-all p-1"
              >
                {isPlaying ? <Pause className="w-6 h-6" weight="fill" /> : <Play className="w-6 h-6 translate-x-[1px]" weight="fill" />}
              </button>
              
              <div className="flex items-center gap-3 group/vol relative">
                <button 
                  onClick={() => {
                    const newMuted = !isMuted;
                    setIsMuted(newMuted);
                    if (videoRef.current) {
                      videoRef.current.muted = newMuted;
                      if (!newMuted && volume === 0) {
                        setVolume(0.5);
                        videoRef.current.volume = 0.5;
                      }
                    }
                  }} 
                  className="text-white/60 hover:text-white transition-colors p-1"
                >
                  {isMuted || volume === 0 ? <SpeakerSlash className="w-5 h-5" /> : volume < 0.5 ? <SpeakerLow className="w-5 h-5" /> : <SpeakerHigh className="w-5 h-5" />}
                </button>
                
                <div className="w-16 md:w-20 overflow-hidden flex items-center">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="w-full h-1 bg-white/10 appearance-none cursor-pointer rounded-full accent-primary hover:bg-white/20 transition-all"
                  />
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2 tabular-nums">
              <span className="text-[11px] font-bold text-white/90 tracking-widest uppercase">{formatTime(currentTime)}</span>
              <span className="text-[11px] font-bold text-white/10">|</span>
              <span className="text-[11px] font-bold text-white/30 tracking-widest uppercase">{formatTime(duration)}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={() => videoRef.current?.requestFullscreen()} 
              className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-white/60 hover:text-white transition-all active:scale-90 border border-white/5"
            >
              <CornersOut className="w-5 h-5" weight="bold" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
