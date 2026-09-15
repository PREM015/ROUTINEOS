"use client";
import React from 'react';
import { CloudOff } from 'lucide-react';

export function OfflineError() {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center space-y-4">
      <CloudOff className="w-12 h-12 text-gray-400" />
      <h3 className="text-xl font-bold">You are offline</h3>
      <p className="text-gray-500">Some features may not be available until you reconnect.</p>
    </div>
  );
}
