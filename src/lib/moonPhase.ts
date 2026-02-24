// Moon phase calculation utilities

export interface MoonPhaseInfo {
  phase: string;
  emoji: string;
  illumination: number;
  label: string;
}

export function getMoonPhase(date: Date = new Date()): MoonPhaseInfo {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  // Simplified moon phase calculation
  let c = 0, e = 0, jd = 0, b = 0;

  if (month < 3) {
    c = year - 1;
    e = month + 12;
  } else {
    c = year;
    e = month;
  }

  jd = Math.floor(365.25 * (c + 4716)) + Math.floor(30.6001 * (e + 1)) + day - 1524.5;
  b = jd - 2451549.5;
  const daysInCycle = b / 29.53058770576;
  const phase = daysInCycle - Math.floor(daysInCycle);
  const phaseDay = phase * 29.53;

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
