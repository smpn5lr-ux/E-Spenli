'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';

interface FullscreenLoaderProps {
  text?: string;
}

export const FullscreenLoader: React.FC<FullscreenLoaderProps> = ({ text = 'Memproses...' }) => {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
      {text && <p className="mt-4 text-lg font-medium text-foreground">{text}</p>}
    </div>
  );
};
