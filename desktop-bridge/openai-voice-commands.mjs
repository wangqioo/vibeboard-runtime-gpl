const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_TRANSCRIBE_MODEL = "gpt-4o-mini-transcribe";
const DEFAULT_REPLY_MODEL = "gpt-4.1-mini";
const DEFAULT_SYSTEM_PROMPT = "You are a concise voice assistant running for a small ESP32 desktop device. Reply in the user's language.";
const DEFAULT_REPLY_ENDPOINT = "responses";

function requireApiKey(env) {
  const apiKey = env.OPENAI_API_KEY || "";
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for OpenAI voice commands");
  }
  return apiKey;
}

function apiUrl(env, path) {
  const baseUrl = (env.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE_URL).replace(/\/+$/, "");
  return `${baseUrl}${path}`;
}

function readUInt16Sample(audio, offset, bits) {
  if (bits === 16) {
    return audio.readInt16LE(offset);
  }
  if (bits === 32) {
    return Math.max(-32768, Math.min(32767, Math.round(audio.readInt32LE(offset) / 65536)));
  }
  if (bits === 8) {
    return (audio.readUInt8(offset) - 128) << 8;
  }
  throw new Error(`unsupported PCM bit depth: ${bits}`);
}

function normalizePcmToS16(audio, bits) {
  if (bits === 16) {
    return Buffer.from(audio);
  }
  const bytesPerSample = bits / 8;
  if (!Number.isInteger(bytesPerSample) || bytesPerSample <= 0) {
    throw new Error(`unsupported PCM bit depth: ${bits}`);
  }
  const sampleCount = Math.floor(audio.length / bytesPerSample);
  const output = Buffer.alloc(sampleCount * 2);
  for (let index = 0; index < sampleCount; index++) {
    output.writeInt16LE(readUInt16Sample(audio, index * bytesPerSample, bits), index * 2);
  }
  return output;
}

export function pcmToWav(audio, metadata = {}) {
  const sampleRate = Number.isFinite(metadata.sampleRate) ? metadata.sampleRate : 16000;
  const bits = Number.isFinite(metadata.bits) ? metadata.bits : 16;
  const channels = Number.isFinite(metadata.channels) ? metadata.channels : 1;
  const pcm = normalizePcmToS16(audio, bits);
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * 2;
  const blockAlign = channels * 2;

  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function outputTextFromResponsesJson(json) {
  if (typeof json.output_text === "string") {
    return json.output_text;
  }
  const parts = [];
  for (const item of json.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") {
        parts.push(content.text);
      }
    }
  }
  return parts.join("\n").trim();
}

function outputTextFromChatCompletionsJson(json) {
  return (json.choices || [])
    .map((choice) => choice.message?.content)
    .filter((content) => typeof content === "string")
    .join("\n")
    .trim();
}

function normalizedReplyEndpoint(env) {
  const endpoint = (env.OPENAI_REPLY_ENDPOINT || DEFAULT_REPLY_ENDPOINT).toLowerCase().replace(/-/g, "_");
  if (endpoint === "responses" || endpoint === "chat_completions" || endpoint === "chat") {
    return endpoint === "chat" ? "chat_completions" : endpoint;
  }
  throw new Error("OPENAI_REPLY_ENDPOINT must be responses or chat_completions");
}

async function readOpenAiJson(response, label) {
  const text = await response.text?.();
  let json;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch (error) {
      const contentType = typeof response.headers?.get === "function" ? response.headers.get("content-type") : "";
      const preview = text.slice(0, 160).replace(/\s+/g, " ").trim();
      throw new Error(`${label} returned non-JSON response: HTTP ${response.status} ${contentType || "unknown content-type"}: ${preview}`);
    }
  } else {
    json = await response.json();
  }
  if (!response.ok) {
    const message = json?.error?.message || `${label} failed with HTTP ${response.status}`;
    throw new Error(message);
  }
  return json;
}

