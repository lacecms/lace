/**
 * Type-level mirror checks between an application result and a contracts
 * projection input. A check is `true` when the application type is assignable
 * to the source, every application key is projected or named in `Omitted`,
 * every source key exists on the application type, each shared key has the
 * same optionality, and every key named in `Nested` (an object, or an array
 * whose element is compared) mirrors by the same rules. Otherwise the result
 * is an object naming the failure, so `true satisfies Mirrors<…>` fails to
 * typecheck and the error shows which pair drifted.
 */
export type Mirrors<
  App,
  Source,
  Omitted extends keyof App = never,
  Nested extends keyof App & keyof Source = never,
> = [App] extends [Source]
  ? [Exclude<keyof App, keyof Source | Omitted>] extends [never]
    ? [Exclude<keyof Source, keyof App>] extends [never]
      ? [OptionalityDrift<App, Source>] extends [never]
        ? [NestedDrift<App, Source, Nested>] extends [never]
          ? true
          : { nested: NestedDrift<App, Source, Nested> }
        : { optionality: OptionalityDrift<App, Source> }
      : { sourceOnly: Exclude<keyof Source, keyof App> }
    : { unprojected: Exclude<keyof App, keyof Source | Omitted> }
  : { notAssignable: [App, Source] };

type IsOptional<Value, Key extends keyof Value> = {} extends Pick<Value, Key> ? true : false;

/** Shared keys that are optional on one side only. */
type OptionalityDrift<App, Source> = {
  [Key in keyof App & keyof Source]: IsOptional<App, Key> extends IsOptional<Source, Key>
    ? IsOptional<Source, Key> extends IsOptional<App, Key>
      ? never
      : Key
    : Key;
}[keyof App & keyof Source];

type Element<Value> = Value extends readonly (infer Item)[] ? Item : Value;

/** Declared nested keys whose object or array-element shapes do not mirror. */
type NestedDrift<App, Source, Nested extends keyof App & keyof Source> = {
  [Key in Nested]: Mirrors<
    Element<NonNullable<App[Key]>>,
    Element<NonNullable<Source[Key]>>
  > extends true
    ? never
    : Key;
}[Nested];
