import React from 'react';

interface GoogleMapEmbedProps {
  latitude: number;
  longitude: number;
  width?: string;
  height?: string;
}

export function GoogleMapEmbed({ 
  latitude, 
  longitude, 
  width = '100%', 
  height = '200px' 
}: GoogleMapEmbedProps) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const mapUrl = `https://www.google.com/maps/embed/v1/view?key=${apiKey}&center=${latitude},${longitude}&zoom=15`;
  
  return (
    <iframe
      role="presentation"
      src={mapUrl}
      width={width}
      height={height}
      style={{ border: 0 }}
      allowFullScreen
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
    />
  );
}