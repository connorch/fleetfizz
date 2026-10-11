import { BookOpenIcon } from "@fleetfizz/ui/components/book-open-icon";
import { Button } from "@fleetfizz/ui/components/button";
import { GithubIcon } from "@fleetfizz/ui/components/github-icon";
import { useIconHover } from "@fleetfizz/ui/hooks/use-icon-hover";
import { Link } from "@tanstack/react-router";

export const GITHUB_URL = "https://github.com/connorch/fleetfizz";

// The header's links. Each icon animates while its button is hovered.

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
  const { ref, triggerProps } = useIconHover();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="GitHub"
      render={<a href={GITHUB_URL} />}
      nativeButton={false}
      {...triggerProps}
    >
      <GithubIcon ref={ref} size={16} />
    </Button>
  );
}
