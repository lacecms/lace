/// <reference types="astro/client" />

// Lets `tsc` type `.astro` imports in TypeScript modules such as the block map.
declare module "*.astro" {
  const component: (props: Record<string, unknown>) => unknown;
  export default component;
}
