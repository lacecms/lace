## ADDED Requirements

### Requirement: Image descriptions carry optional thumbnail access
When resolved media offers a build thumbnail reader, the image description SHALL carry that same opaque reader with the public image attributes. Computing the description SHALL never invoke it or access the network. Media without the reader SHALL yield a description without one.

#### Scenario: A gallery image and a poster describe the same media
- **WHEN** both describe a resolved item that offers thumbnail access
- **THEN** their descriptions carry the same reader with their own usage alt text, and describing either image makes no thumbnail request
