import { getRecommendations } from '../helpers/getRecommendations';
import { generateAICompletion } from '../helpers/aiClient';

/**
 * Evaluates AI recommendations one at a time to avoid excessive token usage.
 */
export const evaluateRecommendations = async () => {
  const pastRecommendations = await getRecommendations('security');

  if (!pastRecommendations.length) {
    console.log('No past recommendations found.');
    return;
  }

  const evaluationResults = [];

  for (const recommendation of pastRecommendations) {
    const evaluationPrompt = `
      Evaluate the following recommendation and score it from 1 to 10 based on its effectiveness.

      Recommendation:
      "${recommendation._source.recommendation}"

      Return a JSON object with:
      - "score": a number (1-10) representing effectiveness.
      - "feedback": text feedback on how to improve the recommendation.
    `;

    try {
      const aiResponse = await generateAICompletion(evaluationPrompt);
      const parsedResponse = JSON.parse(aiResponse);

      evaluationResults.push({
        recommendation: recommendation._source.recommendation,
        score: parsedResponse.score,
        feedback: parsedResponse.feedback,
      });

      console.log(
        `✅ Evaluated recommendation: ${recommendation._source.recommendation}`
      );
    } catch (error) {
      console.error(
        `❌ Error processing recommendation: ${recommendation._source.recommendation}`,
        error
      );
    }
  }

  return evaluationResults;
};
