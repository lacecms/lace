## MODIFIED Requirements

### Requirement: Worker image inspection matches the portable media policy
The Worker SHALL verify uploaded JPEG, PNG, GIF, WebP, and AVIF images without
a native image library. Inspection SHALL walk the complete container structure of
the declared format, reject a format mismatch, truncated or malformed structure,
missing dimensions, and any trailing bytes after the container's end, and SHALL
return the displayed dimensions after applying the image's embedded orientation,
so a 90- or 270-degree orientation swaps width and height. A GIF SHALL be
walked through its header, logical screen descriptor, optional color tables,
every extension and image block with its data sub-blocks, and its trailer.
Failures SHALL use the same stable invalid-media error as the Node inspector.

#### Scenario: A rotated JPEG is inspected
- **WHEN** a JPEG stored as 400×200 declares an EXIF orientation of 6
- **THEN** inspection reports a width of 200 and a height of 400

#### Scenario: A format mismatch is inspected
- **WHEN** PNG bytes are inspected as `image/jpeg`
- **THEN** inspection fails with the stable invalid-media error

#### Scenario: Trailing data follows a valid image
- **WHEN** otherwise valid image bytes are followed by extra bytes after the
  container end
- **THEN** inspection fails with the stable invalid-media error

#### Scenario: An animated GIF is inspected
- **WHEN** a GIF89a with a 320×240 logical screen, a global color table and
  three frames is inspected
- **THEN** inspection reports a width of 320 and a height of 240
