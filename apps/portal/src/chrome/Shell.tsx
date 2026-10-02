import { useLayoutEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { SessionGate } from '../screens/SessionGate';
import { AssistantSlot } from './AssistantSlot';
import { BottomTabs } from './BottomTabs';
import { Rail, TopBar } from './TopBar';
import { cx } from '../components/shared/cx';
import './Shell.css';

// The app frame: lite's header, the rail on a wide screen, the scrolling body, the bottom bar
// on a phone, the assistant slot always. Fixed rather than 100vh so the phone address bar
// cannot make the frame jump. The home is wider than the other screens: it carries a column
// beside the dial; a reading page beyond 680px stops being read. The gate has no menu: there
// is nowhere to go before signing in.
export function Shell() {
  const { pathname } = useLocation();
  const home = pathname === '/';
  // The onboarding carries "Your dates so far" beside the form, so it takes the wide page too.
  const wide =
    home || pathname.startsWith('/onboarding/') || pathname.startsWith('/add-company/existing');
  const gate = pathname === '/auth';
  const body = useRef<HTMLElement>(null);
  // The body is the one scrolling box, so a new screen starts at its top.
  useLayoutEffect(() => {
    body.current?.scrollTo({ top: 0 });
  }, [pathname]);
  return (
    <div className={cx('shell', home && 'shell--athome')}>
      <TopBar />
      {gate ? null : <Rail />}
      <main ref={body} className={cx('shell__body', wide && 'shell__body--wide')}>
        <div className={cx('shell__content', wide && 'shell__content--wide')}>
          <SessionGate>
            <Outlet />
          </SessionGate>
        </div>
      </main>
      {gate ? null : <BottomTabs />}
      <AssistantSlot />
    </div>
  );
}
