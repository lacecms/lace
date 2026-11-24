## REMOVED Requirements

### Requirement: Gallery version 6 migrates rc2 galleries

**Reason**: The supported RC5 release already ships gallery version 6. The built-in v5 conversion and its version-specific tests serve an older upgrade origin.

**Migration**: Complete configuration synchronization with the RC5 engine before cutover. Preserve stored version 6 data, settings, authored order and rendering in 1.0.0. The shared synchronization contract continues to report a missing migration step for unsupported data.
