import { en } from '../copy/en';
import { flags } from '../flags';
import { IconServices } from '../lib/icons';
import './lite.css';

// Services (spec 9A, MVP 2), behind the services flag: until it is on, lite's coming-soon
// block in lite's words. When the flag turns on, the request form and tracker land here.
export function Services() {
  return (
    <div className="pg">
      <div className="vhead">
        <div>
          <h2>{en.services.title}</h2>
          <p>{en.services.sub}</p>
        </div>
      </div>
      {flags.services ? null : (
        <div className="soon2">
          <span className="ic">
            <IconServices size={22} />
          </span>
          <h2>{en.services.soonTitle}</h2>
          <p>{en.services.soonBody}</p>
        </div>
      )}
    </div>
  );
}
