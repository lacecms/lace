import {
  actorId,
  contentEntryId,
  contentModelKey,
  contentSnapshotId,
  type ActorId,
  type ContentEntryId,
  type ContentModelKey,
  type ContentSnapshotId,
} from "./brands.js";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? true
    : false;
type Expect<Value extends true> = Value;

type _actorId = Expect<Equal<ReturnType<typeof actorId>, ActorId>>;
type _entryId = Expect<Equal<ReturnType<typeof contentEntryId>, ContentEntryId>>;
type _modelKey = Expect<Equal<ReturnType<typeof contentModelKey>, ContentModelKey>>;
type _snapshotId = Expect<Equal<ReturnType<typeof contentSnapshotId>, ContentSnapshotId>>;

// @ts-expect-error Distinct domain ID brands must not be interchangeable.
const invalidActor: ActorId = contentEntryId("entry-1");

void invalidActor;
