import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import quotes from '@/lib/manual-quotes.json';

export const dynamic = 'force-dynamic';

type QuoteResponse = { content: string; author: string };

// Fallback function in case Gemini fails or is not available
function getManualQuote(): QuoteResponse {
  const randomIndex = Math.floor(Math.random() * quotes.length);
  const randomQuote = quotes[randomIndex];
  return {
    content: randomQuote.quote,
    author: randomQuote.author,
  };
}

async function getGeminiQuote(
  category: string,
  attendanceType: 'in' | 'out'
): Promise<QuoteResponse | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log("Gemini API key not found. Falling back to manual quotes.");
    return null;
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    // --- Smarter Prompt Logic ---
    let roleDescription = "Guru atau Pegawai"; // Default
    if (category === 'kepala_sekolah') {
        roleDescription = "Kepala Sekolah";
    } else if (category === 'guru') {
        roleDescription = "Guru";
    } else if (category === 'pegawai') {
        roleDescription = "Pegawai Tata Usaha";
    }

    const action = attendanceType === 'in' 
        ? 'yang baru saja tiba di sekolah untuk memulai hari' 
        : 'yang akan segera pulang setelah seharian bekerja';
    
    const prompt = `
      You are a funny and supportive colleague.
      Create a very specific, funny, and encouraging short quote (1-2 sentences) for a ${roleDescription} ${action}.
      Use a casual, modern, and non-rigid tone. Avoid boring, generic quotes.

      Example for a GURU (Clocking In): "Coffee in hand, lesson plans in mind. Let's start this educational adventure!"
      Example for a PRINCIPAL (Clocking Out): "The school is safe and sound for today. Time to switch roles to 'couch guardian' at home."
      Example for STAFF (Clocking Out): "Documents are filed, the bell has rung. Today's mission is complete!"

      Output Instructions:
      Respond ONLY with a valid JSON format without any markdown.
      JSON Structure: {"quote": "...", "author": "..."}
      For the "author" field, create a funny alias or creative nickname relevant to the quote and role. Examples: "The Curriculum Conqueror", "Clock-Out Strategist", "General of Paperwork".
    `;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    
    // Extract JSON from the response text
    const jsonMatch = text.match(/{[\s\S]*}/);
    if (!jsonMatch) {
        console.error("[GEMINI_JSON_ERROR] No JSON found in response:", text);
        return null;
    }

    const parsed = JSON.parse(jsonMatch[0]) as { quote?: string; author?: string };
    if (!parsed.quote?.trim() || !parsed.author?.trim()) {
        console.error("[GEMINI_VALIDATION_ERROR] Incomplete JSON:", parsed);
        return null;
    }

    return {
      content: parsed.quote.trim(),
      author: parsed.author.trim(),
    };
  } catch (error) {
    console.error('[GEMINI_QUOTE_ERROR]', error);
    return null; // Fallback to manual quote on error
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') || 'guru_pegawai'; // Default category
    const attendanceType = searchParams.get('attendanceType') as 'in' | 'out' | null;

    // Only run Gemini if a valid attendance type is provided
    if (attendanceType === 'in' || attendanceType === 'out') {
      const geminiQuote = await getGeminiQuote(category, attendanceType);
      // If Gemini succeeds, return its response
      if (geminiQuote) {
        return NextResponse.json(geminiQuote);
      }
    }

    // Fallback to manual quote if Gemini fails or no attendance type is specified
    return NextResponse.json(getManualQuote());
  } catch (error) {
    console.error('[API_QUOTE_ERROR]', error);
    // Ultimate fallback in case of any top-level error
    return NextResponse.json(getManualQuote());
  }
}
