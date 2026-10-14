import { cn } from "@fleetfizz/ui/lib/utils";
import { exampleTokens, type Token } from "./example-config";

const COLOR: Record<Token["kind"], string | undefined> = {
  key: "text-foreground",
  string: "text-fizz-foreground dark:text-fizz",
  comment: "text-muted-foreground",
  plain: undefined,
};

// The example config.jsonc, colored by token.
export function ConfigExample({ className }: { className?: string }) {
  return (
    <pre
      className={cn(
        "overflow-x-auto rounded-lg border p-5 font-mono text-[12.5px] leading-relaxed",
        className,
      )}
    >
      <code>
        {exampleTokens().map((t, i) =>
          t.kind === "plain" ? (
            t.text
          ) : (
            <span key={i} className={COLOR[t.kind]}>
              {t.text}
            </span>
          ),
        )}
      </code>
    </pre>
  );
}
