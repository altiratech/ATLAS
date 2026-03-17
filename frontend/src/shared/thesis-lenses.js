import { PLAYBOOK_KEYS } from '../config.js';

export const THESIS_LENSES = [
  {
    key: 'ag_transition_thesis',
    label: 'Ag Transition Thesis',
    shortLabel: 'Ag Transition',
    status: 'live',
    statusLabel: 'Live',
    playbookKeys: [PLAYBOOK_KEYS.FARMLAND_INCOME],
    description: 'Surface counties that could matter if labor pressure, automation, consolidation, and policy stress force a faster agricultural transition.',
    question: 'Where could labor pressure, automation, and policy shifts create enough stress or adaptation demand to move land, infrastructure, or underwriting outcomes?',
    nowSignals: [
      'Valuation pressure through cap rate, rent multiple, and fair-value spread',
      'Productive base through NRCS farmland share, soil water storage, and irrigation footprint',
      'Physical fragility through drought and flood burden',
      'Movement and infrastructure context through access score and power proxies where available',
    ],
    gapSignals: [
      'No direct labor scarcity, H-2A, wage, broadband, or robotics-adoption series are live yet',
      'Use this as a transition-thesis screen built from current land and infrastructure proxies, not as a direct labor-market model',
    ],
    defaultPreset: 'ag_transition_thesis',
    assetType: 'agriculture_land',
    targetUseCase: 'ag_transition_thesis',
    starterCards: [
      {
        key: 'ag_transition_thesis',
        title: 'Transition-Ready Counties',
        body: 'Start with productive counties that also have enough access and manageable hazard load to matter if agricultural transition accelerates.',
      },
      {
        key: 'decision_ready',
        title: 'Observed-First Transition Base',
        body: 'Bias toward counties with fuller underwriting lineage before stretching the transition thesis into more proxy-heavy rows.',
      },
      {
        key: 'resilient_production_base',
        title: 'Resilient Production Base',
        body: 'Use today’s soil, water, and hazard stack to find counties that could support long-duration adaptation and automation investment.',
      },
    ],
  },
  {
    key: 'resilient_production_base',
    label: 'Resilient Production Base',
    shortLabel: 'Resilient Base',
    status: 'live',
    statusLabel: 'Live',
    playbookKeys: [PLAYBOOK_KEYS.FARMLAND_INCOME],
    description: 'Find counties with strong land quality, visible irrigation footprint, and more manageable physical risk before layering on a narrower thesis.',
    question: 'Which counties look like durable agricultural production bases once soil, water, and physical risk are weighed together?',
    nowSignals: [
      'NRCS farmland share and AWS 100cm for land quality',
      'Irrigated acres for water-footprint context',
      'Drought and flood burden for resilience pressure',
      'Benchmark, fair value, and cap rate for underwriting context',
    ],
    gapSignals: [
      'No direct groundwater-depletion, labor, or farm-tech adoption signal is wired yet',
      'This is a land-quality and resilience lens first, not a full operations model',
    ],
    defaultPreset: 'resilient_production_base',
    assetType: 'agriculture_land',
    targetUseCase: 'resilient_production_base',
    starterCards: [
      {
        key: 'resilient_production_base',
        title: 'Core Resilience Screen',
        body: 'Prioritize counties where the productive base stays strong even before deeper operational or policy work begins.',
      },
      {
        key: 'irrigated_quality',
        title: 'Irrigated Quality',
        body: 'Lean into counties with visible irrigation footprint and higher-quality soil context.',
      },
      {
        key: 'quality_land',
        title: 'High-Quality Land',
        body: 'Use soil and hazard filters to create a cleaner starting universe for deeper underwriting.',
      },
    ],
  },
  {
    key: 'powered_ag_processing',
    label: 'Powered Ag Processing',
    shortLabel: 'Powered Processing',
    status: 'in_build',
    statusLabel: 'In Build',
    playbookKeys: [PLAYBOOK_KEYS.FARMLAND_INCOME],
    description: 'Future lens for counties where agricultural production, power, logistics, and processing infrastructure may converge into a stronger physical-world thesis.',
    question: 'Where could ag production, power cost, logistics access, and processing demand create a stronger physical infrastructure opportunity?',
    nowSignals: [
      'Access and industrial power fields where available',
      'Agricultural production base through yields, soil, and irrigation',
    ],
    gapSignals: [
      'Processing, labor, broadband, and facility-level infrastructure data are not yet sufficient for a live lens',
    ],
    defaultPreset: '',
    assetType: 'agriculture_land',
    targetUseCase: 'powered_ag_processing',
    starterCards: [],
  },
];

export function getThesisLensesForPlaybook(playbookKey) {
  return THESIS_LENSES.filter((lens) => !lens.playbookKeys || lens.playbookKeys.includes(playbookKey));
}

export function getDefaultThesisLensKey(playbookKey) {
  return getThesisLensesForPlaybook(playbookKey).find((lens) => lens.status === 'live')?.key
    || getThesisLensesForPlaybook(playbookKey)[0]?.key
    || THESIS_LENSES[0]?.key
    || '';
}

export function getThesisLens(key, playbookKey = null) {
  if (key) {
    const match = THESIS_LENSES.find((lens) => lens.key === key);
    if (match) return match;
  }
  if (playbookKey) {
    return THESIS_LENSES.find((lens) => lens.playbookKeys?.includes(playbookKey)) || THESIS_LENSES[0];
  }
  return THESIS_LENSES[0];
}

export function thesisBadgeClass(status) {
  if (status === 'live') return 'badge-g';
  if (status === 'in_build') return 'badge-b';
  return 'badge-a';
}
