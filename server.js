import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(express.json());
app.use(express.static(join(__dirname, "public")));

app.post("/api/generate", async (req, res) => {
  const { company, domain, level } = req.body;

  if (!company || !domain || !level) {
    return res.status(400).json({ error: "company, domain, and level are required" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    send({ type: "status", message: `Generating ${company} interview guide...` });

    const systemPrompt = `You are an expert interview coach. Respond ONLY with a JSON object — no markdown, no explanation.

JSON structure:
{
  "company_overview": {
    "about": "1-2 sentences",
    "culture": "1-2 sentences",
    "recent_highlights": "1-2 sentences",
    "interview_process": "1-2 sentences"
  },
  "hr_questions": [
    { "question": "...", "why_asked": "1 sentence", "sample_answer": "2-3 sentences using STAR" }
  ],
  "domain_questions": [
    { "question": "...", "difficulty": "Easy|Medium|Hard", "answer": "2-3 sentences", "tip": "1 sentence" }
  ],
  "company_specific_questions": [
    { "question": "...", "context": "1 sentence", "answer": "2-3 sentences" }
  ]
}

Generate exactly 5 HR questions, 6 domain questions, and 3 company-specific questions. Keep all answers concise.`;

    const userPrompt = `Interview prep for: ${company} | ${domain} | ${level}`;

    let fullText = "";

    const stream = client.messages.stream({
      model: "claude-haiku-4-5",
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        fullText += event.delta.text;
      }
    }

    // Extract JSON from the response (Claude may wrap it in markdown)
    const jsonMatch = fullText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Could not parse response as JSON");
    }

    const data = JSON.parse(jsonMatch[0]);
    send({ type: "result", data });
    res.end();
  } catch (err) {
    send({ type: "error", message: err.message || "Failed to generate questions" });
    res.end();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Interview Prep server running at http://localhost:${PORT}`);
});
