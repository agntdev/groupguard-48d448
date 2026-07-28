// One clock seam for all moderation and scheduling decisions. Tests or a host
// can replace it without changing business logic.
let source: () => Date = () => new Date();

export function now(): Date {
  return source();
}

export function setClockForTests(next: (() => Date) | undefined): void {
  source = next ?? (() => new Date());
}
