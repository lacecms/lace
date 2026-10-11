import type {
  MediaMetadataDto,
  UpdateMediaMetadataRequestDto,
  UpdateMediaMetadataResultDto,
} from "@lacecms/contracts";
import { MAX_MEDIA_ALT_LENGTH, MAX_MEDIA_CAPTION_LENGTH } from "@lacecms/contracts";
import { useEffect, useId, useState } from "react";
import { useSessionRecovery } from "../../../entities/session/index.js";
import { errorDescription } from "../../../shared/api/index.js";
import { Button } from "../../../shared/ui/Button/index.js";
import { Input } from "../../../shared/ui/Input/index.js";
import { fieldClass, fieldErrorClass } from "../../../shared/ui/layout/index.js";
import { Textarea } from "../../../shared/ui/Textarea/index.js";
import { isMediaUpdateConflict, metadataIssue } from "../errors.js";
import { FocalPointControl } from "../FocalPointControl/index.js";
import {
  focalPointText,
  isMetadataChanged,
  metadataPatch,
  metadataValues,
  type MediaMetadataValues,
} from "../metadata-form.js";
import { MissingAltWarning } from "../MissingAltWarning/index.js";
import { useMediaMetadataUpdate } from "../useMediaMetadataUpdate.js";

function patchedValues(
  patch: UpdateMediaMetadataRequestDto,
  values: MediaMetadataValues,
): Partial<MediaMetadataValues> {
  return Object.fromEntries(
    (Object.keys(patch) as (keyof MediaMetadataValues)[]).map((key) => [key, values[key]]),
  );
}

function savedMessage(result: UpdateMediaMetadataResultDto) {
  return result.build.status === "queued"
    ? "Metadata saved. A site build was requested so published pages use it."
    : "Metadata saved.";
}

/**
 * Edits an active item's alt text, caption, and focal point with explicit
 * Save and Discard. Saves are guarded by the version the form edits; a newer
 * version is never overwritten without the writer's choice. `latest` is the
 * freshest known copy of the item and replaces the form only while it is clean.
 */
