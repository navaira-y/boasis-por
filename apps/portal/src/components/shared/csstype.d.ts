// Lets a component pass a custom property in a style object, for example the colour slot an
// avatar resolved from its hash. Values still come from tokens.css; this only carries the name.
import 'csstype';

declare module 'csstype' {
  // An index signature is the only shape that merges into csstype's own interface.
  // eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style
  interface Properties {
    [customProperty: `--${string}`]: string | number | undefined;
  }
}
