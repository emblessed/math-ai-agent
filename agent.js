import readline from "readline";
import { queryOllama } from "./ollamaClient.js";
import { create, all } from "mathjs";

const math = create(all);
const scope = {}; 

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log("\x1b[36m=== Математический AI агент (Node.js + phi4-mini) ===\x1b[0m");
console.log("Правила синтаксиса:");
console.log("- Создание/Декларация: \x1b[33m'цена' = 500\x1b[0m (одинарные кавычки)");
console.log("- Использование в тексте: \x1b[35mРасскажи про \"цена\"\x1b[0m (двойные кавычки)");
console.log("- Выход: 'exit'\n");

const MAX_HISTORY = 5;
const lastResults = []; 
const dialogueHistory = [];

// --- 1. Транслитерация ---
function transliterate(text) {
  const map = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'zh',
    'з': 'z', 'и': 'i', 'й': 'j', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
    'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'ts',
    'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
  };
  return text.split('').map(char => {
    const lower = char.toLowerCase();
    if (map[lower] !== undefined) {
      return char === char.toUpperCase() ? map[lower].toUpperCase() : map[lower];
    }
    return char;
  }).join('');
}

// --- 2. Основной цикл ---
async function askPrompt() {
  rl.question("\x1b[37mВы:\x1b[0m ", async (userInput) => {
    if (userInput.toLowerCase() === "exit") {
      rl.close();
      return;
    }

    let response;

    // ТРИГГЕР: Одинарные кавычки или мат. знаки принудительно отправляют в MATH
    const isMathManual = /'/.test(userInput) || /[=\+\-\*\/\|^]/.test(userInput);

    const decision = isMathManual 
      ? { action: "calculate", expression: userInput } 
      : await decideAction(userInput);

    if (decision.action === "calculate") {
      try {
        // Подготовка: убираем одинарные кавычки для mathjs, но оставляем двойные для текста (если попадут)
        const cleanedExpr = preprocessExpression(decision.expression || userInput);
        const expressions = splitExpressions(cleanedExpr);
        let currentEval;

        for (let expr of expressions) {
          currentEval = math.evaluate(expr, scope);
          if (!expr.includes("=") && typeof currentEval === "number") {
            lastResults.push(currentEval);
            if (lastResults.length > 20) lastResults.shift();
          }
        }
        response = formatResult(currentEval);
      } catch (err) {
        // Fallback в чат, если расчет не удался
        response = await queryOllama(buildPrompt(userInput));
      }
    } else {
      try {
        response = await queryOllama(buildPrompt(userInput));
      } catch (err) {
        response = `Ошибка модели: ${err.message}`;
      }
    }

    console.log(`\x1b[32mИИ Агент:\x1b[0m ${response}\n`);
    
    dialogueHistory.push({ role: "User", text: userInput }, { role: "Assistant", text: response });
    if (dialogueHistory.length > MAX_HISTORY * 2) dialogueHistory.splice(0, 2);

    askPrompt();
  });
}

// --- 3. Предобработка ---
function preprocessExpression(expr) {
  return transliterate(
    expr
      .replace(/'/g, "")                 // Удаляем только ОДИНАРНЫЕ кавычки (декларация)
      .replace(/равно|равна|есть/g, "=") 
      .replace(/\*\*/g, "^")
      .trim()
  );
}

function splitExpressions(input) {
  const parts = [];
  let current = "";
  let bracketLevel = 0;
  for (let char of input) {
    if (char === "[") bracketLevel++;
    if (char === "]") bracketLevel--;
    if (char === ";" && bracketLevel === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts.filter(p => p.length > 0);
}

// --- 4. Классификатор ---
async function decideAction(userInput) {
  // Если пользователь использует двойные кавычки без мат. знаков, скорее всего это вопрос (chat)
  if (/"/.test(userInput) && !/[=\+\-\*\/]/.test(userInput)) {
    return { action: "chat" };
  }

  const prompt = `Strictly JSON. 
Is this a math task or variable assignment?
If yes: {"action":"calculate","expression":"${userInput}"}
If no: {"action":"chat"}
User: ${userInput}`;

  try {
    const raw = await queryOllama(prompt);
    const match = raw.replace(/```json|```/g, "").trim().match(/\{.*\}/s);
    return match ? JSON.parse(match[0]) : { action: "chat" };
  } catch {
    return { action: "chat" };
  }
}

function formatResult(result) {
  if (result === undefined) return "Переменная зафиксирована в памяти.";
  if (result && result._data) return `Матрица: ${JSON.stringify(result._data)}`; 
  return `Результат: ${result}`;
}

function buildPrompt(userMessage) {
  // Транслитерируем переменные в подсказке для модели, чтобы она понимала, как они хранятся в коде
  const vars = Object.keys(scope).filter(k => typeof scope[k] !== 'function');
  let prompt = `Ты — эксперт-математик. Кратко отвечай на русском. `;
  if (vars.length > 0) prompt += `В памяти (scope) сейчас: ${vars.join(", ")}. `;
  
  prompt += `\nИстория:\n`;
  dialogueHistory.forEach(msg => {
    prompt += `${msg.role}: ${msg.text}\n`;
  });
  
  prompt += `User: ${userMessage}\nAssistant:`;
  return prompt;
}

askPrompt();