export function MediaMetadataForm({
  latest,
  onDirtyChange,
  onReload,
  onSaved,
}: {
  readonly latest: MediaMetadataDto;
  readonly onDirtyChange: (dirty: boolean) => void;
  /** Reloads `latest` after a conflict. */
  readonly onReload: () => void;
  readonly onSaved: (item: MediaMetadataDto) => void;
}) {
  const id = useId();
  const [base, setBase] = useState(latest);
  const [values, setValues] = useState<MediaMetadataValues>(() => metadataValues(latest));
  const [conflict, setConflict] = useState(false);
  const [message, setMessage] = useState<string | undefined>();
  const update = useMediaMetadataUpdate((result) => {
    setBase(result.media);
    setValues(metadataValues(result.media));
    setMessage(savedMessage(result));
    onSaved(result.media);
  });
  const dirty = isMetadataChanged(metadataValues(base), values);
  const error = update.error;
  const conflicted = conflict || isMediaUpdateConflict(error);
  useSessionRecovery(error);

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  // A clean form follows newer copies of the item; typed values never lose their base.
  const latestIsNewer = Date.parse(latest.updatedAt) > Date.parse(base.updatedAt);
  useEffect(() => {
    if (!latestIsNewer || dirty || conflicted) return;
    setBase(latest);
    setValues(metadataValues(latest));
  }, [conflicted, dirty, latest, latestIsNewer]);

  function change(next: Partial<MediaMetadataValues>) {
    setValues((current) => ({ ...current, ...next }));
    setMessage(undefined);
  }

  function save(against: MediaMetadataDto, patch: UpdateMediaMetadataRequestDto) {
    setMessage(undefined);
    update.mutate(
      { expectedUpdatedAt: against.updatedAt, mediaId: against.id, patch },
      {
        onError: (failure) => {
          if (!isMediaUpdateConflict(failure)) return;
          setConflict(true);
          onReload();
        },
      },
    );
  }

  function discardMine() {
    setBase(latest);
    setValues(metadataValues(latest));
    setConflict(false);
    update.reset();
  }

  // Applies only the writer's own changes on top of the newer version, so values
  // the writer did not touch keep the other person's edits.
  function saveMine() {
    const patch = metadataPatch(metadataValues(base), values);
    setBase(latest);
    setValues({ ...metadataValues(latest), ...patchedValues(patch, values) });
    setConflict(false);
    save(latest, patch);
  }

  const altIssue = conflicted ? undefined : metadataIssue(error, "alt");
  const captionIssue = conflicted ? undefined : metadataIssue(error, "caption");
  const newer = latestIsNewer ? latest : undefined;
  const saving = update.isPending;

  return (
    <form
      aria-labelledby={`${id}-heading`}
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (dirty && !saving && !conflicted)
          save(base, metadataPatch(metadataValues(base), values));
      }}
    >
      <h2 className="m-0 text-sm font-semibold" id={`${id}-heading`}>
        Description
      </h2>
      {base.alt === undefined ? <MissingAltWarning /> : undefined}
      <FocalPointControl
        disabled={saving}
        filename={base.filename}
        mediaId={base.id}
        onChange={(focalPoint) => change({ focalPoint })}
        value={values.focalPoint}
      />
      <fieldset className="m-0 grid min-w-0 gap-4 border-0 p-0" disabled={saving}>
        <div className={fieldClass}>
          <label htmlFor={`${id}-alt`}>Alt text</label>
          <small className="text-xs" id={`${id}-alt-help`}>
            Describes the image for people who cannot see it. Leave empty for decorative images.
          </small>
          <Input
            aria-describedby={`${id}-alt-help${altIssue === undefined ? "" : ` ${id}-alt-error`}`}
            aria-invalid={altIssue !== undefined || undefined}
            id={`${id}-alt`}
            maxLength={MAX_MEDIA_ALT_LENGTH}
            onChange={(event) => change({ alt: event.currentTarget.value })}
            value={values.alt}
          />
          {altIssue === undefined ? undefined : (
            <small className={fieldErrorClass} id={`${id}-alt-error`}>
              {altIssue}
            </small>
          )}
        </div>
        <div className={fieldClass}>
          <label htmlFor={`${id}-caption`}>Caption</label>
          <Textarea
            aria-describedby={captionIssue === undefined ? undefined : `${id}-caption-error`}
            aria-invalid={captionIssue !== undefined || undefined}
            id={`${id}-caption`}
            maxLength={MAX_MEDIA_CAPTION_LENGTH}
            onChange={(event) => change({ caption: event.currentTarget.value })}
            rows={3}
            value={values.caption}
          />
          {captionIssue === undefined ? undefined : (
            <small className={fieldErrorClass} id={`${id}-caption-error`}>
              {captionIssue}
            </small>
          )}
        </div>
      </fieldset>
      {conflicted ? (
        <div className="grid gap-2 rounded-md border border-destructive p-3 text-sm" role="alert">
          <p className="m-0 font-medium">
            Someone else changed this media after you opened it. Your changes are not saved.
          </p>
          {newer === undefined ? (
            <p className="m-0 text-muted-foreground">Loading the newer version…</p>
          ) : (
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs [&_dd]:m-0 [&_dd]:break-words [&_dt]:text-muted-foreground">
              <dt>Newer alt text</dt>
              <dd>{newer.alt ?? "None"}</dd>
              <dt>Newer caption</dt>
              <dd>{newer.caption ?? "None"}</dd>
              <dt>Newer focal point</dt>
              <dd>{focalPointText(newer.focalPoint ?? null)}</dd>
            </dl>
          )}
          <div className="flex flex-wrap gap-2">
            <Button disabled={saving} onClick={discardMine} size="sm" variant="outline">
              Discard my changes
            </Button>
            <Button disabled={saving || newer === undefined} onClick={saveMine} size="sm">
              Save mine anyway
            </Button>
          </div>
        </div>
      ) : error === null || altIssue !== undefined || captionIssue !== undefined ? undefined : (
        <p className={`${fieldErrorClass} text-sm`} role="alert">
          {`The metadata was not saved. ${errorDescription(error)}`}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={!dirty || saving || conflicted} type="submit">
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button
          disabled={!dirty || saving || conflicted}
          onClick={() => {
            setValues(metadataValues(base));
            update.reset();
          }}
          variant="outline"
        >
          Discard
        </Button>
        <p aria-live="polite" className="m-0 text-sm text-muted-foreground" role="status">
          {message}
        </p>
      </div>
    </form>
  );
}
