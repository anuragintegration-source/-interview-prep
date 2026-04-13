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

IMPORTANT RULES:
- All answers must be tailored to the EXACT experience level provided. A fresher answer is very different from a 3-year experienced answer.
- Fresher: answers focus on college projects, internships, theoretical knowledge
- 1-3 years: answers focus on real work experience, projects delivered, teams worked with
- Senior (6+): answers focus on leadership, architecture decisions, mentoring
- HR questions MUST always include these basics: "Tell me about yourself", "Why do you want to join [company]?", "What are your strengths and weaknesses?", "Where do you see yourself in 5 years?", "Why are you leaving your current job?" (skip if fresher), plus more relevant ones
- Domain questions MUST include real questions that [company] is known to ask in [domain] interviews based on past interview experiences
- company_specific_questions must be based on that company's actual products, culture, recent news, values

JSON structure:
{
  "company_overview": {
    "about": "1-2 sentences",
    "culture": "1-2 sentences",
    "recent_highlights": "1-2 sentences",
    "interview_process": "typical rounds at this company"
  },
  "hr_questions": [
    { "question": "...", "why_asked": "1 sentence", "sample_answer": "3-4 sentences tailored to the experience level using STAR where applicable" }
  ],
  "domain_questions": [
    { "question": "...", "difficulty": "Easy|Medium|Hard", "answer": "3-4 sentences with real examples relevant to experience level", "tip": "1 sentence on how to answer this in an interview" }
  ],
  "company_specific_questions": [
    { "question": "...", "context": "why this company asks this", "answer": "3-4 sentences tailored to experience level" }
  ]
}

Generate exactly 8 HR questions, 8 domain questions, and 4 company-specific questions.`;

    const userPrompt = `Company: ${company}
Domain/Role: ${domain}
Experience Level: ${level}

Generate interview questions strictly tailored to this experience level. The sample answers must reflect ${level} experience — not generic or fresher-level answers unless the level is Fresher.`;

    let fullText = "";

    const stream = client.messages.stream({
      model: "claude-haiku-4-5",
      max_tokens: 7000,
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
