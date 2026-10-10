import type { EmailFailureReasonDto } from "@lacecms/contracts";
import { OnceShownSecret } from "../../../shared/ui/OnceShownSecret/index.js";
import { deliveryFailureExplanation } from "../delivery.js";

/**
 * The dialog step shown when an account email was not sent: why, what to do
 * instead, and the link once. The link must live only in the caller's
 * transient dialog state.
 */
export function UndeliveredLink({
  link,
  reason,
  recipient,
}: {
  readonly link: string;
  readonly reason: EmailFailureReasonDto;
  readonly recipient: string;
}) {
  return (
    <>
      <div className="grid gap-1 text-sm" role="note">
        <p className="m-0 font-medium">{deliveryFailureExplanation(reason)}</p>
        <p className="m-0 text-muted-foreground">
          {`Copy the link and send it to ${recipient} another way. Anyone with the link can use it.`}
        </p>
      </div>
      <OnceShownSecret name="link" value={link} valueTestId="once-shown-link" />
    </>
  );
}
