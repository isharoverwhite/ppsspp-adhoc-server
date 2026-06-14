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

  useEffect(() => {
    const fetchLogs = async () => {
      const data = await getChatLogs();
      setLogs(data);
    };
    fetchLogs();
    const interval = setInterval(fetchLogs, 3000);
    return () => clearInterval(interval);
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
      // Consider "at bottom" if within 50px of the bottom edge
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
    <div className="glass-card rounded-xl flex flex-col h-[500px] shadow-lg border border-outline-variant/50 overflow-hidden relative">
      {/* Header Tabs */}
      <div className="flex items-center bg-surface-container-high/80 backdrop-blur-md border-b border-outline-variant/50 overflow-x-auto no-scrollbar relative z-10">
        <button
          onClick={() => setActiveTab('Global')}
          className={`flex items-center gap-2 px-5 py-3.5 text-sm whitespace-nowrap transition-all duration-300 font-data-md relative ${
            activeTab === 'Global' ? 'text-primary' : 'text-on-surface-variant hover:bg-surface-variant/30 hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">public</span>
          Global
          {activeTab === 'Global' && (
            <div className="absolute bottom-0 left-0 w-full h-[2px] bg-primary rounded-t-full shadow-[0_-2px_10px_rgba(var(--primary),0.5)]"></div>
          )}
        </button>
        {games.map(g => (
          <button
            key={g.name}
            onClick={() => setActiveTab(g.name)}
            className={`flex items-center gap-2 px-5 py-3.5 text-sm whitespace-nowrap transition-all duration-300 font-data-md relative ${
              activeTab === g.name ? 'text-primary' : 'text-on-surface-variant hover:bg-surface-variant/30 hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">sports_esports</span>
            {g.name}
            {activeTab === g.name && (
              <div className="absolute bottom-0 left-0 w-full h-[2px] bg-primary rounded-t-full shadow-[0_-2px_10px_rgba(var(--primary),0.5)]"></div>
            )}
          </button>
        ))}
      </div>

      {/* Chat Messages */}
      <div ref={chatContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar bg-gradient-to-b from-surface-variant/5 to-surface-variant/20">
        {filteredLogs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-on-surface-variant/60 font-data-md">
            <span className="material-symbols-outlined text-4xl mb-2 opacity-50">forum</span>
            <p className="text-sm">No messages yet.</p>
            <p className="text-xs opacity-70 mt-1">Start the conversation in {activeTab}</p>
          </div>
        ) : (
          filteredLogs.map((log, i) => {
            const isAdmin = log.sender === 'System' || log.sender === 'Admin' || log.sender === 'ADMIN';
            const showSender = i === 0 || filteredLogs[i-1].sender !== log.sender;
            
            // Generate a persistent color based on sender name
            const colors = ['bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500', 'bg-purple-500', 'bg-pink-500', 'bg-indigo-500'];
            const charCodeSum = log.sender.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
            const avatarColor = colors[charCodeSum % colors.length];

            return (
              <div key={log.id} className={`flex w-full ${isAdmin ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                <div className={`flex max-w-[85%] ${isAdmin ? 'flex-row-reverse' : 'flex-row'} items-end gap-2`}>
                  
                  {/* Avatar */}
                  {!isAdmin && (
                    <div className="flex-shrink-0 mb-1">
                      {showSender ? (
                        <div className={`w-8 h-8 rounded-full ${avatarColor} flex items-center justify-center text-white text-xs font-bold shadow-sm`}>
                          {log.sender.substring(0, 2).toUpperCase()}
                        </div>
                      ) : (
                        <div className="w-8 h-8"></div> // Placeholder for alignment
                      )}
                    </div>
                  )}

                  <div className={`flex flex-col ${isAdmin ? 'items-end' : 'items-start'}`}>
                    {/* Sender Name & Time */}
                    {showSender && (
                      <span className="font-label-sm text-[10px] text-on-surface-variant/70 mb-1 px-1 flex items-center gap-1">
                        {!isAdmin && <span className="font-bold text-on-surface-variant/90">{log.sender}</span>}
                        {!isAdmin && <span>•</span>}
                        {log.timestamp} 
                        {log.game !== 'Global' && activeTab === 'Global' && (
                          <span className="bg-surface-variant px-1.5 py-0.5 rounded text-[8px] uppercase tracking-wider text-primary">{log.game}</span>
                        )}
                      </span>
                    )}

                    {/* Bubble */}
                    <div className={`px-4 py-2.5 text-sm font-data-md shadow-sm relative group ${
                      isAdmin 
                        ? 'bg-primary text-on-primary rounded-2xl rounded-br-sm' 
                        : 'bg-surface-container-highest border border-outline-variant/30 text-on-surface rounded-2xl rounded-bl-sm'
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
      <form onSubmit={handleSend} className="p-4 bg-surface-container/90 backdrop-blur-md border-t border-outline-variant/30 relative z-10">
        <div className="relative flex items-center">
          <input
            type="text"
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder={`Message ${activeTab}...`}
            className="w-full bg-surface-container-highest border border-outline-variant/50 text-on-surface rounded-full pl-5 pr-14 py-3.5 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-data-md shadow-inner placeholder:text-on-surface-variant/50"
            disabled={isSending}
            maxLength={63}
          />
          <button
            type="submit"
            disabled={isSending || !message.trim()}
            className="absolute right-1.5 w-10 h-10 bg-primary text-on-primary rounded-full flex items-center justify-center hover:bg-primary/90 disabled:opacity-40 disabled:hover:bg-primary transition-all hover:scale-105 active:scale-95 shadow-sm"
          >
            {isSending ? (
              <div className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <span className="material-symbols-outlined text-[18px] ml-0.5">send</span>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
