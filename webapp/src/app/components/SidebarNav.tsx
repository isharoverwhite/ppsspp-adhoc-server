'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function SidebarNav() {
  const pathname = usePathname();

  const links = [
    { name: 'Dashboard', href: '/', icon: 'dashboard' },
    { name: 'Analytics', href: '/admin/analytics', icon: 'monitoring' },
    { name: 'Infrastructure', href: '/admin/monitoring', icon: 'network_check' },
    { name: 'Security (Bans)', href: '/admin/bans', icon: 'security' },
  ];

  return (
    <nav className="flex-1 flex flex-col gap-unit">
      {links.map((link) => {
        const isActive = pathname === link.href;
        return (
          <Link 
            key={link.href} 
            href={link.href} 
            title={link.name}
            className={`flex items-center justify-center rounded-lg w-12 h-12 mx-auto transition-all ${
              isActive 
                ? 'bg-primary/10 text-primary font-bold shadow-sm' 
                : 'text-on-surface-variant hover:text-primary hover:bg-surface-container-high'
            }`}
          >
            <span className={`material-symbols-outlined text-[24px] ${isActive ? 'filled' : ''}`}>
              {link.icon}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
