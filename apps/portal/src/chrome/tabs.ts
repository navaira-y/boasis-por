import type { ComponentType } from 'react';
import { en } from '../copy/en';
import { IconBoard, IconBook, IconCompany, IconServices, IconYear } from '../lib/icons';

// Lite's main bar: where am I in the app. Everything a company holds lives inside that company,
// not here. The inbox opens from the bell in the top bar; access and the account live behind
// the avatar.
export interface PrimaryTab {
  readonly to: string;
  readonly label: string;
  readonly end: boolean;
  readonly Icon: ComponentType<{ readonly size?: number }>;
}

export const primaryTabs: readonly PrimaryTab[] = [
  { to: '/', label: en.nav.home, end: true, Icon: IconYear },
  { to: '/companies', label: en.nav.companies, end: false, Icon: IconCompany },
  { to: '/library', label: en.nav.guides, end: false, Icon: IconBook },
  { to: '/compliance', label: en.nav.compliance, end: false, Icon: IconBoard },
  { to: '/services', label: en.nav.services, end: false, Icon: IconServices },
];
