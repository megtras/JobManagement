"use client";

type GenPlusLogoProps = {
  className?: string;
  title?: string;
};

// Brand logo as a raster asset at /public/gen-logo.png (no SVG conversion).
// object-contain preserves its aspect ratio in every box it's placed in.
export function GenPlusLogo({ className = "", title = "GenPlus logo" }: GenPlusLogoProps) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/gen-logo.png" alt={title} className={`object-contain ${className}`} />;
}
