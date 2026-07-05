"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        router.push('/dashboard');
      }
    });
    return () => unsubscribe();
  }, [router]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-black p-4">
      <div className="flex flex-col items-center bg-white/10 p-10 rounded-3xl shadow-2xl backdrop-blur-xl border border-white/20">
        <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400 mb-4">
          AI Token Tracker
        </h1>
        <p className="text-gray-300 mb-8 text-center max-w-xs">
          Monitor your Gemini Advanced and Claude Pro rolling window limits in real-time.
        </p>
        <button
          onClick={handleLogin}
          className="flex items-center gap-3 px-6 py-3 bg-white text-gray-900 rounded-full font-semibold shadow-lg hover:shadow-xl hover:scale-105 transition-all"
        >
          <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
          Sign in with Google
        </button>
      </div>
    </main>
  );
}
