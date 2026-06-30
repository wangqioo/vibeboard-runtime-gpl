#!/usr/bin/env node
const chunks = [];
for await (const chunk of process.stdin) {
  chunks.push(chunk);
}

let input;
try {
  input = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
} catch (error) {
  console.error(JSON.stringify({ error: `invalid JSON stdin: ${error.message}` }));
  process.exit(1);
}

const transcript = String(input.transcript || "").trim();
if (!transcript) {
  console.error(JSON.stringify({ error: "transcript is required" }));
  process.exit(1);
}

console.log(JSON.stringify({
  reply: `识别结果：${transcript}`,
  ui_code: "",
}));
