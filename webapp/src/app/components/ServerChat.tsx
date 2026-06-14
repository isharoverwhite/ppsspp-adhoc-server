"use client";

import { useState, useEffect, useRef } from "react";
import { Send, Users, Globe, Terminal, MessageSquare } from "lucide-react";

interface ChatMessage {
  id: number;
  mac: string;
  name: string;
  game: string;
  group: string;
  message: string;
  createdAt: string;
}

export default function ServerChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeChannel, setActiveChannel] = useState<{ game: string; group: string } | null>(null);
  const [channels, setChannels] = useState<{ game: string; group: string }[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchMessages = async () => {
    let url = "/api/chat";
    if (activeChannel) {
      url += `?game=${activeChannel.game}&group=${activeChannel.group}`;
    }
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      setMessages(data);
      
      // Auto-extract unique channels if in Global
      if (!activeChannel) {
        const unique = new Map<string, {game: string, group: string}>();
        data.forEach((m: ChatMessage) => {
          if (m.game && m.game !== "UNKNOWN") {
            const key = `${m.game}-${m.group}`;
            if (!unique.has(key)) unique.set(key, { game: m.game, group: m.group });
          }
        });
        setChannels(Array.from(unique.values()));
      }
    }
  };

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 3000);
    return () => clearInterval(interval);
  }, [activeChannel]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;

    await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        game: activeChannel?.game || "",
        group: activeChannel?.group || "",
        message: inputMessage
      })
    });
    
    setInputMessage("");
    fetchMessages();
  };

  return (
    <div className="flex h-[600px] bg-[#111827] rounded-xl border border-white/10 overflow-hidden shadow-2xl">
      {/* Sidebar */}
      <div className="w-64 bg-[#1F2937] border-r border-white/5 flex flex-col">
        <div className="p-4 border-b border-white/5">
          <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wider flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-emerald-400" /> Channels
          </h2>
        </div>
        <div className="overflow-y-auto flex-1 p-2 space-y-1">
          <button
            onClick={() => setActiveChannel(null)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${!activeChannel ? "bg-emerald-500/10 text-emerald-400" : "text-gray-400 hover:bg-white/5 hover:text-gray-200"}`}
          >
            <Globe className="w-4 h-4" /> Global Stream
          </button>
          
          <div className="pt-4 pb-1 px-3 text-xs font-semibold text-gray-500 uppercase">Active Games</div>
          {channels.map((c, i) => (
            <button
              key={i}
              onClick={() => setActiveChannel(c)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors truncate ${activeChannel?.game === c.game && activeChannel?.group === c.group ? "bg-blue-500/10 text-blue-400" : "text-gray-400 hover:bg-white/5 hover:text-gray-200"}`}
            >
              <Users className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{c.game} <span className="opacity-50 text-xs">({c.group})</span></span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-[#0B0F19]">
        {/* Header */}
        <div className="h-14 border-b border-white/5 flex items-center px-6 bg-[#111827]">
          <h3 className="font-semibold text-gray-200 flex items-center gap-2">
            {!activeChannel ? (
              <><Globe className="w-4 h-4 text-emerald-400"/> Global Stream</>
            ) : (
              <><Users className="w-4 h-4 text-blue-400"/> {activeChannel.game} / {activeChannel.group}</>
            )}
          </h3>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 font-mono text-sm">
          {messages.length === 0 ? (
            <div className="h-full flex items-center justify-center text-gray-500">
              No messages found.
            </div>
          ) : (
            messages.map((m) => (
              <div key={m.id} className="flex flex-col">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className={`font-bold ${m.name === 'ADMIN' ? 'text-red-400' : 'text-blue-400'}`}>{m.name}</span>
                  <span className="text-xs text-gray-500">{new Date(m.createdAt).toLocaleTimeString()}</span>
                  {!activeChannel && m.name !== 'ADMIN' && (
                    <span className="text-xs text-emerald-500/70 ml-2 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                      {m.game}/{m.group}
                    </span>
                  )}
                </div>
                <div className="text-gray-300 ml-1 break-words">
                  {m.message}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 bg-[#111827] border-t border-white/5">
          <form onSubmit={sendMessage} className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
              <Terminal className="w-5 h-5" />
            </div>
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder={`Message ${!activeChannel ? "Global Stream" : activeChannel.game}...`}
              className="w-full bg-[#0B0F19] text-gray-200 rounded-lg pl-10 pr-12 py-3 border border-white/10 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all outline-none"
              maxLength={64}
            />
            <button
              type="submit"
              disabled={!inputMessage.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-emerald-500 text-white rounded-md hover:bg-emerald-400 disabled:opacity-50 disabled:hover:bg-emerald-500 transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
