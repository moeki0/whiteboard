import React from 'react';
import { GoogleMapEmbed } from './GoogleMapEmbed';
import { OpenStreetMapEmbed } from './OpenStreetMapEmbed';

interface MapEmbedProps {
  latitude: number;
  longitude: number;
  width?: string;
  height?: string;
}

export function MapEmbed(props: MapEmbedProps) {
  const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  
  // Google Maps APIキーがある場合はGoogle Maps、ない場合はOpenStreetMapを使用
  if (googleMapsApiKey) {
    return <GoogleMapEmbed {...props} />;
  } else {
    return <OpenStreetMapEmbed {...props} />;
  }
}