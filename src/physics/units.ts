export const KMH_PER_MS = 3.6;
export const MPH_PER_MS = 2.2369362920544;
export const LB_PER_KG = 2.2046226218488;

export const kmhToMs = (kmh: number): number => kmh / KMH_PER_MS;
export const msToKmh = (ms: number): number => ms * KMH_PER_MS;
export const mphToMs = (mph: number): number => mph / MPH_PER_MS;
export const msToMph = (ms: number): number => ms * MPH_PER_MS;
export const lbToKg = (lb: number): number => lb / LB_PER_KG;
export const kgToLb = (kg: number): number => kg * LB_PER_KG;
export const percentToGrade = (pct: number): number => pct / 100;
export const gradeToPercent = (grade: number): number => grade * 100;
