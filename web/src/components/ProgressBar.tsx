"use client";

import React from 'react';

interface ProgressBarProps {
  provider: 'Gemini' | 'Claude';
  used: number;
  max: number;
}

export default function ProgressBar({ provider, used, max }: ProgressBarProps) {
  const percentage = Math.min((max > 0 ? used / max : 0) * 100, 100);
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;
  
  const color = provider === 'Gemini' ? 'text-blue-500' : 'text-orange-500';

  return (
    <div className="flex flex-col items-center p-6 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-xl transition-transform hover:scale-105">
      <h3 className="text-xl font-semibold mb-4 text-white">{provider}</h3>
      <div className="relative flex items-center justify-center">
        <svg className="transform -rotate-90 w-40 h-40">
          <circle
            cx="80"
            cy="80"
            r={radius}
            stroke="currentColor"
            strokeWidth="12"
            fill="transparent"
            className="text-gray-700/50"
          />
          <circle
            cx="80"
            cy="80"
            r={radius}
            stroke="currentColor"
            strokeWidth="12"
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className={`${color} transition-all duration-1000 ease-out`}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute flex flex-col items-center justify-center">
          <span className="text-3xl font-bold text-white">{used}</span>
          <span className="text-sm text-gray-400">/ {max}</span>
        </div>
      </div>
    </div>
  );
}
