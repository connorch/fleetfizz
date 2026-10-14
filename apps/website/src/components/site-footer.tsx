import { DocsLink, GithubLink, NpmLink } from "./nav-buttons";
import { Wordmark } from "./wordmark";

export function SiteFooter() {
  return (
    <footer className="bg-background">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-5 gap-y-3 px-6 py-4 text-sm text-muted-foreground">
        <Wordmark className="text-foreground" />
        <span>MIT</span>
        <nav className="ml-auto flex items-center gap-1">
          <DocsLink />
          <NpmLink />
          <GithubLink />
        </nav>
      </div>
    </footer>
  );
}
