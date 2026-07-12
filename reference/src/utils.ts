import { SVGPathData } from "svg-pathdata";

export function convertSvgToDesmos(svgString: string, scale: number = 0.05, invertY: boolean = true): string[] {
  // Extract all <path d="..."> using regex
  const pathRegex = /<path[^>]*d="([^"]*)"/g;
  let match;
  const paths: string[] = [];
  while ((match = pathRegex.exec(svgString)) !== null) {
    paths.push(match[1]);
  }

  const equations: string[] = [];

  const format = (num: number) => (num * scale).toFixed(4);
  const processY = (y: number) => invertY ? `-${format(y)}` : format(y);

  paths.forEach((d) => {
    // Parse the path data and convert all commands to absolute coordinates
    const pathData = new SVGPathData(d).toAbs();
    let cx = 0, cy = 0;
    let sx = 0, sy = 0;

    pathData.commands.forEach((cmd) => {
      if (cmd.type === SVGPathData.MOVE_TO) {
        cx = cmd.x;
        cy = cmd.y;
        sx = cx;
        sy = cy;
      } else if (cmd.type === SVGPathData.LINE_TO) {
        equations.push(`\\left( (1-t)(${format(cx)}) + t(${format(cmd.x)}), (1-t)(${processY(cy)}) + t(${processY(cmd.y)}) \\right)`);
        cx = cmd.x;
        cy = cmd.y;
      } else if (cmd.type === SVGPathData.CURVE_TO) {
        const x = `(1-t)^3(${format(cx)}) + 3(1-t)^2 t(${format(cmd.x1)}) + 3(1-t)t^2(${format(cmd.x2)}) + t^3(${format(cmd.x)})`;
        const y = `(1-t)^3(${processY(cy)}) + 3(1-t)^2 t(${processY(cmd.y1)}) + 3(1-t)t^2(${processY(cmd.y2)}) + t^3(${processY(cmd.y)})`;
        equations.push(`\\left( ${x}, ${y} \\right)`);
        cx = cmd.x;
        cy = cmd.y;
      } else if (cmd.type === SVGPathData.QUAD_TO) {
        const x = `(1-t)^2(${format(cx)}) + 2(1-t)t(${format(cmd.x1)}) + t^2(${format(cmd.x)})`;
        const y = `(1-t)^2(${processY(cy)}) + 2(1-t)t(${processY(cmd.y1)}) + t^2(${processY(cmd.y)})`;
        equations.push(`\\left( ${x}, ${y} \\right)`);
        cx = cmd.x;
        cy = cmd.y;
      } else if (cmd.type === SVGPathData.CLOSE_PATH) {
        equations.push(`\\left( (1-t)(${format(cx)}) + t(${format(sx)}), (1-t)(${processY(cy)}) + t(${processY(sy)}) \\right)`);
        cx = sx;
        cy = sy;
      }
    });
  });

  return equations;
}
