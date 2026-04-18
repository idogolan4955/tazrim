import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { requireAdmin } from "@/lib/api-guard";

const CheckRowSchema = z.object({
  dueDate: z
    .string()
    .describe("תאריך פרעון בפורמט YYYY-MM-DD (ISO). המר תאריכי DD/MM/YYYY לפורמט הזה."),
  amount: z
    .number()
    .describe("סכום השיק בשקלים (ש״ח). מספר טהור ללא מטבע ופסיקי אלפים."),
  counterparty: z
    .string()
    .describe("שם הלקוח או הספק שעל השיק. מחרוזת ריקה אם לא נקרא."),
  reference: z
    .string()
    .nullable()
    .describe("מספר השיק / מספר אסמכתא אם מופיע. null אם לא נקרא."),
  confidence: z
    .enum(["high", "medium", "low"])
    .describe("רמת ביטחון בזיהוי הפרטים: high=ברור, medium=חלקי, low=ספקולציה."),
});

const ExtractionSchema = z.object({
  checks: z
    .array(CheckRowSchema)
    .describe("רשימת כל השיקים שזוהו בתמונה, בסדר שבו הם מופיעים."),
  imageNotes: z
    .string()
    .nullable()
    .describe("הערות כלליות על התמונה — איכות, מספר שיקים שזוהו, בעיות, חלקים לא ברורים."),
});

const MAX_BYTES = 8 * 1024 * 1024; // 8MB limit
const SUPPORTED_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured on server" },
      { status: 500 },
    );
  }

  const form = await req.formData();
  const file = form.get("image");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "image field required" }, { status: 400 });
  }

  const rawType = (file as File).type;
  const mediaType = (SUPPORTED_TYPES.has(rawType) ? rawType : "image/jpeg") as
    | "image/jpeg"
    | "image/png"
    | "image/gif"
    | "image/webp";
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) {
    return NextResponse.json(
      { error: `Image too large (${buf.byteLength} bytes). Max ${MAX_BYTES}.` },
      { status: 413 },
    );
  }
  const base64 = buf.toString("base64");

  const client = new Anthropic();

  try {
    const response = await client.messages.parse({
      model: "claude-opus-4-7",
      max_tokens: 16000,
      system: [
        {
          type: "text",
          text: "אתה עוזר פיננסי המתמחה בחילוץ פרטי שיקים מתמונות (צילום שיקים פיזיים, טבלה, צילום מסך, תמונה של רשימה כתובה ביד או מודפסת).",
          cache_control: { type: "ephemeral" },
        },
        {
          type: "text",
          text: `הנחיות:
1. זהה כל שיק בתמונה והחזר את הפרטים במבנה המובנה.
2. תאריך פרעון חובה — המר כל פורמט תאריך (DD/MM/YYYY, DD-MM-YY, עברית) לפורמט YYYY-MM-DD.
3. סכום חובה — מספר טהור ללא מטבע ללא פסיקי אלפים.
4. שם לקוח/ספק — השם שעל השיק (הכותב, לא המוטב). אם לא נקרא — מחרוזת ריקה.
5. מספר שיק/אסמכתא — null אם לא מוצג.
6. סמן confidence לפי רמת הבהירות.
7. אם אינך בטוח בחוד תאריך (יום מול חודש בפורמט מעורפל) — השתמש ברמת confidence "medium" והעדף את הפורמט הישראלי DD/MM/YYYY.
8. אם בתמונה אין שיקים — החזר מערך ריק.
9. imageNotes: תעד הערות חשובות — איכות, פריטים חלקיים, שיקים חסרים מידע קריטי.`,
        },
      ],
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: base64 },
            },
            {
              type: "text",
              text: "חלץ את כל השיקים מהתמונה הזו לפי הסכמה המובנית.",
            },
          ],
        },
      ],
      thinking: { type: "adaptive" },
      output_config: {
        format: zodOutputFormat(ExtractionSchema),
        effort: "high",
      },
    });

    const data = response.parsed_output as z.infer<typeof ExtractionSchema> | null;
    if (!data) {
      return NextResponse.json(
        { error: "Claude failed to parse the image into structured output", stopReason: response.stop_reason },
        { status: 502 },
      );
    }

    return NextResponse.json({
      checks: data.checks,
      imageNotes: data.imageNotes,
      usage: response.usage,
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: "Invalid ANTHROPIC_API_KEY" }, { status: 500 });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "Claude rate limited, try again in a moment" }, { status: 429 });
    }
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json({ error: `Claude API error: ${err.message}` }, { status: err.status ?? 500 });
    }
    throw err;
  }
}
