import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Gemini Service [SparkNet AI Layer — Phase 8.1]
 * 
 * Provides centralized access to Google Gemini 1.5 Flash for 
 * safety moderation and semantic analysis.
 */

export const getGeminiProModel = () => genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
export const getGeminiEmbeddingModel = () => genAI.getGenerativeModel({ model: "text-embedding-004" });

/**
 * Check text for safety using Gemini
 * This is significantly more powerful than keyword matching.
 */
export const analyzeSafetyWithGemini = async (text) => {
  if (!process.env.GEMINI_API_KEY ) {
    console.warn('GEMINI_API_KEY not set. Falling back to basic safety check.');
    return null;
  }

  try {
    const model = getGeminiProModel();
    const prompt = `
      Analyze the following social media post for safety. 
      Respond ONLY with a JSON object containing:
      {
        "safetyScore": (number between 0 and 1, where 1 is extremely risky),
        "safetyLabel": ("SAFE", "MODERATE", "RISKY"),
        "categories": (array of strings like "hate_speech", "harassment", "violence", "spam"),
        "isFlagged": (boolean)
      }
      
      Post Content: "${text}"
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const jsonString = response.text().replace(/```json|```/g, '').trim();
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('Gemini Safety Analysis Error:', error);
    return null;
  }
};

/**
 * Generate semantic embeddings for text
 */
export const generateEmbedding = async (text) => {
  if (!process.env.GEMINI_API_KEY) {
    return null;
  }

  try {
    const model = getGeminiEmbeddingModel();
    const result = await model.embedContent(text);
    return result.embedding.values;
  } catch (error) {
    console.error('Gemini Embedding Error:', error);
    return null;
  }
};
