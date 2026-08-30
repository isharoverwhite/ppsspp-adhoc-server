'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function SidebarNav() {
  const pathname = usePathname();

  const links = [
    { name: 'Game Lobby & Rooms', href: '/', icon: 'sports_esports' },
    { name: 'Analytics & Trends', href: '/admin/analytics', icon: 'query_stats' },
    { name: 'System Telemetry', href: '/admin/monitoring', icon: 'dns' },
    { name: 'Ban & Security', href: '/admin/bans', icon: 'gavel' },
  ];

  return (
    <nav className="flex-1 flex flex-col gap-3 w-full px-2">
      {links.map((link) => {
        const isActive = pathname === link.href;
        return (
          <Link 
            key={link.href} 
            href={link.href} 
            title={link.name}
            className={`group relative flex items-center justify-center rounded-xl w-12 h-12 mx-auto transition-all duration-200 cursor-pointer ${
              isActive 
                ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30 shadow-[0_0_15px_rgba(56,189,248,0.25)]' 
                : 'text-slate-400 hover:text-sky-300 hover:bg-slate-800/60 hover:border hover:border-white/10'
            }`}
          >
            {isActive && (
              <span className="absolute -left-2 w-1 h-6 bg-sky-400 rounded-r-full shadow-[0_0_8px_#38bdf8]"></span>
            )}
            <span className={`material-symbols-outlined text-[24px] transition-transform group-hover:scale-110`}>
              {link.icon}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
