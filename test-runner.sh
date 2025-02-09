#!/bin/bash

echo "🚀 Running CDK AI Analyzer Test Suite..."

# Run CDK Synth
echo "🔍 Synthesizing CDK Stack..."
cdk synth > cdk-output.json
if [ $? -ne 0 ]; then
  echo "❌ CDK Synth failed."
  exit 1
fi

# Run AI Analyzer
echo "🔎 Running AI Analyzer..."
npx ts-node src/index.ts
ANALYZER_EXIT_CODE=$?

# Check Exit Code
if [ $ANALYZER_EXIT_CODE -eq 2 ]; then
  echo "✅ AI Analyzer correctly identified critical issues."
else
  echo "❌ AI Analyzer did not detect issues properly."
  exit 1
fi

# Validate JSON Output
echo "📂 Checking AI recommendations JSON format..."
jq empty ai-recommendations.json
if [ $? -ne 0 ]; then
  echo "❌ Invalid JSON format in ai-recommendations.json."
  exit 1
fi

echo "✅ All tests passed!"
exit 0
