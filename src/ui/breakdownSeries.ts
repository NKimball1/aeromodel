/**
 * The four power sinks and their colours, shared by the breakdown bar and the
 * share-by-speed chart so each keeps the same colour everywhere.
 *
 * Categorical slots 1–4 of the validated reference palette, in fixed order.
 * Adjacent-pair CVD and normal-vision checks pass; aqua and yellow are under
 * 3:1 on the surface, so values are always printed beside them too.
 */
export type ShareKey = 'aero' | 'rolling' | 'gravity' | 'drivetrain';

export const BREAKDOWN_SERIES: ReadonlyArray<{ key: ShareKey; label: string; color: string }> = [
  { key: 'aero', label: 'Aero', color: '#2a78d6' },
  { key: 'rolling', label: 'Rolling', color: '#eb6834' },
  { key: 'gravity', label: 'Gravity', color: '#1baf7a' },
  { key: 'drivetrain', label: 'Drivetrain', color: '#eda100' },
];

/** Ink or white, whichever reads better on a fill colour. */
export function textOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  const onWhite = 1.05 / (L + 0.05);
  const onInk = (L + 0.05) / 0.05;
  return onWhite >= onInk ? '#ffffff' : '#0b0b0b';
}
