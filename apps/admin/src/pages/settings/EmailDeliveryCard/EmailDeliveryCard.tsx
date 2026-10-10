import type { EmailDeliveryStatusDto } from "@lacecms/contracts";
import { Mail } from "lucide-react";
import { SendTestEmail } from "../../../features/send-test-email/index.js";
import { Badge } from "../../../shared/ui/Badge/index.js";
import { cardClass } from "../../../shared/ui/layout/index.js";
import { Skeleton } from "../../../shared/ui/Skeleton/index.js";

const providerLabels: Readonly<Record<EmailDeliveryStatusDto["provider"], string>> = {
  cloudflare: "Cloudflare Email Service",
  log: "Development log",
  none: "Not configured",
  resend: "Resend",
  smtp: "SMTP",
};

/** The configured provider and sender, with a self-addressed test send; no provider settings. */
export function EmailDeliveryCard({
  email,
  loading,
  recipient,
}: {
  readonly email: EmailDeliveryStatusDto | undefined;
  readonly loading: boolean;
  /** The signed-in administrator's address; shown only, never sent to the server. */
  readonly recipient: string;
}) {
  return (
    <div
      aria-busy={loading || undefined}
      aria-label="Email delivery"
      className={`${cardClass} sm:col-span-2`}
      role="group"
    >
      <p className="m-0 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Mail aria-hidden="true" className="size-4" />
        Email delivery
      </p>
      {loading ? (
        <Skeleton className="h-6 w-32 rounded-sm bg-border" />
      ) : email === undefined ? (
        <div className="text-xl font-semibold tracking-tight">—</div>
      ) : (
        <div className="grid gap-3">
          <div className="grid gap-0.5">
            <div className="text-xl font-semibold tracking-tight">
              {email.provider === "none" ? (
                <Badge variant="warning">{providerLabels.none}</Badge>
              ) : (
                providerLabels[email.provider]
              )}
            </div>
            <p className="m-0 text-xs break-all text-muted-foreground">
              {email.provider === "none"
                ? "Account emails cannot be sent until the server has an email provider."
                : `Sends as ${email.from}.`}
            </p>
          </div>
          {email.provider === "none" ? undefined : <SendTestEmail address={recipient} />}
        </div>
      )}
    </div>
  );
}
