'use client';

import { useState, useEffect, useRef } from 'react';
import { getChatLogs } from '../actions/chatLogs';
import { sendGlobalBroadcast, sendGameChat } from '../actions/serverControls';

export default function ChatboxWidget({ games }: { games: any[] }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<string>('Global');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const isScrolledToBottomRef = useRef(true);

  // Hook into Realtime SSE Stream for Instant Chat
  useEffect(() => {
    let eventSource: EventSource | null = null;

    const connect = () => {
      eventSource = new EventSource('/api/realtime');

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.chat) {
            setLogs(data.chat);
          }
        } catch {
          // ignore
        }
      };
    };

    connect();

    return () => {
      if (eventSource) eventSource.close();
    };
  }, []);

  // Force scroll to bottom when switching tabs
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
      isScrolledToBottomRef.current = true;
    }
  }, [activeTab]);

  // Auto-scroll on new logs ONLY if already at bottom
  useEffect(() => {
    if (chatContainerRef.current && isScrolledToBottomRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const handleScroll = () => {
    if (chatContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
      isScrolledToBottomRef.current = scrollHeight - scrollTop - clientHeight < 50;
    }
  };

  const filteredLogs = logs.filter(l => activeTab === 'Global' || l.game === activeTab);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    setIsSending(true);
    
    let res: any;
    if (activeTab === 'Global') {
      res = await sendGlobalBroadcast(message);
    } else {
      const targetGame = games.find(g => g.name === activeTab);
      const gameId = targetGame ? targetGame.id : activeTab;
      res = await sendGameChat(gameId, activeTab, message);
    }
    
    if (res?.success) {
      setMessage('');
      // Optimistically add log
      setLogs(prev => [...prev, {
        id: Date.now(),
        timestamp: new Date().toLocaleTimeString(),
        game: activeTab,
        sender: 'Admin',
        message: message
      }]);
    } else {
      alert("Failed to send: " + res?.error);
    }
    setIsSending(false);
  };

  return (
    <div className="glass-card rounded-2xl flex flex-col h-[520px] shadow-2xl border border-white/10 overflow-hidden relative">
      {/* Header Tabs */}
      <div className="flex items-center bg-slate-950/80 backdrop-blur-md border-b border-white/10 overflow-x-auto no-scrollbar relative z-10 px-2 py-1.5">
        <button
          onClick={() => setActiveTab('Global')}
          className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-mono font-bold rounded-xl whitespace-nowrap transition-all duration-200 cursor-pointer ${
            activeTab === 'Global' 
              ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30 shadow-[0_0_10px_rgba(56,189,248,0.2)]' 
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">public</span>
          Global Chat
        </button>
        {games.map(g => (
          <button
            key={g.name}
            onClick={() => setActiveTab(g.name)}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-mono font-bold rounded-xl whitespace-nowrap transition-all duration-200 cursor-pointer ml-1 ${
              activeTab === g.name 
                ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 shadow-[0_0_10px_rgba(129,140,248,0.2)]' 
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">sports_esports</span>
            {g.name}
          </button>
        ))}
      </div>

      {/* Chat Messages Stream */}
      <div ref={chatContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar bg-slate-950/50">
        {filteredLogs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 font-mono space-y-2">
            <span className="material-symbols-outlined text-3xl opacity-40">forum</span>
            <p className="text-xs">No messages recorded in {activeTab}.</p>
          </div>
        ) : (
          filteredLogs.map((log, i) => {
            const isAdmin = log.sender === 'System' || log.sender === 'Admin' || log.sender === 'ADMIN';
            const showSender = i === 0 || filteredLogs[i-1].sender !== log.sender;
            
            const colors = ['bg-sky-500', 'bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-purple-500', 'bg-rose-500'];
            const charCodeSum = (log.sender || '').split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
            const avatarColor = colors[charCodeSum % colors.length];

            return (
              <div key={log.id} className={`flex w-full ${isAdmin ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                <div className={`flex max-w-[88%] ${isAdmin ? 'flex-row-reverse' : 'flex-row'} items-end gap-2`}>
                  
                  {/* Avatar */}
                  {!isAdmin && (
                    <div className="flex-shrink-0 mb-0.5">
                      {showSender ? (
                        <div className={`w-7 h-7 rounded-lg ${avatarColor} flex items-center justify-center text-white text-[10px] font-bold shadow-sm`}>
                          {(log.sender || 'P').substring(0, 2).toUpperCase()}
                        </div>
                      ) : (
                        <div className="w-7 h-7"></div>
                      )}
                    </div>
                  )}

                  <div className={`flex flex-col ${isAdmin ? 'items-end' : 'items-start'}`}>
                    {/* Sender Name & Time */}
                    {showSender && (
                      <span className="text-[10px] font-mono text-slate-400 mb-1 px-1 flex items-center gap-1.5">
                        {!isAdmin && <span className="font-bold text-slate-200">{log.sender}</span>}
                        {!isAdmin && <span className="text-slate-600">•</span>}
                        <span>{log.timestamp}</span>
                        {log.game && log.game !== 'Global' && activeTab === 'Global' && (
                          <span className="bg-indigo-500/15 text-indigo-400 px-1.5 py-0.2 rounded text-[9px] uppercase tracking-wider border border-indigo-500/20">{log.game}</span>
                        )}
                      </span>
                    )}

                    {/* Chat Bubble */}
                    <div className={`px-3.5 py-2 text-xs leading-relaxed shadow-md relative group ${
                      isAdmin 
                        ? 'bg-gradient-to-r from-sky-500 to-indigo-600 text-white rounded-2xl rounded-br-xs font-medium border border-sky-400/30' 
                        : 'bg-slate-900/90 border border-white/10 text-slate-200 rounded-2xl rounded-bl-xs'
                    }`}>
                      {log.message}
                    </div>
                  </div>

                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Input Form */}
      <form onSubmit={handleSend} className="p-3 bg-slate-950/90 backdrop-blur-xl border-t border-white/10 relative z-10">
        <div className="relative flex items-center">
          <input
            type="text"
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder={`Send announcement to ${activeTab}...`}
            className="w-full bg-slate-900/90 border border-white/10 text-white rounded-xl pl-4 pr-12 py-2.5 text-xs focus:outline-none focus:border-sky-400/60 focus:ring-1 focus:ring-sky-400/40 transition-all font-mono placeholder:text-slate-500"
            disabled={isSending}
            maxLength={63}
          />
          <button
            type="submit"
            disabled={isSending || !message.trim()}
            className="absolute right-1.5 w-8 h-8 bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-lg flex items-center justify-center disabled:opacity-30 transition-all hover:scale-105 active:scale-95 shadow-md cursor-pointer font-bold"
          >
            {isSending ? (
              <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <span className="material-symbols-outlined text-[16px]">send</span>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
