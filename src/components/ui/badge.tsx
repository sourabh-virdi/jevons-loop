import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn("inline-flex items-center rounded-full border border-stone-300 bg-stone-100 px-2 py-0.5 text-xs", className)}
      {...props}
    />
  );
}
