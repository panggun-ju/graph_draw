export interface DesmosCalculator {
  setExpression(expr: any): void;
  setExpressions(exprs: any[]): void;
  destroy(): void;
}

declare global {
  interface Window {
    Desmos: {
      Calculator: (element: HTMLElement | null, options?: any) => DesmosCalculator;
    };
  }
}
