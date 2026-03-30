// ollamaClient.js
import fetch from "node-fetch";

export async function queryOllama(prompt) {
  const res = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "phi4-mini:latest",
      prompt: prompt,
      stream: false,
      options: {
        temperature: 0.1 // Низкая температура для точности JSON и математики
      }
    })
  });

  if (!res.ok) throw new Error(`Ошибка Ollama: ${res.statusText}`);
  const data = await res.json();
  return data.response.trim();
}