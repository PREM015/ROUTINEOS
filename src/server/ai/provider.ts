import { GoogleGenerativeAI } from '@google/generative-ai';

export async function generateInsights(prompt: string, systemPrompt: string): Promise<string> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_AI_API_KEY environment variable is not set');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash', systemInstruction: systemPrompt });

  const result = await model.generateContent(prompt);
  const response = await result.response;
  return response.text();
}
