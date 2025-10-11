import { GoogleGenAI, Modality } from "@google/genai";

if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Custom error for API rate limiting (429).
 */
export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitError";
  }
}


/**
 * Edits an image using the Gemini API (nanobanana model).
 * @param base64ImageData The base64 encoded string of the image data.
 * @param mimeType The MIME type of the image.
 * @param prompt The editing instruction for the model.
 * @returns A promise that resolves to the base64 encoded string of the edited image.
 */
export const editImage = async (
  base64ImageData: string,
  mimeType: string,
  prompt: string
): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            inlineData: {
              data: base64ImageData,
              mimeType: mimeType,
            },
          },
          {
            text: prompt,
          },
        ],
      },
      config: {
        responseModalities: [Modality.IMAGE, Modality.TEXT],
      },
    });

    const imagePart = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);

    if (imagePart?.inlineData) {
      return imagePart.inlineData.data;
    }

    const textPart = response.candidates?.[0]?.content?.parts?.find(part => part.text);
    const safetyRatings = response.candidates?.[0]?.safetyRatings;
    
    let errorMessage = "Image generation failed. No image data received from the API.";
    if (textPart?.text) {
        errorMessage = `API returned text instead of image: ${textPart.text}`;
    } else if (safetyRatings?.some(rating => rating.probability !== 'NEGLIGIBLE' && rating.probability !== 'LOW')) {
        errorMessage = "Image could not be generated due to safety settings. Please try a different prompt or image.";
    }

    throw new Error(errorMessage);
  } catch (error) {
    console.error("Gemini API Error:", error);
    if (error instanceof Error) {
        if (error.message.includes('429')) {
             throw new RateLimitError('API rate limit exceeded. The request will be retried automatically.');
        }
        throw new Error(`API call failed: ${error.message}`);
    }
    throw new Error("An unknown error occurred during the API call.");
  }
};

/**
 * Generates descriptive tags for an image using the Gemini API.
 * @param base64ImageData The base64 encoded string of the image data.
 * @param mimeType The MIME type of the image.
 * @param systemPrompt The system instruction for the model.
 * @returns A promise that resolves to a comma-separated string of tags.
 */
export const getTagsFromImage = async (
  base64ImageData: string,
  mimeType: string,
  systemPrompt: string
): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              data: base64ImageData,
              mimeType: mimeType,
            },
          },
          {
            text: 'Describe this image with relevant, comma-separated tags.',
          },
        ],
      },
      config: {
        systemInstruction: systemPrompt,
      },
    });

    const text = response.text;
    if (text) {
      return text;
    }

    throw new Error("Tag generation failed. No text data received from the API.");
  } catch (error) {
    console.error("Gemini API Error (getTagsFromImage):", error);
    if (error instanceof Error) {
        if (error.message.includes('429')) {
             throw new RateLimitError('API rate limit exceeded. The request will be retried automatically.');
        }
        throw new Error(`API call failed: ${error.message}`);
    }
    throw new Error("An unknown error occurred during the API call.");
  }
};

/**
 * Enhances a user's prompt using the Gemini API to generate better tags and a description.
 * @param userPrompt The user's current editing prompt.
 * @returns A promise that resolves to an enhanced prompt string.
 */
export const enhancePrompt = async (userPrompt: string): Promise<string> => {
  const systemInstruction = `You are an expert prompt engineer for AI image generation models that use Danbooru-style tags. A user will provide their current prompt. Your task is to analyze, refine, and enhance it into a high-quality prompt.
The enhanced prompt must be a single string and should follow these rules:
1.  Start with essential quality tags like 'masterpiece, best quality, high resolution, absurdres'.
2.  Analyze the user's prompt to identify the core subject, action, and style. Convert descriptive phrases into concise, effective Danbooru tags (e.g., 'make her hair blue' becomes 'blue_hair').
3.  Organize tags logically: quality, subject, clothing, pose, expression, background, style.
4.  Remove redundant or conflicting tags.
5.  If the user's prompt includes instructions like 'keep original character', translate that into tags that preserve features, but do not include the instruction itself.
6.  Conclude with a very short, optional, artistic natural language sentence that captures the essence of the scene.

Example User Prompt: "1girl, solo, looking at viewer, make her hair long and blonde and add a crown"
Example Enhanced Output: "masterpiece, best quality, high resolution, absurdres, 1girl, solo, looking_at_viewer, long_hair, blonde_hair, wearing_crown, jewelry, royalty, elegant. A beautiful royal girl with long blonde hair is wearing a crown."`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: [{ text: userPrompt }] },
      config: {
        systemInstruction: systemInstruction,
      },
    });

    const text = response.text;
    if (text) {
      return text.trim();
    }

    throw new Error("Prompt enhancement failed. No text data received from the API.");
  } catch (error) {
    console.error("Gemini API Error (enhancePrompt):", error);
    if (error instanceof Error) {
        if (error.message.includes('429')) {
             throw new RateLimitError('API rate limit exceeded. Please try again in a moment.');
        }
        throw new Error(`API call failed: ${error.message}`);
    }
    throw new Error("An unknown error occurred during the API call.");
  }
};
