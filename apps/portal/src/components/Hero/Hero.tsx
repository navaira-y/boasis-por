import { useEffect, useRef, type ReactNode } from 'react';
import heroPoster from '../../assets/hero.jpg';
import heroFilm from '../../assets/hero.mp4';
import { cx } from '../shared/cx';
import { useLayout } from '../shared/LayerProvider';
import { REDUCED_MOTION_QUERY, useMediaQuery } from '../shared/useMediaQuery';
import './Hero.css';

export interface HeroProps {
  // Lite's year block: the dial with its legend, the summary beside it.
  readonly children: ReactNode;
  // The side section: the three groups. Right of the dial on a desktop, under it on a phone.
  readonly aside?: ReactNode;
  // On a phone, the stage starts at the top edge of the screen and passes under the header,
  // which turns transparent until the stage has gone by (lite's home).
  readonly bleed?: boolean;
  readonly className?: string;
}

// The card that carries the watch. Two forms for one object: on a phone it starts at the top
// edge and passes under the header; on a wide screen it closes around the dial and the panel,
// a card set in the page. The film runs behind it in both; someone who asked for less motion
// gets the still.
//
// The phone geometry is measured rather than written: it depends on the text size and on the
// device's safe area. The header height and the "past" state are written onto the shell, the
// one place both the header and the content can read them.
export function Hero({ children, aside, bleed = false, className }: HeroProps) {
  const layout = useLayout();
  const still = useMediaQuery(REDUCED_MOTION_QUERY);
  const stage = useRef<HTMLElement>(null);
  const phoneBleed = bleed && layout === 'phone';

  useEffect(() => {
    if (!phoneBleed) {
      return undefined;
    }
    const node = stage.current;
    const shell = node?.closest<HTMLElement>('.shell') ?? null;
    const header = shell?.querySelector<HTMLElement>('.top-bar') ?? null;
    const body = shell?.querySelector<HTMLElement>('.shell__body') ?? null;
    if (node === null || shell === null || header === null || body === null) {
      return undefined;
    }
    // The scroll from which the stage has passed under the header.
    let edge = 0;
    // What was last painted: repainting on every frame costs a style pass for a value that
    // changes twice.
    let was: boolean | null = null;

    const look = () => {
      const past = body.scrollTop > edge;
      if (past === was) {
        return;
      }
      was = past;
      shell.classList.toggle('shell--past', past);
    };
    const measure = () => {
      const stageBox = node.getBoundingClientRect();
      const bodyBox = body.getBoundingClientRect();
      // Measured in the scrolling content, not the screen: adding paddings would be wrong at
      // the first change of layout.
      const bottom = Math.round(stageBox.bottom - bodyBox.top + body.scrollTop);
      shell.style.setProperty('--hdr-h', `${String(header.offsetHeight)}px`);
      edge = bottom - header.offsetHeight;
      look();
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    observer.observe(header);
    observer.observe(body);
    body.addEventListener('scroll', look, { passive: true });
    return () => {
      observer.disconnect();
      body.removeEventListener('scroll', look);
      shell.classList.remove('shell--past');
      shell.style.removeProperty('--hdr-h');
    };
  }, [phoneBleed]);

  return (
    <section
      ref={stage}
      className={cx('hero', `hero--${layout}`, phoneBleed && 'hero--bleed', className)}
    >
      <div className="hero__film" aria-hidden="true">
        {still ? (
          <img src={heroPoster} alt="" />
        ) : (
          <video
            src={heroFilm}
            poster={heroPoster}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            tabIndex={-1}
          />
        )}
      </div>
      <div className="hero__inner">
        <div className="hero__year">{children}</div>
        {aside !== undefined ? <aside className="hero__side">{aside}</aside> : null}
      </div>
    </section>
  );
}
