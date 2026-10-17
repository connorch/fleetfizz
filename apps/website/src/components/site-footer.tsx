import { DocsLink, GithubLink, NpmLink } from "./nav-buttons";
import { Wordmark } from "./wordmark";

// The footer under every page but the docs, at the content's width.
export function SiteFooter() {
  return (
    <footer className="bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-5 gap-y-3 px-6 py-4 text-sm text-muted-foreground">
        <Wordmark className="text-foreground" />
        <span>MIT</span>
        {/* Pulled out by the icon buttons' padding, so the last icon, not its
            button, lines up with the content's right edge. */}
        <nav className="-mr-1.5 ml-auto flex items-center gap-1">
          <DocsLink />
          <NpmLink />
          <GithubLink />
        </nav>
      </div>
    </footer>
  );
}
