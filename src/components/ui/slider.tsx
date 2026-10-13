"use client";

import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";

export function Slider({ className, ...props }: React.ComponentProps<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root className={cn("relative flex w-full touch-none items-center", className)} {...props}>
      <SliderPrimitive.Track className="relative h-1.5 w-full grow rounded-full bg-stone-300">
        <SliderPrimitive.Range className="absolute h-full rounded-full bg-teal-800" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block h-4 w-4 rounded-full border border-teal-900 bg-white" />
    </SliderPrimitive.Root>
  );
}
