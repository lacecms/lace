// Directory dependencies: site ← template ← generator ← cli.
export { TEMPLATE_FILES, TEMPLATE_VERSION } from "./template/inventory.js";
export {
  renderCloudflareMarkers,
  renderForSite,
  renderSiteMarkers,
  TemplateError,
} from "./template/render.js";
export { normalizeSitePath, SITE_MODES } from "./site/modes.js";
export type { SiteMode, SiteRecord, SiteSelection } from "./site/modes.js";
export { GeneratorError, generateProject } from "./generator/project.js";
export type { GenerateOptions, GeneratedProject, ProjectManifest } from "./generator/project.js";
export { runCli } from "./cli/run.js";
export type { CliTerminal } from "./cli/run.js";