export function createOpenAiVoiceCommands({
  env = process.env,
  fetch: fetchImpl = globalThis.fetch,
  Blob: BlobImpl = globalThis.Blob,
  FormData: FormDataImpl = globalThis.FormData,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch is required for OpenAI voice commands");
  }
  if (typeof BlobImpl !== "function" || typeof FormDataImpl !== "function") {
    throw new Error("Blob and FormData are required for OpenAI voice commands");
  }

  const apiKey = requireApiKey(env);

  return {
    transcribe: async ({ audio_base64: audioBase64, metadata = {} }) => {
      if (!audioBase64) {
        throw new Error("audio_base64 is required for OpenAI transcription");
      }
      const audio = Buffer.from(audioBase64, "base64");
      const wav = pcmToWav(audio, metadata);
      const body = new FormDataImpl();
      body.set("model", env.OPENAI_TRANSCRIBE_MODEL || DEFAULT_TRANSCRIBE_MODEL);
      body.set("file", new BlobImpl([wav], { type: "audio/wav" }), "vibeboard.pcm.wav");

      const json = await readOpenAiJson(await fetchImpl(apiUrl(env, "/audio/transcriptions"), {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}` },
        body,
      }), "OpenAI transcription");

      if (typeof json.text !== "string" || json.text === "") {
        throw new Error("OpenAI transcription response missing text");
      }
      return { transcript: json.text };
    },

    reply: async ({ transcript, metadata = {} }) => {
      if (!transcript) {
        throw new Error("transcript is required for OpenAI reply");
      }
      const replyLimit = Number.isFinite(metadata.replyLimit) ? metadata.replyLimit : 100;
      const replyEndpoint = normalizedReplyEndpoint(env);
      const userPrompt = `Transcript: ${transcript}\nReply in at most ${replyLimit} Chinese characters unless the user used another language.`;
      if (replyEndpoint === "chat_completions") {
        const payload = {
          model: env.OPENAI_REPLY_MODEL || DEFAULT_REPLY_MODEL,
          messages: [
            { role: "system", content: env.OPENAI_REPLY_SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
        };
        const json = await readOpenAiJson(await fetchImpl(apiUrl(env, "/chat/completions"), {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(payload),
        }), "OpenAI chat completions reply");
        const reply = outputTextFromChatCompletionsJson(json);
        if (!reply) {
          throw new Error("OpenAI chat completions reply response missing output text");
        }
        return { reply, ui_code: "" };
      }
      const payload = {
        model: env.OPENAI_REPLY_MODEL || DEFAULT_REPLY_MODEL,
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: env.OPENAI_REPLY_SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT }],
          },
          {
            role: "user",
            content: [{ type: "input_text", text: userPrompt }],
          },
        ],
      };

      const json = await readOpenAiJson(await fetchImpl(apiUrl(env, "/responses"), {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      }), "OpenAI reply");
      const reply = outputTextFromResponsesJson(json);
      if (!reply) {
        throw new Error("OpenAI reply response missing output text");
      }
      return { reply, ui_code: "" };
    },
  };
}

export async function runOpenAiVoiceCommand({
  mode,
  inputText,
  env = process.env,
  fetch: fetchImpl = globalThis.fetch,
} = {}) {
  let input;
  try {
    input = JSON.parse(inputText || "{}");
  } catch (error) {
    throw new Error(`invalid JSON stdin: ${error.message}`);
  }

  const commands = createOpenAiVoiceCommands({ env, fetch: fetchImpl });
  if (mode === "transcribe") {
    return commands.transcribe(input);
  }
  if (mode === "reply") {
    return commands.reply(input);
  }
  throw new Error("mode must be transcribe or reply");
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function printHelp() {
  console.error("Usage: node desktop-bridge/openai-voice-commands.mjs transcribe|reply");
  console.error("Requires OPENAI_API_KEY. Optional: OPENAI_BASE_URL, OPENAI_TRANSCRIBE_MODEL, OPENAI_REPLY_MODEL, OPENAI_REPLY_SYSTEM_PROMPT, OPENAI_REPLY_ENDPOINT=responses|chat_completions.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const mode = process.argv[2] || "";
    if (mode === "--help" || mode === "-h") {
      printHelp();
    } else if (!mode) {
      printHelp();
      process.exitCode = 1;
    } else {
      const result = await runOpenAiVoiceCommand({ mode, inputText: await readStdin() });
      console.log(JSON.stringify(result));
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
