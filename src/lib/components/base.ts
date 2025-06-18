interface JSXFactory {
  h: (
    tag: string | JSX.Fragment,
    props: JSX.ElementProps,
    ...children: JSX.ElementChild[]
  ) => JSX.Element;

  fragment: JSX.Fragment;
}

export const jsxFactory: JSXFactory = {
  // @ts-ignore
  h(tag, props, ...children) {
    return { tag, props, children };
  },

  fragment({ children }) {
    return children;
  },
};

export abstract class ComponentBase {
  protected createRef<E extends HTMLElement = HTMLElement>(
    setup?: (element: E) => void
  ): JSX.RefElement<E> {
    return {
      current: null,
      setup,
    };
  }

  abstract createElement(): JSX.Element;
}
