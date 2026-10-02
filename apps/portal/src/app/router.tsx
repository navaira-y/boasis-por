import { createHashRouter, type RouteObject } from 'react-router-dom';
import { Shell } from '../chrome/Shell';
import { Access } from '../screens/Access';
import { AddCompany } from '../screens/AddCompany';
import { AddNew } from '../screens/add/AddNew';
import { Calendar } from '../screens/Calendar';
import { CardPage } from '../screens/CardPage';
import { ComplianceBoard } from '../screens/ComplianceBoard';
import { CompanyFile } from '../screens/CompanyFile';
import { Companies } from '../screens/Companies';
import { CompanyHome } from '../screens/CompanyHome';
import { CostView } from '../screens/CostView';
import { DecisionPoint } from '../screens/DecisionPoint';
import { Home } from '../screens/Home';
import { Inbox } from '../screens/Inbox';
import { Library, LibraryEntryPage } from '../screens/Library';
import { Billing } from '../screens/me/Billing';
import { ManagedCompanies } from '../screens/me/ManagedCompanies';
import { Profile } from '../screens/me/Profile';
import { Security } from '../screens/me/Security';
import { NotFound } from '../screens/NotFound';
import {
  OnboardingEntry,
  OnboardingLicence,
  OnboardingStepRoute,
} from '../screens/onboarding/Onboarding';
import { Verify } from '../screens/onboarding/Verify';
import { PersonPage } from '../screens/PersonPage';
import { ReminderSettings } from '../screens/ReminderSettings';
import { Services } from '../screens/Services';
import { SignIn } from '../screens/SignIn';
import { Trackers } from '../screens/Trackers';
import { YearView } from '../screens/YearView';

// The component gallery exists only in a development build: the branch below is dead code in
// production, so the gallery and its chunk never reach dist.
const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [
      {
        path: '/dev/gallery',
        lazy: async () => {
          const { Gallery } = await import('../dev/Gallery');
          return { Component: Gallery };
        },
      },
    ]
  : [];

// Hash routing: the built app works from any path and inside a phone-app wrapper.
export const router = createHashRouter([
  ...devRoutes,
  {
    element: <Shell />,
    children: [
      // Screens role (home, chrome, profile, offices): lite's home, the company list, the
      // company page and its office tab, the profile panel's screens under /me, the add-company
      // doors, and the menu's placeholders until their owners' screens land.
      { path: '/', element: <Home /> },
      { path: '/companies', element: <Companies /> },
      { path: '/companies/:id', element: <CompanyHome /> },
      { path: '/companies/:id/offices', element: <CompanyHome tab="office" /> },
      { path: '/companies/:id/renewals', element: <CompanyHome tab="settings" /> },
      { path: '/companies/:id/documents', element: <CompanyHome tab="documents" /> },
      { path: '/companies/:id/people', element: <CompanyHome tab="people" /> },
      { path: '/companies/:id/year', element: <YearView /> },
      { path: '/services', element: <Services /> },
      { path: '/me/profile', element: <Profile /> },
      { path: '/me/security', element: <Security /> },
      { path: '/me/access', element: <Access /> },
      { path: '/me/notifications', element: <ReminderSettings /> },
      { path: '/me/billing', element: <Billing /> },
      { path: '/me/companies', element: <ManagedCompanies /> },
      { path: '/add-company', element: <AddCompany /> },
      { path: '/add-company/new', element: <AddNew /> },
      // End of the screens role block.
      // Onboarding-screens role (onboarding v2): the existing-company branch of Add a company is
      // the onboarding; the account's email is verified first.
      { path: '/add-company/existing', element: <OnboardingEntry /> },
      { path: '/add-company/existing/licence', element: <OnboardingLicence /> },
      { path: '/onboarding/:companyId/:step', element: <OnboardingStepRoute /> },
      { path: '/verify', element: <Verify /> },
      // End of the onboarding-screens block.
      { path: '/companies/:id/file', element: <CompanyFile /> },
      { path: '/companies/:id/people/:personId', element: <PersonPage /> },
      // Screens role (compliance): the board, the card page, the decision point, the
      // trackers, the calendar and the cost view, across companies and per company.
      { path: '/compliance', element: <ComplianceBoard /> },
      { path: '/companies/:id/compliance', element: <ComplianceBoard /> },
      { path: '/companies/:id/compliance/:cardId', element: <CardPage /> },
      { path: '/calendar', element: <Calendar /> },
      { path: '/companies/:id/calendar', element: <Calendar /> },
      { path: '/costs', element: <CostView /> },
      { path: '/companies/:id/costs', element: <CostView /> },
      { path: '/companies/:id/decision', element: <DecisionPoint /> },
      { path: '/companies/:id/trackers/:trackerId', element: <Trackers /> },
      // End of the compliance block.
      { path: '/library', element: <Library /> },
      // Screens role (feat/screens-people): the library entry page.
      { path: '/library/:entryId', element: <LibraryEntryPage /> },
      { path: '/inbox', element: <Inbox /> },
      { path: '/auth', element: <SignIn /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);
