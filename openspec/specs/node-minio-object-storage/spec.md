# node-minio-object-storage Specification

## Purpose

Defines the Node deployment's private S3-compatible object storage behavior.
The contract preserves portable binary streaming and safe startup.

## Requirements

### Requirement: Node object storage uses a private verified S3 bucket
The Node runtime SHALL use configured S3-compatible object storage for verified
media objects. It SHALL validate the endpoint, bucket name, region, access key,
secret, and positive bounded timeout at startup without logging supplied secret
values. Before accepting traffic, startup SHALL verify that its configured
bucket is reachable and exists; failure SHALL prevent readiness and serving
media rather than silently falling back to in-memory or public storage.

#### Scenario: A configured bucket is available
- **WHEN** Node starts with valid private S3-compatible storage settings and an
  existing bucket
- **THEN** media storage is initialized for that bucket and the service can
  become ready without exposing storage credentials or a public bucket URL

#### Scenario: Bucket validation fails
- **WHEN** the endpoint, credentials, or configured bucket are invalid or the
  bucket cannot be reached before the storage timeout
- **THEN** the Node service does not begin serving and reports only a sanitized
  configuration or dependency failure

### Requirement: Node object operations retain bounded streaming semantics
The Node storage adapter SHALL stream object writes and reads through the
portable byte-stream boundary without retaining arbitrary object bodies in
memory. Every object operation SHALL have the configured bounded timeout and
shall fail without returning a partial successful result when the object store
is absent, times out, or reports an error. A missing object read SHALL be
distinguished from a successful empty object and returned as absent.

#### Scenario: A verified object is streamed through storage
- **WHEN** an allowed media object is written and subsequently read through the
  Node storage capability
- **THEN** its byte stream and stored object length are preserved without
  exposing the bucket credentials or changing the opaque key

#### Scenario: Object storage is unavailable
- **WHEN** an object write, read, or deletion exceeds its timeout or the object
  store returns an infrastructure error
- **THEN** the caller receives a sanitized failure and no partial response body
  is represented as a successfully stored or retrieved object
