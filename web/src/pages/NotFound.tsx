import { Link } from "react-router-dom";
import Icon from "../Icon";

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-max-width flex-col items-center gap-md px-gutter py-[120px] text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-soft text-primary">
        <Icon name="error" className="text-[32px]" />
      </span>
      <h1 className="font-display-lg text-display-lg text-on-surface">Page not found</h1>
      <p className="max-w-[420px] font-body-lg text-body-lg text-text-secondary">
        We couldn't find that page. It may have moved, or the link might be wrong.
      </p>
      <Link
        to="/account"
        className="mt-sm rounded-lg bg-primary px-lg py-sm font-label-md text-label-md text-on-primary transition-colors hover:bg-accent-hover"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
