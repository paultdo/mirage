import 'dotenv/config';

const OLLAMA_URL = (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, '');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma4:26b';
const REQUEST_TIMEOUT_MS = 120_000;

// Fallback cover topics and filenames when Ollama is unreachable
const FALLBACK_FILENAMES = [
  'Q1_Vendor_Review_2024.txt',
  'Internal_Compliance_Update.txt',
  'Budget_Reconciliation_Draft.txt',
  'Team_Standup_Notes_March.txt',
  'Procurement_Policy_v3.txt',
  'Quarterly_Ops_Summary.txt',
  'HR_Onboarding_Checklist.txt',
  'IT_Infrastructure_Audit.txt',
];

const FALLBACK_CONTENT = [
  'This document outlines the vendor review process for the first quarter. All departments are expected to submit their evaluations by end of month. Key metrics include response time, cost efficiency, and service quality ratings. No major concerns were flagged during the preliminary assessment.',
  'Following recent policy updates, all teams are required to complete the updated compliance training module by April 30th. The training covers data handling procedures, access control protocols, and incident reporting requirements. Please contact HR if you have scheduling conflicts.',
  'The budget reconciliation for the current fiscal period shows a 3.2% variance from projected expenditures. Primary contributors include increased cloud infrastructure costs and delayed procurement approvals. Recommendations for next quarter adjustments are attached in the appendix.',
  'Meeting notes from the cross-functional standup. Action items: finalize the migration timeline, update the stakeholder communication plan, and review the vendor contract renewals. Follow-up meeting scheduled for next Thursday at 2pm.',
];

let fallbackIndex = 0;

async function ollamaGenerate(prompt) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Ollama returned ${response.status}`);
    }

    const data = await response.json();
    return data.response?.trim() || '';
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateDecoyFilename(coverTopic) {
  try {
    const prompt = `Generate a single realistic, boring corporate filename (with file extension) related to this topic: "${coverTopic}". Use underscores instead of spaces. Only output the filename, nothing else. Example: Q2_Budget_Review_2024.docx`;
    const result = await ollamaGenerate(prompt);
    // Clean up: take first line, remove quotes/whitespace
    const cleaned = result.split('\n')[0].replace(/['"]/g, '').trim();
    if (cleaned && cleaned.includes('.')) {
      return cleaned;
    }
  } catch (error) {
    console.error('[ollama] decoy filename generation failed:', error.message);
  }

  // Fallback
  const name = FALLBACK_FILENAMES[fallbackIndex % FALLBACK_FILENAMES.length];
  fallbackIndex += 1;
  return name;
}

export async function generateDecoyContent(coverTopic, filename) {
  try {
    const prompt = `You are generating a decoy document that should look realistic and relate specifically to: "${coverTopic}". The filename is "${filename}".

Write 2-3 paragraphs that closely match what a real document about this topic would contain — use specific-sounding (but fabricated) details like names, dates, figures, and action items that someone would expect to see in a document about "${coverTopic}". It should read like a genuine internal document, not a vague summary.

Rules: Write only the document body. No titles, headers, metadata, or markdown. No real people or real sensitive data. Make it boring but detailed enough that someone skimming it would believe it's real.`;
    const result = await ollamaGenerate(prompt);
    if (result.length > 50) {
      return result;
    }
  } catch (error) {
    console.error('[ollama] decoy content generation failed:', error.message);
  }

  // Fallback
  return FALLBACK_CONTENT[fallbackIndex % FALLBACK_CONTENT.length];
}

export async function pingOllama() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return { status: 'unreachable', model: OLLAMA_MODEL };
    }

    const data = await response.json();
    const models = (data.models || []).map((m) => m.name);
    const modelLoaded = models.some((name) => name.startsWith(OLLAMA_MODEL.split(':')[0]));

    return {
      status: 'ok',
      model: OLLAMA_MODEL,
      model_loaded: modelLoaded,
      available_models: models,
    };
  } catch (error) {
    return { status: 'unreachable', model: OLLAMA_MODEL, error: error.message };
  }
}
