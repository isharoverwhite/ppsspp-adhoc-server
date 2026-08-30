import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";
import SidebarNav from "./components/SidebarNav";
import HeaderNav from "./components/HeaderNav";

export const metadata: Metadata = {
  title: "PPSSPP Ad-hoc Server • Command Center",
  description: "High-performance multiplayer command center & analytics for PSP & PPSSPP",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link 
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&family=Outfit:wght@500;600;700;800&display=swap" 
          rel="stylesheet" 
        />
        <link 
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" 
          rel="stylesheet" 
        />
      </head>
      <body className="bg-background text-foreground overflow-hidden h-full flex antialiased select-none">
        {/* Mobile Menu Toggle */}
        <input type="checkbox" id="mobile-menu" className="peer hidden" />
        <label 
          htmlFor="mobile-menu" 
          className="md:hidden fixed top-3.5 left-4 z-[60] cursor-pointer bg-slate-800/90 border border-white/10 p-2 rounded-xl text-slate-200 hover:text-sky-400 transition-colors flex items-center justify-center backdrop-blur-md shadow-lg"
        >
          <span className="material-symbols-outlined text-[20px]">menu</span>
        </label>

        {/* Live Auto-Ping Header Bar */}
        <HeaderNav />

        {/* Mobile Overlay */}
        <label 
          htmlFor="mobile-menu" 
          className="fixed inset-0 bg-black/60 z-40 hidden peer-checked:block md:hidden backdrop-blur-sm transition-opacity"
        ></label>

        {/* Side Navigation */}
        <aside className="fixed left-0 top-0 h-full w-[80px] bg-[#0b0f19]/90 backdrop-blur-2xl border-r border-white/[0.08] py-5 flex flex-col items-center z-50 transform transition-transform duration-300 ease-in-out -translate-x-full peer-checked:translate-x-0 md:translate-x-0">
          <div className="mb-8 flex justify-center items-center w-full">
            <Link href="/" className="group relative flex items-center justify-center p-2 rounded-2xl bg-gradient-to-br from-sky-500/20 via-indigo-500/10 to-transparent border border-sky-500/30 hover:border-sky-400 transition-all hover:scale-105 shadow-[0_0_15px_rgba(56,189,248,0.2)]">
              <svg viewBox="0 0 100 40" className="w-11 h-auto text-sky-400 transition-transform group-hover:rotate-[-4deg]" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="96" height="36" rx="18" className="stroke-sky-400/80" />
                <rect x="26" y="6" width="48" height="28" rx="3" strokeWidth="2" className="fill-slate-950/60 stroke-indigo-400" />
                <circle cx="50" cy="20" r="4" strokeWidth="2" className="fill-sky-400" />
                <path d="M50 16 v-6 M46 20 h-6 M54 20 h6 M50 24 v6" strokeWidth="2" className="stroke-sky-300" />
                <path d="M13 15 v10 M8 20 h10" strokeWidth="2" className="stroke-slate-400" />
                <circle cx="87" cy="15" r="1.5" strokeWidth="2" className="fill-rose-400 stroke-rose-400" />
                <circle cx="82" cy="20" r="1.5" strokeWidth="2" className="fill-sky-400 stroke-sky-400" />
                <circle cx="92" cy="20" r="1.5" strokeWidth="2" className="fill-amber-400 stroke-amber-400" />
                <circle cx="87" cy="25" r="1.5" strokeWidth="2" className="fill-emerald-400 stroke-emerald-400" />
              </svg>
            </Link>
          </div>
          <SidebarNav />
        </aside>

        {/* Main Content Area */}
        <main className="w-full md:ml-[80px] mt-16 p-4 md:p-6 lg:p-8 h-[calc(100vh-64px)] overflow-y-auto custom-scrollbar">
          {children}
        </main>
      </body>
    </html>
  );
}
