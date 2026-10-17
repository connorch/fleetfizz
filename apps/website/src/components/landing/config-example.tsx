import { cn } from "@fleetfizz/ui/lib/utils";
import { CodeBlock, PAPER, SYNTAX } from "./code-block";
import { exampleTokens, type Token } from "./example-config";

// Plain tokens (punctuation, spaces) take PAPER's text color.
const COLOR: Record<Token["kind"], string | undefined> = { ...SYNTAX, plain: undefined };

// The example config.jsonc, colored by token.
export function ConfigExample({ className }: { className?: string }) {
  return (
    <CodeBlock className={cn(PAPER, className)}>
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
    </CodeBlock>
  );
}
