import { ChangePasswordForm } from "../../../features/change-password/index.js";
import { SessionList } from "../../../features/manage-sessions/index.js";
import { ProfileForm } from "../../../features/update-profile/index.js";
import { pageClass } from "../../../shared/ui/layout/index.js";

const cardSection =
  "grid gap-4 rounded-lg border border-border bg-card p-4 text-card-foreground shadow-xs md:p-6";

/** The signed-in user's own name, password, and sessions; open to every role. */
export function AccountPage() {
  return (
    <section aria-labelledby="account-title" className={pageClass}>
      <div className="grid gap-1">
        <h1 id="account-title">Account</h1>
        <p className="m-0 text-muted-foreground">
          Change your name and password, and review where you are signed in.
        </p>
      </div>
      <section aria-labelledby="profile-title" className={cardSection}>
        <h2 className="m-0" id="profile-title">
          Profile
        </h2>
        <ProfileForm />
      </section>
      <section aria-labelledby="password-title" className={cardSection}>
        <div className="grid gap-1">
          <h2 className="m-0" id="password-title">
            Password
          </h2>
          <p className="m-0 text-sm text-muted-foreground">
            Enter your current password to choose a new one.
          </p>
        </div>
        <ChangePasswordForm />
      </section>
      <section aria-labelledby="sessions-title" className={cardSection}>
        <div className="grid gap-1">
          <h2 className="m-0" id="sessions-title">
            Sessions
          </h2>
          <p className="m-0 text-sm text-muted-foreground">
            Browsers and devices signed in to your account. Sign out any you do not recognize.
          </p>
        </div>
        <SessionList />
      </section>
    </section>
  );
}
