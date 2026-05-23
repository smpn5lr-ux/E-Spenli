import React from 'react';

export function PageWrapper({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <div className="w-full">
      {title && <h1 className="text-2xl font-bold mb-4">{title}</h1>}
      {children}
    </div>
  );
}
