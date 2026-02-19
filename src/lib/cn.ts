export function cn(...args: (string | false | null | undefined)[]) {
  return args.filter(Boolean).join(" ");
}
