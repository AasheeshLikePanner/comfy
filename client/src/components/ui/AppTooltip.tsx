import React from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  TooltipPortal,
} from './tooltip';
import { cn } from '@/lib/utils';

interface AppTooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  className?: string;
  delayDuration?: number;
}

export const AppTooltip = ({
  content,
  children,
  side = 'top',
  align = 'center',
  className,
  delayDuration = 200,
}: AppTooltipProps) => {
  return (
    <Tooltip delayDuration={delayDuration}>
      <TooltipTrigger asChild>
        {children}
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent
          side={side}
          align={align}
          sideOffset={6}
          className={cn(
            "bg-card/95 border border-border/40 text-[10px] font-medium py-1.5 px-3 rounded-md shadow-xl backdrop-blur-md z-[100] animate-in fade-in zoom-in-95 duration-200 select-none",
            className
          )}
        >
          {content}
        </TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
};
