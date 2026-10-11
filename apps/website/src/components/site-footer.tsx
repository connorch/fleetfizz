import { GITHUB_URL } from "./nav-buttons";
import { Wordmark } from "./wordmark";

export function SiteFooter() {
  return (
    <footer>
      <div className="text-muted-foreground mx-auto flex h-14 w-full max-w-5xl items-center gap-5 px-6 text-sm">
        <Wordmark className="text-foreground mr-auto" />
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
