// Moon phase calculation utilities

export interface MoonPhaseInfo {
  phase: string;
  emoji: string;
  illumination: number;
  label: string;
}

export function getMoonPhase(date: Date = new Date()): MoonPhaseInfo {
  // Reference: Known New Moon on January 6, 2000 at 18:14 UTC
  const knownNewMoon = new Date(Date.UTC(2000, 0, 6, 18, 14, 0));
  const synodicMonth = 29.53058770576;

  const diffMs = date.getTime() - knownNewMoon.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  const cycleProgress = diffDays / synodicMonth;
  const phase = cycleProgress - Math.floor(cycleProgress);
  const phaseDay = phase * synodicMonth;

  if (phaseDay < 1.84566) return { phase: "new", emoji: "🌑", illumination: 0, label: "Lua Nova" };
  if (phaseDay < 5.53699) return { phase: "waxing-crescent", emoji: "🌒", illumination: 0.17, label: "Crescente Côncava" };
  if (phaseDay < 9.22831) return { phase: "first-quarter", emoji: "🌓", illumination: 0.5, label: "Quarto Crescente" };
  if (phaseDay < 12.91963) return { phase: "waxing-gibbous", emoji: "🌔", illumination: 0.75, label: "Crescente Convexa" };
  if (phaseDay < 16.61096) return { phase: "full", emoji: "🌕", illumination: 1, label: "Lua Cheia" };
  if (phaseDay < 20.30228) return { phase: "waning-gibbous", emoji: "🌖", illumination: 0.75, label: "Minguante Convexa" };
  if (phaseDay < 23.99361) return { phase: "last-quarter", emoji: "🌗", illumination: 0.5, label: "Quarto Minguante" };
  if (phaseDay < 27.68493) return { phase: "waning-crescent", emoji: "🌘", illumination: 0.17, label: "Minguante Côncava" };
  return { phase: "new", emoji: "🌑", illumination: 0, label: "Lua Nova" };
}
