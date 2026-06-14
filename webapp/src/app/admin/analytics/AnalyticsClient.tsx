'use client';

import { useState, useEffect } from 'react';
import { ComposableMap, Geographies, Geography, Marker } from "react-simple-maps";

const geoUrl = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

export default function AnalyticsClient({ initialData, initialGeo }: { initialData: any, initialGeo: any[] }) {
  const [data] = useState(initialData);
  const [locations] = useState(initialGeo);

  return (
    <div className="p-4 md:p-8 w-full max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex items-center gap-stack-sm mb-stack-lg">
        <span className="material-symbols-outlined text-4xl text-primary">insights</span>
        <h2 className="font-headline-md text-3xl font-bold text-on-surface">Data Analytics</h2>
      </div>

      <div className="grid grid-cols-12 gap-stack-md mb-stack-md">
        {/* Retention Card */}
        <div className="col-span-12 md:col-span-4 glass-card p-card-padding rounded-xl flex flex-col justify-between h-32">
          <div className="flex justify-between items-start">
            <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">Total Unique Players</span>
            <span className="material-symbols-outlined text-primary">group</span>
          </div>
          <div className="font-data-lg text-[32px] text-primary">{data.retention.total}</div>
        </div>

        <div className="col-span-12 md:col-span-4 glass-card p-card-padding rounded-xl flex flex-col justify-between h-32">
          <div className="flex justify-between items-start">
            <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">Returning Players</span>
            <span className="material-symbols-outlined text-secondary">replay</span>
          </div>
          <div className="font-data-lg text-[32px] text-secondary">{data.retention.returning}</div>
        </div>

        <div className="col-span-12 md:col-span-4 glass-card p-card-padding rounded-xl flex flex-col justify-between h-32">
          <div className="flex justify-between items-start">
            <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">Retention Rate</span>
            <span className="material-symbols-outlined text-surface-tint">trending_up</span>
          </div>
          <div className="font-data-lg text-[32px] text-surface-tint">
            {data.retention.total > 0 ? Math.round((data.retention.returning / data.retention.total) * 100) : 0}%
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-stack-md">
        {/* Geo-Location Map */}
        <div className="col-span-12 md:col-span-8 glass-card p-card-padding rounded-xl relative overflow-hidden min-h-[400px]">
          <h3 className="font-headline-sm text-headline-sm text-on-surface mb-stack-sm flex justify-between">
            Player Geo-Location
            <span className="material-symbols-outlined text-on-surface-variant opacity-50">public</span>
          </h3>
          <div className="w-full h-full min-h-[350px] -ml-4 flex items-center justify-center overflow-hidden">
            <ComposableMap projectionConfig={{ scale: 140 }} width={800} height={400} style={{ width: "100%", height: "auto" }}>
              <Geographies geography={geoUrl}>
                {({ geographies }: { geographies: any[] }) =>
                  geographies.map((geo: any) => (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill="#2A2F3D"
                      stroke="#3F465C"
                      strokeWidth={0.5}
                      style={{
                        default: { outline: "none" },
                        hover: { fill: "#3A4052", outline: "none" },
                        pressed: { fill: "#1f222d", outline: "none" }
                      }}
                    />
                  ))
                }
              </Geographies>
              {locations.filter(l => l.lat && l.lon).map((loc, i) => (
                <Marker key={i} coordinates={[loc.lon, loc.lat]}>
                  <circle r={4} fill="#5cc5aa" opacity={0.6} />
                  <circle r={8} fill="#5cc5aa" opacity={0.2} className="animate-ping" />
                </Marker>
              ))}
            </ComposableMap>
          </div>
        </div>

        {/* Game Trend */}
        <div className="col-span-12 md:col-span-4 glass-card p-card-padding rounded-xl flex flex-col">
          <h3 className="font-headline-sm text-headline-sm text-on-surface mb-stack-sm">Trending Games</h3>
          <div className="flex-1 space-y-3 mt-4 overflow-y-auto custom-scrollbar">
            {data.gameTrend.length === 0 ? (
              <div className="text-on-surface-variant text-sm">No games recorded yet.</div>
            ) : (
              data.gameTrend.map((g: any, i: number) => (
                <div key={i} className="flex justify-between items-center p-3 rounded-lg bg-surface-variant/30">
                  <span className="font-data-md text-sm truncate pr-2" title={g.game}>{g.game}</span>
                  <span className="bg-primary/20 text-primary font-bold text-xs px-2 py-1 rounded">{g.count}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Activity History Table */}
        <div className="col-span-12 glass-card p-card-padding rounded-xl mt-4">
          <h3 className="font-headline-sm text-headline-sm text-on-surface mb-stack-sm">Recent Activity History</h3>
          <div className="w-full overflow-x-auto mt-4">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-outline-variant/50">
                  <th className="pb-3 font-label-caps text-xs text-on-surface-variant">Time</th>
                  <th className="pb-3 font-label-caps text-xs text-on-surface-variant">Player</th>
                  <th className="pb-3 font-label-caps text-xs text-on-surface-variant">Game</th>
                  <th className="pb-3 font-label-caps text-xs text-on-surface-variant">IP Address</th>
                </tr>
              </thead>
              <tbody>
                {data.history.map((h: any) => (
                  <tr key={h.id} className="border-b border-outline-variant/30 hover:bg-surface-variant/20 transition-colors">
                    <td className="py-3 font-data-sm text-sm text-on-surface-variant">
                      {new Date(h.joinedAt).toLocaleString()}
                    </td>
                    <td className="py-3 font-data-md text-sm text-on-surface">{h.name}</td>
                    <td className="py-3 font-data-sm text-sm text-surface-tint">{h.game}</td>
                    <td className="py-3 font-data-sm text-sm text-on-surface-variant opacity-70">{h.ip.replace(/\.\d+$/, '.***')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
