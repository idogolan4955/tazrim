import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { requireAdmin } from "@/lib/api-guard";
import { logAction } from "@/lib/audit";

interface ExtractedCheck {
  dueDate: string | null;
  amount: number | null;
  counterparty: string;
  reference: string | null;
  confidence?: "high" | "medium" | "low";
}
interface ExtractionResult {
  checks: ExtractedCheck[];
  imageNotes: string | null;
}

const MAX_BYTES = 8 * 1024 * 1024; // 8MB limit
const SUPPORTED_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

// Gemini's structured output schema (OpenAPI 3.0 subset).
const responseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    checks: {
      type: SchemaType.ARRAY,
      description: "רשימת כל השיקים שזוהו בתמונה, בסדר שבו הם מופיעים",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          dueDate: {
            type: SchemaType.STRING,
            description: "תאריך פרעון בפורמט YYYY-MM-DD. המר כל פורמט (DD/MM/YYYY, DD-MM-YY וכד') לפורמט הזה.",
          },
          amount: {
            type: SchemaType.NUMBER,
            description: "סכום השיק בשקלים. מספר טהור ללא מטבע ללא פסיקי אלפים.",
          },
          counterparty: {
            type: SchemaType.STRING,
            description: "שם הלקוח/ספק שעל השיק (הכותב). מחרוזת ריקה אם לא נקרא.",
          },
          reference: {
            type: SchemaType.STRING,
            nullable: true,
            description: "מספר השיק / אסמכתא אם מופיע. null אם לא נקרא.",
          },
          confidence: {
            type: SchemaType.STRING,
            enum: ["high", "medium", "low"],
            description: "רמת ביטחון בזיהוי: high=ברור, medium=חלקי, low=ספקולציה.",
          },
        },
        required: ["dueDate", "amount", "counterparty", "confidence"],
      },
    },
    imageNotes: {
      type: SchemaType.STRING,
      nullable: true,
      description: "הערות על התמונה — איכות, מספר פריטים, חלקים חסרים או לא ברורים.",
    },
  },
  required: ["checks"],
};

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY not configured on server" },
      { status: 500 },
    );
  }

  const form = await req.formData();
  const file = form.get("image");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "image field required" }, { status: 400 });
  }

  const rawType = (file as File).type;
  const mediaType = SUPPORTED_TYPES.has(rawType) ? rawType : "image/jpeg";
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) {
    return NextResponse.json(
      { error: `Image too large (${buf.byteLength} bytes). Max ${MAX_BYTES}.` },
      { status: 413 },
    );
  }
  const base64 = buf.toString("base64");

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      responseSchema: responseSchema as any,
      temperature: 0.1,
    },
    systemInstruction: `אתה עוזר פיננסי המתמחה בחילוץ פרטי שיקים מתמונות — צילום שיקים פיזיים, טבלה, צילום מסך, או רשימה כתובה ביד או מודפסת.
הנחיות:
- זהה כל שיק בתמונה.
- תאריך פרעון חובה: המר כל פורמט (DD/MM/YYYY, DD-MM-YY, עברית) לפורמט YYYY-MM-DD. בפורמט מעורפל העדף DD/MM/YYYY (ישראלי).
- סכום חובה: מספר טהור ללא מטבע ופסיקי אלפים.
- שם לקוח/ספק: השם שעל השיק (הכותב). מחרוזת ריקה אם לא נקרא.
- מספר שיק: null אם לא מוצג.
- confidence: high/medium/low לפי רמת הבהירות.
- אם בתמונה אין שיקים — החזר מערך ריק.
- imageNotes: תעד בעיות כמו איכות נמוכה, שיקים חלקיים או מידע חסר.`,
  });

  try {
    const result = await model.generateContent([
      { inlineData: { mimeType: mediaType, data: base64 } },
      { text: "חלץ את כל השיקים מהתמונה הזו לפי הסכמה המובנית." },
    ]);
    const text = result.response.text();
    let data: ExtractionResult;
    try {
      data = JSON.parse(text) as ExtractionResult;
    } catch {
      return NextResponse.json(
        { error: "Gemini returned invalid JSON", raw: text.slice(0, 500) },
        { status: 502 },
      );
    }

    const checks = data.checks ?? [];
    if (checks.length > 0) {
      await logAction({
        action: "IMPORT",
        entity: "CHECK",
        summary: `Gemini חילץ ${checks.length} שיקים מתמונה`,
      });
    }
    return NextResponse.json({
      checks,
      imageNotes: data.imageNotes ?? null,
      usage: result.response.usageMetadata ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("API key") || message.includes("API_KEY")) {
      return NextResponse.json({ error: "Invalid GEMINI_API_KEY" }, { status: 500 });
    }
    if (message.includes("quota") || message.includes("rate")) {
      return NextResponse.json({ error: `Gemini quota/rate limit: ${message}` }, { status: 429 });
    }
    return NextResponse.json({ error: `Gemini error: ${message}` }, { status: 500 });
  }
}
