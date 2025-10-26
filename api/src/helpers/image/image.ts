import GoogleImages from "google-images";

// Lazy initialization
let googleClient: GoogleImages | null = null;

function getClient(): GoogleImages {
  if (!googleClient) {
    const cseId = process.env.GOOGLE_CSE_ID;
    const apiKey = process.env.GOOGLE_API_KEY;

    if (!cseId || !apiKey) {
      throw new Error("Google Images requires GOOGLE_CSE_ID and GOOGLE_API_KEY environment variables");
    }

    googleClient = new GoogleImages(cseId, apiKey);
  }
  return googleClient;
}

/**
 * Takes a keyword and optional description, returns the top image URL from Google Images
 * @param keyword - Main search term to find image for
 * @param description - Optional 1-2 sentence description for more context (makes search more accurate)
 * @returns URL string of the top image result
 */
export async function getImageForKeyword(keyword: string, description: string): Promise<string> {
  // Combine keyword with description for more accurate search
  const searchQuery = description ? `${keyword} ${description}` : keyword;

  const results = await getClient().search(searchQuery, { size: 'large' });

  if (!results || results.length === 0) {
    throw new Error(`No images found for: ${keyword}`);
  }

  return results[0].url;
}