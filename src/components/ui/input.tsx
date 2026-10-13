import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn("h-9 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none focus:border-teal-700", className)}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn("w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-700", className)}
      {...props}
    />
  );
}

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn("text-xs font-medium uppercase tracking-wide text-stone-600", className)} {...props} />;
}

export function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn("h-9 rounded-md border border-stone-300 bg-white px-2 text-sm", className)}
      {...props}
    />
  );
}
