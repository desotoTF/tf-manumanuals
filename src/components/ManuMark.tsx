import { Factory } from "lucide-react";
export function ManuMark({ className = "h-5 w-5" }: { className?: string }) {
  return <Factory className={`${className} text-primary`} aria-hidden="true" />;
}
