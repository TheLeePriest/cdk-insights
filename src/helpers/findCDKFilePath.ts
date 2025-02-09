import fs from 'fs';
import path from 'path';

export const findCDKFilePath = (cdkPath: string): string | null => {
  const srcDir = path.resolve('lib');
  if (!fs.existsSync(srcDir)) return null;

  const files = fs
    .readdirSync(srcDir)
    .filter((file: string) => file.endsWith('.ts'));
  for (const file of files) {
    const filePath = path.join(srcDir, file);
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    if (fileContent.includes(cdkPath.split('/')[1])) {
      return filePath;
    }
  }
  return null;
};
