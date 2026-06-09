export type PageType = "home" | "plp" | "pdp" | "search" | "campaign" | "content" | "unknown";

export type ExtractedPageData = {
  url: string;
  finalUrl: string;
  title: string | null;
  metaDescription: string | null;
  visibleText: string;
  headings: {
    h1: string[];
    h2: string[];
    h3: string[];
  };
  links: {
    text: string;
    href: string;
  }[];
  buttons: {
    text: string;
    type?: string;
    ariaLabel?: string;
  }[];
  elements?: {
    tag: string;
    text: string;
    ariaLabel?: string;
    ariaControls?: string;
    ariaExpanded?: string;
    title?: string;
    role?: string;
    id?: string;
    className?: string;
    href?: string;
    type?: string;
    name?: string;
    dataTestId?: string;
    dataAction?: string;
    dataToggle?: string;
    dataTarget?: string;
  }[];
  forms: {
    action?: string;
    method?: string;
    fields: {
      name?: string;
      type?: string;
      placeholder?: string;
      label?: string;
    }[];
  }[];
  landmarks?: {
    area: "header" | "main" | "footer" | "nav" | "unknown";
    text: string;
    links: {
      text: string;
      href: string;
    }[];
  }[];
  consoleErrors: string[];
  failedRequests: {
    url: string;
    status?: number;
    errorText?: string;
  }[];
  images: {
    src: string;
    alt?: string;
  }[];
  scripts: {
    src: string;
    isExternal: boolean;
  }[];
};
