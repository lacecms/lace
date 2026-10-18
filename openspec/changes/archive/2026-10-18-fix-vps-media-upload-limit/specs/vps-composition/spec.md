## ADDED Requirements

### Requirement: The VPS proxy forwards media uploads up to the API limit
The VPS reverse proxy SHALL accept on `POST /api/v1/admin/media` a request
body at least as large as the API's media upload ceiling plus a multipart
allowance of no more than 1 MiB, and SHALL forward that body to the API as it
arrives instead of buffering it first, so the API's own streaming size
boundary decides. Every other request SHALL keep a body limit equal to the
API's default JSON body limit of 1 MiB. The repository's and the generated
project's proxy configurations SHALL be identical.

#### Scenario: An image above 1 MiB passes the proxy
- **WHEN** an editor uploads a valid 8 MiB JPEG through the VPS public origin
- **THEN** the proxy forwards all of its bytes and the API creates the media
  item

#### Scenario: An upload above the ceiling is refused
- **WHEN** a client sends a 12 MiB body to the media upload route
- **THEN** the proxy or the API refuses it with `413` and no media is created

#### Scenario: Other API routes keep the JSON limit
- **WHEN** a client sends a 2 MiB body to an entry save route through the
  proxy
- **THEN** the proxy refuses it with `413`

#### Scenario: Proxy configurations cannot drift
- **WHEN** the API's media upload ceiling changes or one proxy configuration
  is edited without the other
- **THEN** the repository test suite fails until both configurations allow
  the new ceiling and are identical again
