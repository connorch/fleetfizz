import { cn } from "@fleetfizz/ui/lib/utils";
import type { ReactNode } from "react";

// The example fleet.config.jsonc, syntax-colored by hand for the mock.
const K = ({ children }: { children: ReactNode }) => (
  <span className="text-foreground">"{children}"</span>
);
const S = ({ children }: { children: ReactNode }) => (
  <span className="text-fizz-foreground dark:text-fizz">"{children}"</span>
);
const C = ({ children }: { children: ReactNode }) => (
  <span className="text-muted-foreground">// {children}</span>
);

export function ConfigExample({ className }: { className?: string }) {
  return (
    <pre
      className={cn(
        "bg-background/55 overflow-x-auto rounded-lg border p-5 font-mono text-[12.5px] leading-relaxed backdrop-blur-sm",
        className,
      )}
    >
      <code>
        {"{\n"}
        {"  "}
        <C>The Fleet: every Machine a Ship touches.</C>
        {"\n"}
        {"  "}
        <K>machines</K>
        {": {\n"}
        {"    "}
        <K>connors-mac-studio</K>
        {": { "}
        <K>clones</K>
        {": "}
        <S>/Volumes/Stack/clones</S>
        {" },\n"}
        {"    "}
        <K>connors-macbook-pro</K>
        {": {},\n"}
        {"    "}
        <K>homelab</K>
        {": {}\n"}
        {"  },\n"}
        {"  "}
        <C>Tracked Repos, installed from origin on every Machine.</C>
        {"\n"}
        {"  "}
        <K>repos</K>
        {": [\n"}
        {"    {\n"}
        {"      "}
        <K>origin</K>
        {": "}
        <S>connorch/t3code</S>
        {",\n"}
        {"      "}
        <K>ref</K>
        {": "}
        <S>main</S>
        {",\n"}
        {"      "}
        <K>platforms</K>
        {": ["}
        <S>darwin</S>
        {"],\n"}
        {"      "}
        <K>install</K>
        {": "}
        <S>pnpm install && pnpm build</S>
        {",\n"}
        {"      "}
        <K>outputs</K>
        {": ["}
        <S>~/Applications/T3 Code.app</S>
        {"]\n"}
        {"    },\n"}
        {"    { "}
        <K>origin</K>
        {": "}
        <S>connorch/dotfiles</S>
        {", "}
        <K>ref</K>
        {": "}
        <S>main</S>
        {", "}
        <K>install</K>
        {": "}
        <S>./install.sh</S>
        {" }\n"}
        {"  ],\n"}
        {"  "}
        <C>The vite-plus toolchain and its Globals.</C>
        {"\n"}
        {"  "}
        <K>vp</K>
        {": {\n"}
        {"    "}
        <K>version</K>
        {": "}
        <S>1.1.0</S>
        {",\n"}
        {"    "}
        <K>node</K>
        {": "}
        <S>24.18.1</S>
        {",\n"}
        {"    "}
        <K>globals</K>
        {": { "}
        <K>vercel</K>
        {": "}
        <S>^59.25.4</S>
        {", "}
        <K>wrangler</K>
        {": "}
        <S>^4.136.3</S>
        {" }\n"}
        {"  }\n"}
        {"}"}
      </code>
    </pre>
  );
}
