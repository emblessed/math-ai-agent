import fetch from "node-fetch";

async function queryOllama(prompt) {
  try {
    const res = await fetch("http://localhost:11434/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "phi4-mini:latest",
        messages: [
          { role: "system", content: "You are a helpful assistant specialized in math." },
          { role: "user", content: prompt }
        ],
        options: {
          num_predict: 512,
          temperature: 0.7
        },
        stream: false // Для простоты теста выключаем
      })
    });

    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    const data = await res.json();
    // В Ollama ответ лежит в data.message.content
    return data?.message?.content ?? "[no text]";
  } catch (error) {
    console.error("Ошибка при запросе к Ollama:", error);
    return "[error]";
  }
}

(async () => {
  console.log("Запрос к модели...");
  const answer = await queryOllama("What is AI?");
  console.log("Ответ модели:", answer);
})();