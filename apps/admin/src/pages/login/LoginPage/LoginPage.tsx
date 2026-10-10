import { getRouteApi, Link } from "@tanstack/react-router";
import { SignInForm } from "../../../features/sign-in/index.js";
import { AuthCard } from "../../../shared/ui/AuthCard/index.js";

const loginRoute = getRouteApi("/login");

/** The unauthenticated entry point: one centered card on the shell's sidebar surface. */
export function LoginPage() {
  const search = loginRoute.useSearch();
  return (
    <AuthCard description="Use your Lace account to manage site content." title="Sign in">
      {search.setupComplete ? (
        <p role="status" className="text-sm">
          Setup is complete. Sign in with your administrator account.
        </p>
      ) : undefined}
      {search.reset ? (
        <p role="status" className="m-0 text-sm">
          Your password was changed and your other sessions were signed out. Sign in with your new
          password.
        </p>
      ) : undefined}
      <SignInForm redirectTo={search.redirect ?? "/content"} />
      <p className="m-0 text-center text-sm">
        <Link
          className="font-medium text-primary underline underline-offset-4"
          to="/forgot-password"
        >
          Forgot password?
        </Link>
      </p>
    </AuthCard>
  );
}
