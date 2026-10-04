## ADDED Requirements

### Requirement: Site-rendering packages stay framework-neutral
The dependency-boundary verification SHALL permit the render core to import only the content package and its own modules, rejecting UI-framework, Node built-in, SDK, contract, and other third-party imports. It SHALL permit the SDK to import only the contracts package, its validation library, and its own modules, so the published-site loader cannot import a UI framework or Node-only API.

#### Scenario: Render core imports a framework
- **WHEN** a render core source file imports `astro`, `react`, a Node built-in, or `@lacecms/sdk`
- **THEN** the dependency-boundary verification fails and names the forbidden import

#### Scenario: Render core imports content
- **WHEN** a render core source file imports `@lacecms/content`
- **THEN** the dependency-boundary verification passes

#### Scenario: SDK imports a framework
- **WHEN** an SDK source file imports `astro` or a Node built-in
- **THEN** the dependency-boundary verification fails and names the forbidden import
