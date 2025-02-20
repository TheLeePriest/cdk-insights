import fs from 'fs';
import path from 'path';

const AI_ANALYSIS_FILE = path.resolve(__dirname, '../analysis/aiAnalysis.ts');

/**
 * Updates the AI analysis prompt dynamically in aiAnalysis.ts
 * @param newPrompt The improved prompt to replace the old one
 */
export const updateAIPrompt = async (newPrompt: string) => {
  try {
    let fileContent = fs.readFileSync(AI_ANALYSIS_FILE, 'utf8');

    // Find the current prompt and replace it with the improved one
    fileContent = fileContent.replace(
      /const AI_PROMPT = `[\s\S]*?`;/,
      `const AI_PROMPT = \`${newPrompt}\`;`
    );

    fs.writeFileSync(AI_ANALYSIS_FILE, fileContent, 'utf8');

    console.log('✅ AI prompt updated successfully in aiAnalysis.ts');
  } catch (error) {
    console.error('❌ Error updating AI prompt:', error);
  }
};
