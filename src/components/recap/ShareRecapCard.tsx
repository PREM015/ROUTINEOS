'use client';

import React from 'react';

interface Props {
  title: string;
  stats: Array<{ label: string; value: string }>;
}

export default function ShareRecapCard({ title, stats }: Props) {
  return (
    <div className="max-w-sm mx-auto">
      <div className="bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-1 rounded-2xl shadow-xl">
        <div className="bg-white rounded-xl p-6 h-full flex flex-col">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-pink-600">
              {title}
            </h2>
            <p className="text-xs text-gray-400 mt-1 uppercase tracking-widest">My Daily Plan Recap</p>
          </div>
          
          <div className="grid grid-cols-2 gap-4 flex-1">
            {stats.map((stat, idx) => (
              <div key={idx} className="bg-gray-50 rounded-lg p-3 text-center border border-gray-100">
                <p className="text-xl font-bold text-gray-800">{stat.value}</p>
                <p className="text-xs text-gray-500 mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
          
          <div className="mt-6 pt-4 border-t border-gray-100 text-center">
            <p className="text-xs text-gray-400 font-medium">dailyplan.app</p>
          </div>
        </div>
      </div>
      
      <button 
        className="w-full mt-4 bg-gray-900 text-white font-medium py-3 px-4 rounded-xl shadow hover:bg-gray-800 transition-colors flex items-center justify-center space-x-2"
        onClick={() => alert('Sharing functionality placeholder')}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg>
        <span>Copy as Image</span>
      </button>
    </div>
  );
}
