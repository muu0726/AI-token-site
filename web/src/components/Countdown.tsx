"use client";

import React, { useEffect, useState } from 'react';

export default function Countdown({ targetDate }: { targetDate: Date | null }) {
  const [timeLeft, setTimeLeft] = useState<string>('--:--:--');

  useEffect(() => {
    if (!targetDate) {
      setTimeLeft('Fully Recovered');
      return;
    }

    const interval = setInterval(() => {
      const now = new Date().getTime();
      const distance = targetDate.getTime() - now;

      if (distance < 0) {
        clearInterval(interval);
        setTimeLeft('Fully Recovered');
        return;
      }

      const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((distance % (1000 * 60)) / 1000);

      setTimeLeft(
        `${hours.toString().padStart(2, '0')}:${minutes
          .toString()
          .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      );
    }, 1000);

    return () => clearInterval(interval);
  }, [targetDate]);

  return (
    <div className="flex flex-col items-center mt-6 p-4 bg-white/5 rounded-xl border border-white/10 w-full max-w-sm">
      <span className="text-gray-400 text-sm mb-1">Time until full recovery</span>
      <span className="text-2xl font-mono text-white tracking-wider">{timeLeft}</span>
    </div>
  );
}
