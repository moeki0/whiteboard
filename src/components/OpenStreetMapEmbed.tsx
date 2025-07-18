import React from 'react';

interface OpenStreetMapEmbedProps {
  latitude: number;
  longitude: number;
  width?: string;
  height?: string;
  zoom?: number;
}

export function OpenStreetMapEmbed({ 
  latitude, 
  longitude, 
  width = '100%', 
  height = '200px',
  zoom = 15
}: OpenStreetMapEmbedProps) {
  // OpenStreetMapベースのuMapサービスを使用（APIキー不要）
  const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${longitude-0.01},${latitude-0.01},${longitude+0.01},${latitude+0.01}&layer=mapnik&marker=${latitude},${longitude}`;
  
  return (
    <div style={{ border: '1px solid #ccc', borderRadius: '4px' }}>
      <iframe
        role="presentation"
        src={mapUrl}
        width={width}
        height={height}
        style={{ border: 0, borderRadius: '4px' }}
        loading="lazy"
        title={`Map showing location ${latitude}, ${longitude}`}
      />
    </div>
  );
}