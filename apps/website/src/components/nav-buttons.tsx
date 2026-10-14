import { BookOpenIcon } from "@fleetfizz/ui/components/book-open-icon";
import { Button } from "@fleetfizz/ui/components/button";
import { GithubIcon, NpmIcon } from "@fleetfizz/ui/components/brand-icon";
import { useIconHover } from "@fleetfizz/ui/hooks/use-icon-hover";
import { Link } from "@tanstack/react-router";

export const GITHUB_URL = "https://github.com/connorch/fleetfizz";
export const NPM_URL = "https://www.npmjs.com/package/fleetfizz";

// The header's and footer's links. The docs icon animates while its button
// is hovered; the brand marks are still.

export function DocsLink() {
  const { ref, triggerProps } = useIconHover();
  return (
    <Button
      variant="ghost"
      size="sm"
      render={<Link to="/" />}
      nativeButton={false}
      {...triggerProps}
    >
      <BookOpenIcon ref={ref} size={14} />
      Docs
    </Button>
  );
}

export function GithubLink() {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="GitHub"
      render={<a href={GITHUB_URL} />}
      nativeButton={false}
    >
      <GithubIcon />
    </Button>
  );
}

export function NpmLink() {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="npm"
      render={<a href={NPM_URL} />}
      nativeButton={false}
    >
      <NpmIcon />
    </Button>
  );
}
