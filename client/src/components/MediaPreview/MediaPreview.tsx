import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from '@/components/ui/dialog';
import { X, ArrowsOut, Play, HouseLine, CaretLeft, CaretRight, Download } from '@phosphor-icons/react';
import { cn, downloadFile } from '@/lib/utils';
import { CustomVideoPlayer } from './CustomVideoPlayer';

interface MediaItem {
  url: string;
  type: 'image' | 'video';
}

interface MediaPreviewProps {
  items: MediaItem[];
  className?: string;
}

export const MediaPreview = ({ items, className }: MediaPreviewProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  if (!items.length) return null;

  const activeItem = items[currentIndex];

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((currentIndex + 1) % items.length);
  };

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((currentIndex - 1 + items.length) % items.length);
  };

  const handleDownload = () => {
    const filename = activeItem.url.split('/').pop() || (activeItem.type === 'image' ? 'image.jpg' : 'video.mp4');
    downloadFile(activeItem.url, filename, activeItem.type === 'image' ? 'image/jpeg' : 'video/mp4');
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <div className={cn(
          "relative group cursor-pointer overflow-hidden rounded-sm border border-border/10 bg-secondary/5 transition-all hover:border-border/40 hover:shadow-lg",
          "w-10 h-8 flex items-center justify-center",
          className
        )}>
          {items[0].type === 'image' ? (
            <img 
              src={items[0].url} 
              alt="Preview" 
              className="w-full h-full object-cover transition-transform group-hover:scale-110"
              loading="lazy"
            />
          ) : (
            <div className="relative w-full h-full flex items-center justify-center bg-black/40">
              <Play className="w-2.5 h-2.5 text-white/40 group-hover:text-white" weight="fill" />
              <video 
                src={items[0].url} 
                className="absolute inset-0 w-full h-full object-cover opacity-60"
                muted
                playsInline
              />
            </div>
          )}
          
          {items.length > 1 && (
            <div className="absolute top-0 right-0 p-0.5 bg-black/60 text-[7px] font-black text-white rounded-bl border-l border-b border-white/10 z-10">
              +{items.length - 1}
            </div>
          )}

          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
            <ArrowsOut className="w-2.5 h-2.5 text-white" weight="bold" />
          </div>
        </div>
      </DialogTrigger>
      
      <DialogContent className="max-w-[95vw] md:max-w-[85vw] max-h-[90vh] p-0 border-none bg-black/98 shadow-[0_0_100px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col justify-center items-center rounded-xl animate-in zoom-in-95 duration-200">
        <div className="absolute top-4 right-4 z-[100] flex items-center gap-2">
          <button 
            onClick={handleDownload}
            className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-white/40 hover:text-white transition-all backdrop-blur-md border border-white/5"
            title="Download"
          >
            <Download className="w-5 h-5" />
          </button>
          <button 
            onClick={() => setIsOpen(false)}
            className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-white/40 hover:text-white transition-all backdrop-blur-md border border-white/5"
            title="Close"
          >
            <X className="w-5 h-5" weight="bold" />
          </button>
        </div>

        <div className="relative w-full h-full flex items-center justify-center px-12 md:px-24">
          {items.length > 1 && (
            <>
              <button 
                onClick={handlePrev}
                className="absolute left-6 z-50 p-3 bg-white/5 hover:bg-white/10 rounded-full text-white/40 hover:text-white transition-all border border-white/5 disabled:opacity-0"
              >
                <CaretLeft className="w-6 h-6" weight="bold" />
              </button>
              <button 
                onClick={handleNext}
                className="absolute right-6 z-50 p-3 bg-white/5 hover:bg-white/10 rounded-full text-white/40 hover:text-white transition-all border border-white/5 disabled:opacity-0"
              >
                <CaretRight className="w-6 h-6" weight="bold" />
              </button>
            </>
          )}

          <div className="w-full h-full flex flex-col items-center justify-center gap-6 p-12">
            <div className="relative w-full h-full max-h-[70vh] flex items-center justify-center overflow-hidden rounded-lg">
              {activeItem.type === 'image' ? (
                <img 
                  src={activeItem.url} 
                  alt={`Full view ${currentIndex + 1}`} 
                  className="max-w-full max-h-full object-contain transition-transform duration-500 hover:scale-[1.02]"
                  draggable={false}
                />
              ) : (
                <CustomVideoPlayer 
                  src={activeItem.url} 
                  className="max-w-full max-h-full shadow-2xl border border-white/5"
                  autoPlay={items.length === 1}
                />
              )}
            </div>
            
            <div className="flex flex-col items-center gap-4">
              <div className="flex items-center gap-1.5 px-3 py-1 bg-white/5 rounded-full border border-white/10">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
                  {currentIndex + 1} <span className="text-white/10 mx-1">/</span> {items.length}
                </span>
              </div>
              
              <div className="flex items-center gap-2 max-w-[400px] overflow-x-auto scrollbar-hide p-1">
                {items.length > 1 && items.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentIndex(idx)}
                    className={cn(
                      "relative w-12 h-10 rounded border transition-all shrink-0 overflow-hidden",
                      currentIndex === idx ? "border-white/50 scale-110 shadow-lg" : "border-white/10 opacity-30 hover:opacity-100"
                    )}
                  >
                    {item.type === 'image' ? (
                      <img src={item.url} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-white/10 flex items-center justify-center">
                        <Play className="w-3 h-3 text-white/60" weight="fill" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
