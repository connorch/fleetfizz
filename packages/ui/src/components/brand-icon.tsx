import { cn } from "@fleetfizz/ui/lib/utils";
import type { ComponentProps } from "react";
import { siGithub, siNpm } from "simple-icons";

// Brand marks from Simple Icons, drawn in the current color.
function BrandIcon({
  icon,
  size = 16,
  className,
  ...props
}: { icon: { path: string }; size?: number } & ComponentProps<"svg">) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden
      className={cn("shrink-0", className)}
      {...props}
    >
      <path d={icon.path} />
    </svg>
  );
}

export function GithubIcon(props: Omit<ComponentProps<typeof BrandIcon>, "icon">) {
  return <BrandIcon icon={siGithub} {...props} />;
}

export function NpmIcon(props: Omit<ComponentProps<typeof BrandIcon>, "icon">) {
  return <BrandIcon icon={siNpm} {...props} />;
}
