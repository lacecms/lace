// Vitest compiles these modules through Astro; tsc checks their consumers.
declare module "*.astro" {
  const component: import("astro/runtime/server/index.js").AstroComponentFactory;
  export default component;
}
