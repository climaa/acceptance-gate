import type { ReactElement } from 'react';

type Screen<P> = (props: object) => ReactElement<P>;

/**
 * The props of the template a page's screen draws. A page returns its screen
 * (`<TagScreen …/>`, `components/`), which draws the template these suites read;
 * the screen is a plain function, so calling it is the one step in between.
 */
export const drawn = <P>(element: ReactElement): P => {
  const { type, props } = element as ReactElement<object, Screen<P>>;

  return type(props).props;
};
