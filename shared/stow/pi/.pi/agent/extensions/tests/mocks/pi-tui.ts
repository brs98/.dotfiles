export class Container {
  addChild(_child: unknown): void {}
}

export class Box extends Container {}
export class Markdown extends Container {}
export class Text extends Container {}

export function truncateToWidth(value: string): string {
  return value;
}

export function visibleWidth(value: string): number {
  return value.length;
}

export function wrapTextWithAnsi(value: string): string[] {
  return [value];
}
