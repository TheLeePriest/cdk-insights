// helpers/writeAnalysisResultsFile.ts
import fs from 'fs';
import path from 'path';

export const writeAnalysisResultsFile = (analysisResult: any): void => {
  const outputPath = path.resolve('cdk-insights.json');
  fs.writeFileSync(
    outputPath,
    JSON.stringify(analysisResult, null, 2),
    'utf-8'
  );
};
