import { getRecommendations } from './getRecommendations';
import { generateAICompletion } from './aiClient';
import { updateAIPrompt } from './updatePrompt';

interface Recommendation {
  _source: {
    recommendation: string;
    score: number;
    feedback: string;
  };
}

/**
 * Dynamically refines the AI prompt based on past recommendation effectiveness.
 */
export const refinePrompt = async () => {
  const pastRecommendations: Recommendation[] =
    await getRecommendations('security');

  if (!pastRecommendations.length) {
    console.log('No past recommendations found. Using default prompt.');
    return;
  }

  const refinementPrompt: string = `
    Based on the following recommendations and feedback, refine the AI prompt to improve future recommendations.

    Recommendations and Feedback:
    ${pastRecommendations
      .map(
        (r: Recommendation) =>
          `- Recommendation: "${r._source.recommendation}"\n  Score: ${r._source.score}\n  Feedback: ${r._source.feedback}`
      )
      .join('\n')}

    Return an improved prompt that better guides AI towards more useful recommendations.
`;

  try {
    const newPrompt = await generateAICompletion(refinementPrompt);

    // ✅ Store new refined prompt safely
    await updateAIPrompt(newPrompt);

    console.log('✅ AI prompt successfully refined!');
  } catch (error) {
    console.error('❌ Error refining AI prompt:', error);
  }
};
