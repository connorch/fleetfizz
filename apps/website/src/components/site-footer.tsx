import { MockSwitcher } from "./mock-switcher";
import { GITHUB_URL } from "./nav-buttons";
import { Wordmark } from "./wordmark";

export function SiteFooter() {
  return (
    <footer>
      <div className="text-muted-foreground mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-5 gap-y-3 px-6 py-4 text-sm">
        <Wordmark className="text-foreground" />
        <MockSwitcher />
        <span className="mr-auto" />
        <span>MIT</span>
        <a href="https://www.npmjs.com/package/fleetfizz" className="hover:text-foreground">
          npm
        </a>
        <a href={GITHUB_URL} className="hover:text-foreground">
          GitHub
        </a>
      </div>
    </footer>
  );
}
