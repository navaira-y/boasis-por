import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <section>
      <h1>Nothing here</h1>
      <p>
        <Link to="/">Back to home</Link>
      </p>
    </section>
  );
}
