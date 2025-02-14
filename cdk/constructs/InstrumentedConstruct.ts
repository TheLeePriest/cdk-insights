// InstrumentedConstruct.ts
import { Construct } from 'constructs';
import path from 'path';

export class InstrumentedConstruct extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);
    // Capture the current stack trace
    const stack = new Error().stack;
    if (stack) {
      const stackLines = stack.split('\n');
      // Typically, the instantiation point is on the third line of the stack trace.
      if (stackLines.length > 2) {
        const callerLine = stackLines[2];
        // Extract file path and line number using a regular expression.
        const match = callerLine.match(/\((.*):(\d+):(\d+)\)/);
        if (match) {
          const filePath = match[1];
          const lineNumber = parseInt(match[2], 10);
          this.node.addMetadata('sourceLocation', {
            file: path.relative(process.cwd(), filePath),
            line: lineNumber,
          });
        }
      }
    }
  }
}
