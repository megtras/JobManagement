"use client";

type MegtrasLogoProps = {
  className?: string;
  title?: string;
  /**
   * "default" is the two-colour wordmark with charcoal letters and the yellow
   * T, for light grounds (the white logo panels in the shell). "white" is the
   * single-colour mark for dark or coloured panels.
   *
   * Note the brand kit's own `megtras-wordmark.svg` is the two-colour mark in
   * *ivory* — made for the dark marketing site, and effectively invisible on a
   * white panel. `-dark.svg` is the same artwork with charcoal ink; the yellow
   * T is untouched, as the brand rules require.
   */
  variant?: "default" | "white";
};

// Brand wordmark from the approved Megtras artwork in /public/brand. The SVG is
// the master; object-contain preserves its aspect ratio in every box it's
// placed in. Brand rule: below 140px wide use the monogram instead.
export function MegtrasLogo({
  className = "",
  title = "Megtras logo",
  variant = "default",
}: MegtrasLogoProps) {
  const src =
    variant === "white"
      ? "/brand/megtras-wordmark-white.svg"
      : "/brand/megtras-wordmark-dark.svg";
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={title} className={`object-contain ${className}`} />;
}
