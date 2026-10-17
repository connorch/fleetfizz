import { Link } from "@tanstack/react-router";
import { version } from "fleetfizz/package.json";
import { DocsLink, GithubLink } from "./nav-buttons";
import { ThemeToggle } from "./theme-toggle";
import { Wordmark } from "./wordmark";

export function SiteNav() {
  return (
    <header className="relative z-10">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-6">
        <Link to="/" className="flex items-center">
          <Wordmark />
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <DocsLink />
          <GithubLink />
          <span className="text-muted-foreground px-2 font-mono text-xs">v{version}</span>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
