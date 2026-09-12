/**
 * Published sources the model is built on or checked against. One list,
 * used by the literature tests (which cite these ids) and by the Sources
 * window in the interface. Pure data.
 */

export type ReferenceId =
  | 'martin1998'
  | 'defraeye2010'
  | 'debraux2011'
  | 'malizia2021'
  | 'spicer2001'
  | 'brrGp5000';

export interface Reference {
  id: ReferenceId;
  authors: string;
  year: number | null;
  title: string;
  venue: string;
  url: string;
  /** What this source is used for in the model, in one sentence. */
  usedFor: string;
}

export const REFERENCES: readonly Reference[] = [
  {
    id: 'martin1998',
    authors: 'Martin, Milliken, Cobb, McFadden & Coggan',
    year: 1998,
    title: 'Validation of a mathematical model for road cycling power',
    venue: 'Journal of Applied Biomechanics 14(3), 276–291',
    url: 'https://journals.humankinetics.com/view/journals/jab/14/3/article-p276.xml',
    usedFor:
      'The power equation and drivetrain loss. Tests reproduce their SRM-measured road trials to within 6.4 W RMS.',
  },
  {
    id: 'defraeye2010',
    authors: 'Defraeye, Blocken, Koninckx, Hespel & Carmeliet',
    year: 2010,
    title: 'Aerodynamic study of different cyclist positions: CFD analysis and full-scale wind-tunnel tests',
    venue: 'Journal of Biomechanics',
    url: 'https://pubmed.ncbi.nlm.nih.gov/20171640/',
    usedFor:
      'Position CdA: its table compiles wind-tunnel drag areas for upright, dropped and time-trial positions from ten studies.',
  },
  {
    id: 'debraux2011',
    authors: 'Debraux, Grappe, Manolova & Bertucci',
    year: 2011,
    title: 'Aerodynamic drag in cycling: methods of assessment',
    venue: 'Sports Biomechanics 10(3)',
    url: 'https://www.tandfonline.com/doi/abs/10.1080/14763141.2011.592209',
    usedFor: 'Background on how CdA is measured (wind tunnel, field, and power-based methods).',
  },
  {
    id: 'malizia2021',
    authors: 'Malizia & Blocken',
    year: 2021,
    title: 'Cyclist aerodynamics through time: better, faster, stronger',
    venue: 'Journal of Wind Engineering and Industrial Aerodynamics',
    url: 'https://www.sciencedirect.com/science/article/pii/S0167610521001574',
    usedFor: 'Rider versus bike share of drag (rider 64–82 %), which sets how large the rider plumes are.',
  },
  {
    id: 'spicer2001',
    authors: 'Spicer, Richardson, Ehrlich, Bernstein, Fukuda & Terada',
    year: 2001,
    title: 'Effects of frictional loss on bicycle chain drive efficiency',
    venue: 'Journal of Mechanical Design 123(4), 598–605',
    url: 'https://asmedigitalcollection.asme.org/mechanicaldesign/article-abstract/123/4/598/445688/Effects-of-Frictional-Loss-on-Bicycle-Chain-Drive',
    usedFor: 'Chain drive efficiency range, supporting a drivetrain loss of a few percent.',
  },
  {
    id: 'brrGp5000',
    authors: 'Bicycle Rolling Resistance',
    year: null,
    title: 'Continental Grand Prix 5000: 23, 25, 28 and 32 mm comparison',
    venue: 'Drum tests at 29 km/h, 42.5 kg wheel load',
    url: 'https://www.bicyclerollingresistance.com/specials/grand-prix-5000-comparison',
    usedFor: 'Racing-tire rolling resistance and how it changes with tire width.',
  },
];

/** Values in the model that no single peer-reviewed benchmark pins down yet. */
export const UNVALIDATED_NOTE =
  'Helmet, clothing, frame and wheel drag changes are midpoints of published ranges and manufacturer or magazine tunnel tests, which disagree. Treat them as estimates.';

export function referenceById(id: ReferenceId): Reference {
  const ref = REFERENCES.find((r) => r.id === id);
  if (!ref) throw new Error(`Unknown reference ${id}`);
  return ref;
}
