import { Info } from "lucide-react";
import { useId } from "react";
import { Badge } from "../../../shared/ui/Badge/index.js";
import { Button } from "../../../shared/ui/Button/index.js";
import { Popover, PopoverContent, PopoverTrigger } from "../../../shared/ui/Popover/index.js";
import { siteBuildStatusGuidance, type SiteBuildStatus } from "../status.js";

/**
 * An info button that opens a click/keyboard/touch popover explaining what a
 * build status means, what it proves about the public site and what to do next.
 */
export function BuildStatusInfo({ status }: { readonly status: SiteBuildStatus }) {
  const guidance = siteBuildStatusGuidance[status];
  const titleId = useId();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label={`About the ${guidance.label} status`}
          className="text-muted-foreground"
          size="icon-xs"
          variant="ghost"
        >
          <Info aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-labelledby={titleId}
        className="grid w-[min(20rem,calc(100vw-2rem))] gap-2 text-sm"
      >
        <h3 className="m-0 text-sm font-semibold" id={titleId}>
          {guidance.label}
        </h3>
        <dl className="m-0 grid gap-2">
          <div>
            <dt className="font-medium">What it means</dt>
            <dd className="m-0 text-muted-foreground">{guidance.meaning}</dd>
          </div>
          <div>
            <dt className="font-medium">Public site</dt>
            <dd className="m-0 text-muted-foreground">{guidance.proof}</dd>
          </div>
          <div>
            <dt className="font-medium">Next step</dt>
            <dd className="m-0 text-muted-foreground">{guidance.next}</dd>
          </div>
        </dl>
      </PopoverContent>
    </Popover>
  );
}

/** The status badge with its explanation button beside it. */
export function BuildStatusBadge({ status }: { readonly status: SiteBuildStatus }) {
  const guidance = siteBuildStatusGuidance[status];
  return (
    <span className="inline-flex items-center gap-1">
      <Badge variant={guidance.badge}>{guidance.label}</Badge>
      <BuildStatusInfo status={status} />
    </span>
  );
}
