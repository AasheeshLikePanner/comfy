import * as React from 'react';
import { cn } from '@/lib/utils';

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'text' | 'numeric' | 'date' | 'json' | 'boolean' | 'other';

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'border-transparent bg-primary text-primary-foreground',
  secondary: 'border-transparent bg-secondary text-secondary-foreground',
  destructive: 'border-transparent bg-destructive text-destructive-foreground',
  outline: 'border-border text-foreground',
  success: 'border-transparent bg-green-500/15 text-green-500',
  warning: 'border-transparent bg-yellow-500/15 text-yellow-500',
  text: 'border-transparent bg-green-500/15 text-green-500',
  numeric: 'border-transparent bg-blue-500/15 text-blue-500',
  date: 'border-transparent bg-purple-500/15 text-purple-500',
  json: 'border-transparent bg-orange-500/15 text-orange-500',
  boolean: 'border-transparent bg-muted text-muted-foreground',
  other: 'border-transparent bg-muted text-muted-foreground',
};

function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <div 
      className={cn(
        'inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors',
        variantClasses[variant],
        className
      )} 
      {...props} 
    />
  );
}

export { Badge };
export type { BadgeProps, BadgeVariant };