export interface ParsedUrl {
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;
  readonly href: string;
  readonly password: string;
  readonly protocol: string;
  readonly username: string;
}

// The package compiles without DOM or Node types; every supported runtime provides WHATWG URL.
export const ParsedUrl = (globalThis as unknown as { URL: new (input: string) => ParsedUrl }).URL;
