import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";
import SidebarNav from "./components/SidebarNav";

export const metadata: Metadata = {
  title: "PPSSPP Ad-hoc server",
  description: "PPSSPP Ad-hoc server",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
      </head>
      <body className="bg-surface text-on-surface overflow-hidden h-full flex">
        {/* Mobile Menu Toggle */}
        <input type="checkbox" id="mobile-menu" className="peer hidden" />
        <label htmlFor="mobile-menu" className="md:hidden fixed top-3 left-4 z-[60] cursor-pointer bg-surface-variant p-1.5 rounded-lg text-on-surface hover:text-primary transition-colors flex items-center justify-center">
          <span className="material-symbols-outlined">menu</span>
        </label>

        {/* Top Navigation Bar */}
        <header className="fixed top-0 left-0 right-0 z-40 bg-surface/80 backdrop-blur-md border-b border-outline-variant flex justify-between items-center h-16 w-full pl-16 md:pl-[96px] pr-gutter">
          <div className="flex items-center gap-stack-md overflow-hidden">
            <h1 className="font-headline-md text-lg md:text-headline-md font-bold text-on-surface truncate">PPSSPP Ad-hoc server</h1>
            <div className="hidden sm:flex gap-stack-sm items-center px-3 py-1 bg-surface-variant rounded-full">
              <span className="w-2 h-2 rounded-full bg-surface-tint status-pulse"></span>
              <span className="font-data-md text-xs md:text-data-md text-surface-tint whitespace-nowrap">Live: Adhoc Server</span>
            </div>
          </div>
          <div className="flex items-center gap-stack-md">
            {/* Security Alerts and Notifications placeholder removed */}
          </div>
        </header>

        {/* Mobile Overlay */}
        <label htmlFor="mobile-menu" className="fixed inset-0 bg-surface-foreground/20 z-40 hidden peer-checked:block md:hidden backdrop-blur-sm transition-opacity"></label>

        {/* Side Navigation */}
        <aside className="fixed left-0 top-0 h-full w-[80px] bg-surface-container border-r border-outline-variant py-container-margin flex flex-col items-center z-50 transform transition-transform duration-300 ease-in-out -translate-x-full peer-checked:translate-x-0 md:translate-x-0">
          <div className="mb-stack-lg flex justify-center items-start w-full">
            <div className="flex items-center gap-stack-sm mb-2">
              <svg viewBox="0 0 100 40" className="w-14 h-auto text-surface-tint" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                {/* Outer Body */}
                <rect x="2" y="2" width="96" height="36" rx="18" />
                {/* Screen */}
                <rect x="26" y="6" width="48" height="28" rx="3" strokeWidth="2" />
                
                {/* Network/Server inside Screen */}
                <circle cx="50" cy="20" r="4" strokeWidth="2" />
                <path d="M50 16 v-6" strokeWidth="2" />
                <path d="M46 20 h-6" strokeWidth="2" />
                <path d="M54 20 h6" strokeWidth="2" />
                <path d="M50 24 v6" strokeWidth="2" />
                <circle cx="50" cy="9" r="1.5" strokeWidth="2" />
                <circle cx="39" cy="20" r="1.5" strokeWidth="2" />
                <circle cx="61" cy="20" r="1.5" strokeWidth="2" />
                <circle cx="50" cy="31" r="1.5" strokeWidth="2" />

                {/* D-Pad */}
                <path d="M13 15 v10 M8 20 h10" strokeWidth="2" />

                {/* Face Buttons */}
                <circle cx="87" cy="15" r="1.5" strokeWidth="2" />
                <circle cx="82" cy="20" r="1.5" strokeWidth="2" />
                <circle cx="92" cy="20" r="1.5" strokeWidth="2" />
                <circle cx="87" cy="25" r="1.5" strokeWidth="2" />
              </svg>
            </div>
          </div>
          <SidebarNav />
        </aside>

        {/* Main Content Area */}
        <main className="w-full md:ml-[80px] mt-16 p-stack-sm md:p-stack-lg h-[calc(100vh-64px)] overflow-y-auto custom-scrollbar">
          {children}
        </main>
      </body>
    </html>
  );
}
