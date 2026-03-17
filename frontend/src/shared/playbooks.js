import { PLAYBOOK_KEYS } from '../config.js';

export const PLAYBOOKS = [
  {
    key: PLAYBOOK_KEYS.FARMLAND_INCOME,
    label: 'Farmland Income',
    shortLabel: 'Farmland Income',
    status: 'live',
    statusLabel: 'Live',
    description: 'Income-oriented farmland screening, underwriting, and research using county valuation, hazards, soil, and irrigation evidence.',
    universeLabel: 'Modeled U.S. counties with farmland-style valuation inputs',
    unitsLabel: 'Per-acre values and rent',
    assetType: 'agriculture_land',
    targetUseCase: 'farmland_income',
  },
  {
    key: PLAYBOOK_KEYS.INDUSTRIAL_LAND,
    label: 'Industrial Land',
    shortLabel: 'Industrial Land',
    status: 'in_build',
    statusLabel: 'In Build',
    description: 'Power, logistics, hazard, and site-readiness perspectives for industrial land and future conversion use cases.',
  },
  {
    key: PLAYBOOK_KEYS.POWERED_SITES,
    label: 'Powered Sites',
    shortLabel: 'Powered Sites',
    status: 'planned',
    statusLabel: 'Planned',
    description: 'Future perspective for power- and infrastructure-sensitive land such as data center and grid-adjacent sites.',
  },
  {
    key: PLAYBOOK_KEYS.DEVELOPMENT_LAND,
    label: 'Development Land',
    shortLabel: 'Development Land',
    status: 'planned',
    statusLabel: 'Planned',
    description: 'Future perspective for development-oriented land where site, entitlement, and infrastructure readiness drive value.',
  },
];

export function getPlaybook(key) {
  return PLAYBOOKS.find((playbook) => playbook.key === key) || PLAYBOOKS[0];
}

export function playbookBadgeClass(status) {
  if (status === 'live') return 'badge-g';
  if (status === 'in_build') return 'badge-b';
  return 'badge-a';
}

export function playbookNavLabel(playbook) {
  return playbook?.shortLabel || 'Playbook';
}
