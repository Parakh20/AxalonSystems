// website/nextjs/components/Platform/LiveMap.tsx
"use client";

import { useEffect, useRef } from "react";
import type { LatLon } from "@/lib/track";

// Leaflet is loaded client-side only (same approach as PlanMap.tsx).
interface Props {
  position: LatLon | null;
  headingDeg: number;
  track: LatLon[];
  follow?: boolean;
}

export default function LiveMap({ position, headingDeg, track, follow = true }: Props) {
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const lineRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // init map once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current).setView([20, 0], 2);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);
      mapRef.current = map;
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // update marker + breadcrumb on telemetry
  useEffect(() => {
    if (!mapRef.current || !position) return;
    (async () => {
      const L = (await import("leaflet")).default;
      const map = mapRef.current;
      const latlng: [number, number] = [position.lat, position.lon];

      // rotated drone marker via a divIcon (▲ rotated to heading)
      const icon = L.divIcon({
        className: "live-drone-marker",
        html: `<div style="transform:rotate(${headingDeg}deg)">▲</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      if (!markerRef.current) {
        markerRef.current = L.marker(latlng, { icon }).addTo(map);
      } else {
        markerRef.current.setLatLng(latlng);
        markerRef.current.setIcon(icon);
      }

      const pts = track.map((p) => [p.lat, p.lon] as [number, number]);
      if (!lineRef.current) {
        lineRef.current = L.polyline(pts, { color: "#14b8a6", weight: 2 }).addTo(map);
      } else {
        lineRef.current.setLatLngs(pts);
      }

      if (follow) map.panTo(latlng, { animate: true });
      if (map.getZoom() < 15) map.setView(latlng, 17);
    })();
  }, [position, headingDeg, track, follow]);

  return <div ref={containerRef} className="live-map" />;
}
